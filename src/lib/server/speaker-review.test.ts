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
  directory = await mkdtemp(path.join(os.tmpdir(), 'hani-speaker-review-'));
  Object.assign(process.env, { HANI_DATA_DIR: directory, HANI_STORAGE_MODE: 'local', HANI_SYNC_AI: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'not-a-real-key-never-sent' });
  for (const key of ['VERCEL', 'APP_ORIGIN', 'DEMO_PIN_HASH', 'DEMO_DEV_PIN']) delete process.env[key];
  globalThis.fetch = async () => { throw new Error('Network access is forbidden in this test'); };
  const login = await unlock(request({}), '1234'); cookie = `${SESSION_COOKIE}=${login.token}`;
  const { state } = await readState(); visitId = state.scenario_inputs[0].current_visit_id;
  raw = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: '보중익기탕을 처방합니다.', segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: '보중익기탕을 처방합니다.', start_ms: 0, end_ms: 1000 }], origin: 'manual_demo' };
  const texts = ['어디가 아프세요?', '아이가 밤마다 소변을 봐요.', '어제도 그랬어요.'];
  raw.text = texts.join('\n');
  raw.segments = texts.map((text, index) => { const id = randomUUID(); return { id, source_segment_id: id, ordinal: index + 1, raw_speaker: index ? 'B' : 'A', speaker: index ? 'guardian' as const : 'clinician' as const, text, start_ms: index * 1000, end_ms: (index + 1) * 1000 }; });
  raw.speaker_roles = { A: { role: 'clinician', source: 'inferred' }, B: { role: 'guardian', source: 'inferred' } };
  await updateState(next => { next.transcripts.push(raw); next.jobs.push({ id: 'ac8146de-9166-4d7d-89f7-3254be7a45df', clinic_id: raw.clinic_id, visit_id: visitId, kind: 'transcription', status: 'waiting_review', stage: 'review_needed', input_hash: 'speakers', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), result: { transcriptId: raw.id, corrections: [] } }); });
});
afterEach(async () => { globalThis.fetch = originalFetch; process.env = previous; await rm(directory, { recursive: true, force: true }); });


test('review stores bulk roles and overrides across repeated revisions and correction rechecks without changing raw or approved SOAP', async () => {
  const before = await readState();
  const first = await review(request({ jobId: 'ac8146de-9166-4d7d-89f7-3254be7a45df', speakerGroups: { B: 'patient' }, speakers: { [raw.segments[1].id]: 'guardian' }, expectedTranscriptRevision: 1 }));
  assert.equal(first.status, 200);
  const firstId = (await first.json()).transcriptId;
  let state = (await readState()).state;
  const reviewed = state.transcripts.find(t => t.id === firstId)!;
  assert.deepEqual(reviewed.segments.map(s => s.speaker), ['clinician', 'guardian', 'patient']);
  assert.deepEqual(reviewed.segments.map(s => s.raw_speaker), ['A', 'B', 'B']);
  assert.equal(reviewed.segments[1].source_segment_id, raw.segments[1].id);
  const second = await review(request({ jobId: 'ac8146de-9166-4d7d-89f7-3254be7a45df', speakerGroups: { B: 'unknown' }, expectedTranscriptRevision: 2 }));
  assert.equal(second.status, 200);
  state = (await readState()).state;
  const latest = state.transcripts.find(t => t.id === state.jobs.find(j => j.id === 'ac8146de-9166-4d7d-89f7-3254be7a45df')!.result!.reviewedTranscriptId)!;
  assert.deepEqual(latest.segments.map(s => s.speaker), ['clinician', 'guardian', 'unknown']);
  const recheck = await startJob(request({ visitId, transcriptId: latest.id, kind: 'correction' }));
  assert.equal(recheck.status, 201);
  const jobId = (await recheck.json()).jobId;
  const third = await review(request({ jobId, speakerGroups: { B: 'patient' }, speakers: { [latest.segments[1].id]: null }, expectedTranscriptRevision: 3 }));
  assert.equal(third.status, 200);
  state = (await readState()).state;
  const thirdId = (await third.json()).transcriptId;
  assert.deepEqual(state.transcripts.find(t => t.id === thirdId)!.segments.map(s => s.speaker), ['clinician', 'patient', 'patient']);
  assert.deepEqual(state.transcripts.find(t => t.id === raw.id), raw);
  assert.deepEqual(state.soap_documents, before.state.soap_documents);
});
test('review rejects invented groups and segment IDs before creating a revision', async () => {
  for (const body of [{ speakerGroups: { C: 'patient' } }, { speakers: { invented: 'patient' } }, { speakerGroups: { A: 'doctor' } }]) {
    assert.equal((await review(request({ jobId: 'ac8146de-9166-4d7d-89f7-3254be7a45df', ...body, expectedTranscriptRevision: 1 }))).status, 400);
  }
  assert.equal((await readState()).state.transcripts.filter(t => t.visit_id === visitId).length, 1);
});
