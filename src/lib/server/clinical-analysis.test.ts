import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST as startAnalysis } from '../../app/api/clinical-analysis/route';
import { applyAction } from './actions';
import { prepareClinicalAnalysis } from '../ai/clinical-analysis-jobs';
import { validateClinicalAnalysis, type ClinicalAnalysisOutput } from '../ai/clinical-analysis';
import { POST as review } from '../../app/api/clinical-analysis/review/route';
import { readState, updateState } from './store';
import { unlock, SESSION_COOKIE } from './auth';
import type { Transcript } from '../types';
import { validateCorrections, type DictionaryTerm } from '../ai/correction';

let directory: string, cookie: string, visitId: string, raw: Transcript;
let previous: NodeJS.ProcessEnv, originalFetch: typeof fetch;
const request = (body: unknown, headers: HeadersInit = {}) => new Request('http://localhost:3000/api/jobs', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
beforeEach(async () => {
  previous = { ...process.env }; originalFetch = globalThis.fetch;
  directory = await mkdtemp(path.join(os.tmpdir(), 'hani-analysis-review-'));
  Object.assign(process.env, { HANI_DATA_DIR: directory, HANI_STORAGE_MODE: 'local', HANI_SYNC_AI: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'not-a-real-key-never-sent' });
  for (const key of ['VERCEL', 'APP_ORIGIN', 'DEMO_PIN_HASH', 'DEMO_DEV_PIN']) delete process.env[key];
  globalThis.fetch = async () => { throw new Error('Network access is forbidden in this test'); };
  const login = await unlock(request({}), '1234'); cookie = `${SESSION_COOKIE}=${login.token}`;
  const { state } = await readState(); visitId = state.scenario_inputs[0].current_visit_id;
  raw = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: '보중익기탕을 처방합니다.', segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: '보중익기탕을 처방합니다.', start_ms: 0, end_ms: 1000 }], origin: 'manual_demo' };
  raw.text = '현재 통증은 0점이에요. 약이 효과가 있을지 걱정돼요.';
  raw.segments = [{ ...raw.segments[0], text: raw.text, speaker: 'patient' }];
  const evidence = [{ segment_id: raw.segments[0].id, quote: raw.text }];
  const output: ClinicalAnalysisOutput = { answers: [{ item_key: 'pain', subitem_key: 'current_pain', text: raw.text, change: null, temporal: 'current', evidence }], measurements: [{ item_key: 'pain', subitem_key: 'current_pain', instrument: 'NRS', value: 0, unit: 'score', body_region: 'ankle', laterality: 'right', activity_key: null, measurement_context: 'current_pain', temporal: 'current', evidence }], signals: [{ category: 'worry', topic: '효과 걱정', evidence }], missing_questions: [] };
  await updateState(next => { next.transcripts.push(raw); next.jobs.push({ id: 'ac8146de-9166-4d7d-89f7-3254be7a45df', clinic_id: raw.clinic_id, visit_id: visitId, kind: 'analysis', status: 'waiting_review', stage: 'clinical_analysis_review', input_hash: 'analysis-test', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), result: { task: 'clinical_analysis', patientId: next.visits.find(v => v.id === visitId)!.patient_id, transcriptId: raw.id, input_transcript_revision: raw.revision, stale_input: false, reviewed_signals: [], ...validateClinicalAnalysis(output, raw) } }); });
});
afterEach(async () => { globalThis.fetch = originalFetch; process.env = previous; await rm(directory, { recursive: true, force: true }); });



