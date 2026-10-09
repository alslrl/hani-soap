import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST as startJob } from '../../app/api/jobs/route';
import { POST as review } from '../../app/api/jobs/review/route';
import { readState, updateState } from './store';
import { unlock, SESSION_COOKIE } from './auth';
import type { Transcript } from '../types';
import { validateCorrections, type DictionaryTerm } from '../ai/correction';

let directory: string, cookie: string, visitId: string, raw: Transcript;
let previous: NodeJS.ProcessEnv, originalFetch: typeof fetch;
const request = (body: unknown, headers: HeadersInit = {}) => new Request('http://localhost:3000/api/jobs', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
beforeEach(async () => {
  previous = { ...process.env }; originalFetch = globalThis.fetch;
  directory = await mkdtemp(path.join(os.tmpdir(), 'hani-correction-recheck-'));
  Object.assign(process.env, { HANI_DATA_DIR: directory, HANI_STORAGE_MODE: 'local', HANI_SYNC_AI: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'not-a-real-key-never-sent' });
  for (const key of ['VERCEL', 'APP_ORIGIN', 'DEMO_PIN_HASH', 'DEMO_DEV_PIN']) delete process.env[key];
  globalThis.fetch = async () => { throw new Error('Network access is forbidden in this test'); };
  const login = await unlock(request({}), '1234'); cookie = `${SESSION_COOKIE}=${login.token}`;
  const { state } = await readState(); visitId = state.scenario_inputs[0].current_visit_id;
  raw = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: '보중익기탕을 처방합니다.', segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: '보중익기탕을 처방합니다.', start_ms: 0, end_ms: 1000 }], origin: 'manual_demo' };
  await updateState(next => { next.transcripts.push(raw); });
});
afterEach(async () => { globalThis.fetch = originalFetch; process.env = previous; await rm(directory, { recursive: true, force: true }); });

test('stored-text recheck does not record audio, rewrite a source or regenerate SOAP', async () => {
  const before = await readState();
  const response = await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }));
  assert.equal(response.status, 201); const body = await response.json();
  const after = await readState(); const job = after.state.jobs.find(item => item.id === body.jobId)!;
  assert.equal(job.status, 'waiting_review'); assert.equal(job.stage, 'correction_review_needed'); assert.equal(job.recording_id, null);
  assert.equal(job.result?.task, 'correction_recheck'); assert.equal(job.result?.correction_model, null);
  assert.deepEqual(after.state.transcripts, before.state.transcripts); assert.deepEqual(after.state.soap_documents, before.state.soap_documents);
  assert.deepEqual(after.state.recordings, before.state.recordings); assert.deepEqual(after.state.visits, before.state.visits);
  const repeated = await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }));
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).jobId, job.id);
  assert.equal((await readState()).version, after.version);
});
test('recheck enforces PIN and Origin before accepting work', async () => {
  assert.equal((await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }, { cookie: '' }))).status, 401);
  assert.equal((await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }, { origin: 'https://untrusted.example' }))).status, 403);
});
test('recheck cannot cross visits or run from an outdated transcript', async () => {
  const { state } = await readState(); const otherVisit = state.scenario_inputs[1].current_visit_id;
  assert.equal((await startJob(request({ visitId: otherVisit, transcriptId: raw.id, kind: 'correction' }))).status, 400);
  await updateState(next => { next.transcripts.push({ ...raw, id: randomUUID(), revision: 2, status: 'reviewed' }); });
  const stale = await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }));
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'TRANSCRIPT_VERSION_CONFLICT');
});
test('a stale review cannot overwrite newer text even if it submits the latest revision number', async () => {
  const response = await startJob(request({ visitId, transcriptId: raw.id, kind: 'correction' }));
  const { jobId } = await response.json();
  await updateState(next => { next.transcripts.push({ ...raw, id: randomUUID(), revision: 2, status: 'reviewed', text: '다른 화면에서 검토한 최신 원문' }); });
  const before = await readState();
  const rejected = await review(request({ jobId, decisions: [], expectedTranscriptRevision: 2 }));
  assert.equal(rejected.status, 409); assert.equal((await rejected.json()).code, 'TRANSCRIPT_VERSION_CONFLICT');
  assert.deepEqual((await readState()).state.transcripts, before.state.transcripts);
});
async function unclearJob() {
  const text = '한의학적으로 귀패기어라고 설명했습니다.';
  const source = { ...raw, id: randomUUID(), revision: 2, text, segments: [{ ...raw.segments[0], id: randomUUID(), text }] };
  const start = text.indexOf('귀패기어');
  const candidate: DictionaryTerm = { id: 'source-bipe', term: '비폐기허증', aliases: ['비폐기허'], matched_form: '비폐기허', kind: 'pattern', hanja: '脾肺氣虛證', source_ids: ['source'], sources: [{ id: 'source', title: '사전 근거', original: '비폐기허증' }] };
  const span = { id: 'unclear-span', start, end: start + 4, original: '귀패기어', candidates: [candidate] };
  const corrections = validateCorrections(text, [span], [{ span_id: span.id, decision: 'unclear', candidate_id: null, reason: '원음 확인 필요' }]);
  const jobId = randomUUID(), now = new Date().toISOString();
  await updateState(next => { next.transcripts.push(source); next.jobs.push({ id: jobId, clinic_id: source.clinic_id, visit_id: visitId, kind: 'transcription', status: 'waiting_review', stage: 'correction_review_needed', input_hash: jobId, created_at: now, updated_at: now, result: { transcriptId: source.id, corrections, correction_spans: [span] } }); });
  return { source, jobId, candidate };
}
test('a clinician can choose a bound dictionary candidate when the model abstains', async () => {
  const { source, jobId, candidate } = await unclearJob(); const before = await readState();
  const response = await review(request({ jobId, decisions: [{ span_id: 'unclear-span', status: 'accepted', candidate_id: candidate.id }], expectedTranscriptRevision: 2 }));
  assert.equal(response.status, 200); const { transcriptId } = await response.json();
  const after = await readState(); const reviewed = after.state.transcripts.find(item => item.id === transcriptId)!;
  assert.equal(reviewed.text, '한의학적으로 비폐기허라고 설명했습니다.'); assert.equal(reviewed.revision, 3);
  assert.deepEqual(after.state.transcripts.find(item => item.id === source.id), source);
  assert.deepEqual(after.state.soap_documents, before.state.soap_documents);
  const result = after.state.jobs.find(item => item.id === jobId)!.result!;
  assert.equal((result.model_corrections as { decision: string }[])[0].decision, 'unclear');
});
test('manual selection cannot submit an invented candidate or accept uncertainty without a selection', async () => {
  const { jobId } = await unclearJob(); const before = await readState();
  for (const candidate_id of ['invented', undefined]) {
    const response = await review(request({ jobId, decisions: [{ span_id: 'unclear-span', status: 'accepted', candidate_id }], expectedTranscriptRevision: 2 }));
    assert.equal(response.status, 400);
  }
  assert.deepEqual((await readState()).state.transcripts, before.state.transcripts);
});