const jobId = 'ac8146de-9166-4d7d-89f7-3254be7a45df';
async function bodyFor(kind: string) { const { state } = await readState(); const job = state.jobs.find(j => j.id === jobId)!; const candidate = (job.result!.candidates as {id:string;kind:string}[]).find(c => c.kind === kind)!; return { jobId, candidateId: candidate.id, visitId, patientId: state.visits.find(v => v.id === visitId)!.patient_id, expectedTranscriptRevision: 1, decision: 'confirm' }; }
test('confirm, edit and duplicate reviews atomically save quotes, preserve current zero and approved sources', async () => {
  const before = await readState();
  const answer = await bodyFor('answer');
  assert.equal((await review(request({ ...answer, edit: { text: '현재 통증 없음. 의료진 확인.' } }))).status, 200);
  const repeated = await review(request({ ...answer, edit: { text: '현재 통증 없음. 의료진 확인.' } })); assert.equal((await repeated.json()).reused, true);
  const metric = await bodyFor('measurement');
  assert.equal((await review(request(metric))).status, 200); assert.equal((await review(request(metric))).status, 200);
  const signal = await bodyFor('signal'); assert.equal((await review(request(signal))).status, 200);
  const { state } = await readState();
  const saved = state.followup_answers.find(a => a.visit_id === visitId && a.item_key === 'pain' && a.subitem_key === 'current_pain')!;
  assert.equal(saved.answer_text, '현재 통증 없음. 의료진 확인.'); assert.equal(saved.confirmation_status, 'confirmed');
  assert.equal(saved.source_refs.filter(r => r.kind === 'provided_transcript').length, 1); assert.equal(saved.source_refs.filter(r => r.kind === 'manual').length, 1);
  const metrics = state.observations.filter(o => o.visit_id === visitId); assert.equal(metrics.length, 1); assert.equal(metrics[0].value, 0);
  const signals = state.jobs.find(j => j.id === jobId)!.result!.reviewed_signals as {source_refs: {kind:string}[]}[];
  assert.equal(signals.length, 1); assert.ok(signals[0].source_refs.every(r => r.kind === 'provided_transcript'));
  assert.deepEqual(state.transcripts, before.state.transcripts); assert.deepEqual(state.soap_documents, before.state.soap_documents);
});
test('existing clinician entries require explicit replacement and a matching current conflict hash', async () => {
  const body = await bodyFor('answer');
  await updateState(state => { const existing = state.followup_answers.find(a => a.visit_id === visitId && a.item_key === 'pain' && a.subitem_key === 'current_pain'); if (existing) { existing.answer_text = '의료진 직접 입력 3점'; existing.confirmation_status = 'confirmed'; return; } const id = randomUUID(); state.followup_answers.push({ id, clinic_id: state.clinic.id, patient_id: body.patientId, visit_id: visitId, item_key: 'pain', subitem_key: 'current_pain', question_text: '현재 통증', answer_text: '의료진 직접 입력 3점', change: null, confirmation_status: 'confirmed', applicability: 'applicable', comparison_visit_id: null, source_refs: [{ kind: 'manual', source_id: null, quote: null, origin: 'manual_demo' }], review_status: 'reviewed', origin: 'manual_demo' }); });
  const conflict = await review(request(body)); assert.equal(conflict.status, 409); const details = (await conflict.json()).details;
  assert.equal((await review(request({ ...body, allowOverwrite: true, expectedTargetHash: 'wrong' }))).status, 409);
  assert.equal((await review(request({ ...body, allowOverwrite: true, expectedTargetHash: details.targetHash }))).status, 200);
  const { state } = await readState(); assert.equal(state.followup_answers.filter(a => a.visit_id === visitId && a.subitem_key === 'current_pain').length, 1);
  const candidate = (state.jobs.find(j => j.id === jobId)!.result!.candidates as {id:string;replaced_target?:{answer:{answer_text:string}}}[]).find(c => c.id === body.candidateId)!;
  assert.equal(candidate.replaced_target!.answer.answer_text, '의료진 직접 입력 3점');
});
test('review rejects stale versions, cross-patient, missing PIN and cross-origin writes without clinical mutation', async () => {
  const body = await bodyFor('answer'); const before = await readState();
  assert.equal((await review(request(body, {cookie:''}))).status, 401);
  assert.equal((await review(request(body, {origin:'https://untrusted.example'}))).status, 403);
  assert.equal((await review(request({ ...body, patientId: randomUUID() }))).status, 404);
  assert.equal((await review(request({ ...body, expectedTranscriptRevision: 99 }))).status, 409);
  await updateState(state => { state.transcripts.push({ ...raw, id: randomUUID(), revision: 2 }); });
  assert.equal((await review(request(body))).status, 409);
  const after = await readState(); assert.deepEqual(after.state.followup_answers, before.state.followup_answers); assert.deepEqual(after.state.observations, before.state.observations);
});
test('rejection stores no clinical entries, repeated rejection is idempotent and prepare uses latest-source idempotence', async () => {
  const body = await bodyFor('answer'); const before = await readState();
  assert.equal((await review(request({ ...body, decision: 'reject' }))).status, 200);
  assert.equal((await review(request({ ...body, decision: 'reject' }))).status, 200);
  assert.equal((await review(request(body))).status, 409);
  assert.deepEqual((await readState()).state.followup_answers, before.state.followup_answers);
  const prepared = await prepareClinicalAnalysis(visitId, raw.id);
  const duplicate = await prepareClinicalAnalysis(visitId, raw.id); assert.equal(duplicate.jobId, prepared.jobId); assert.equal(duplicate.reused, true);
  const startBody = { visitId, patientId: body.patientId, transcriptId: raw.id, expectedTranscriptRevision: 1 };
  assert.equal((await startAnalysis(request(startBody))).status, 200);
  assert.equal((await startAnalysis(request(startBody,{cookie:''}))).status, 401);
  assert.equal((await startAnalysis(request(startBody,{origin:'https://untrusted.example'}))).status, 403);
});

test('measurement edits have manual provenance; conflicts protect existing values and invalid edits are atomic', async () => {
  const body = await bodyFor('measurement');
  const before = await readState();
  assert.equal((await review(request({ ...body, edit: { value: 11 } }))).status, 400);
  assert.deepEqual((await readState()).state.observations, before.state.observations);
  await updateState(state => { applyAction(state, { type: 'observation.save', payload: { visitId, instrument: 'NRS', value: 5, unit: 'score', body_region: 'ankle', laterality: 'right', measurement_context: 'current_pain' } }); });
  const response = await review(request(body)); assert.equal(response.status, 409);
  const { details } = await response.json();
  const edited = { ...body, edit: { value: 2 }, allowOverwrite: true, expectedTargetHash: details.targetHash };
  assert.equal((await review(request(edited))).status, 200); assert.equal((await review(request(edited))).status, 200);
  const { state } = await readState(); const current = state.observations.filter(o => o.visit_id === visitId);
  assert.deepEqual(current.map(o => o.value), [5,2]); assert.equal(current[1].source_refs.filter(ref => ref.kind === 'manual').length, 1); assert.equal(current[1].source_refs.filter(ref => ref.kind === 'provided_transcript').length, 1);
});
