import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readState, mutateState, updateState, initialState, publicEnvelope } from './store';
import { assertSameOrigin, hashPin, requireSession, unlock, revokeSession, SESSION_COOKIE, verifyPin, assertAiCapacity } from './auth';
import { validateState } from './validation';
import { AppError } from './errors';

let directory: string;
let previous: NodeJS.ProcessEnv;
beforeEach(async () => {
  previous = { ...process.env };
  directory = await mkdtemp(path.join(os.tmpdir(), 'hani-server-test-'));
  process.env.HANI_DATA_DIR = directory;
  Object.assign(process.env, { NODE_ENV: 'test' });
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL', 'APP_ORIGIN', 'DEMO_PIN_HASH', 'DEMO_DEV_PIN', 'OPENAI_API_KEY']) delete process.env[key];
});
afterEach(async () => { process.env = previous; await rm(directory, { recursive: true, force: true }); });
const request = (extra: HeadersInit = {}) => new Request('http://0.0.0.0:3000/api/access/unlock', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', ...extra } });
const action = (type: string, payload: Record<string, unknown>, expectedVersion?: number) => mutateState({ type, payload, expectedVersion });
async function currentVisit() { const { state } = await readState(); return state.scenario_inputs[0].current_visit_id; }
const errorCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test('seed validates and GET does not change visit state', async () => {
  const first = await readState(); validateState(first.state);
  assert.equal(first.storage, 'local'); assert.equal(first.state.patients.length, 2);
  assert.equal(first.state.visits.find((v) => v.id === first.state.scenario_inputs[0].current_visit_id)?.workflow_status, 'waiting');
  assert.equal((await readState()).version, first.version);
});
test('visit start, SOAP approval and finish are independent; approved revisions are preserved', async () => {
  const visitId = await currentVisit();
  await action('visit.start', { visitId });
  let value = await action('soap.save', { visitId, sections: { s: '오늘 현재 통증 확인', o: '', a: '', p: '계획만 확인' } });
  const doc = value.state.soap_documents.filter((v) => v.visit_id === visitId)[0];
  value = await action('soap.approve', { visitId, soapId: doc.id, revision: doc.revision });
  assert.equal(value.state.visits.find((v) => v.id === visitId)?.workflow_status, 'in_progress');
  await action('soap.save', { visitId, soapId: doc.id, sections: { s: '수정한 초안', o: '', a: '', p: '' } });
  value = await action('visit.complete', { visitId });
  assert.deepEqual(value.state.soap_documents.find((v) => v.id === doc.id), { ...doc, status: 'approved', approved_at: value.state.soap_documents.find((v) => v.id === doc.id)!.approved_at, approved_by: 'demo_clinician' });
  assert.equal(value.state.visits.find((v) => v.id === visitId)?.record_status, 'draft');
  await assert.rejects(action('visit.start', { visitId }), errorCode('INVALID_INPUT'));
  value = await action('visit.reopen', { visitId });
  assert.equal(value.state.visits.find((v) => v.id === visitId)?.completed_at, null);
});
test('stale state versions reject atomically and parallel local writers preserve changes', async () => {
  const first = await readState(); const patientId = first.state.patients[0].id;
  await action('patient.note', { patientId, notes: 'first' }, first.version);
  await assert.rejects(action('patient.note', { patientId, notes: 'stale' }, first.version), errorCode('VERSION_CONFLICT'));
  await Promise.all(Array.from({ length: 10 }, (_, i) => action('followup.create', { visitId: first.state.scenario_inputs[0].current_visit_id, title: `check-${i}`, item_key: 'pain' })));
  const last = await readState();
  assert.equal(last.version, first.version + 11); assert.equal(last.state.patients[0].notes, 'first');
  assert.equal(last.state.followup_items.filter((v) => v.title.startsWith('check-')).length, 10);
  assert.equal((await readdir(path.join(directory, 'revisions'))).length, 11);
});
test('unsupported treatment dose is rejected; per-procedure tablet annotations survive switching', async () => {
  const visit_id = await currentVisit();
  await assert.rejects(action('treatment.save', { visit_id, modality: 'pharmacopuncture', dose_ml: 1 }), errorCode('INVALID_INPUT'));
  const strokes = [{ id: 'stroke-1', points: [{ x: 0.2, y: 0.3, t: 10, pressure: 0.5 }], kind: 'memo', created_at: new Date().toISOString() }];
  await action('annotation.save', { visit_id, modality: 'acupuncture', technique: 'standard_acupuncture', view: 'front', strokes });
  await action('annotation.save', { visit_id, modality: 'pharmacopuncture', technique: null, view: 'front', strokes: [] });
  const result = await readState(); assert.equal(result.state.annotations.length, 2); assert.equal(result.state.annotations[0].strokes.length, 1);
  await assert.rejects(action('annotation.save', { ...result.state.annotations[0], revision: 0 }), errorCode('ANNOTATION_CONFLICT'));
  await assert.rejects(action('annotation.save', { visit_id, modality: 'acupuncture', technique: null, view: 'front', strokes: [{ ...strokes[0], points: [{ x: 4, y: 0.5, t: 1 }] }] }), errorCode('INVALID_INPUT'));
});
test('uncoded locations need descriptions and cannot invent acupoint codes', async () => {
  const visit_id = await currentVisit();
  const location = { location_type: 'ashi', acupoint_code: 'BL23', label_ko: null, body_region: 'lumbar', laterality: 'right', location_note: '우측 요부 압통 위치', annotation_id: null, finding_ref: null };
  await assert.rejects(action('treatment.save', { visit_id, modality: 'acupuncture', locations: [location] }), errorCode('INVALID_INPUT'));
  const result = await action('treatment.save', { visit_id, modality: 'acupuncture', body_region: 'lumbar', locations: [{ ...location, acupoint_code: null }], status: 'confirmed' });
  assert.equal(result.state.treatments.at(-1)?.locations?.[0].acupoint_code, null);
});
test('numeric 0 persists as a current NRS; invalid range and other patient answer links reject', async () => {
  const visitId = await currentVisit();
  const fields = { visitId, value: 0, instrument: 'NRS', metric_key: 'pain_intensity', body_region: 'ankle', laterality: 'right', measurement_context: 'current_pain' };
  const value = await action('observation.save', fields); assert.equal(value.state.observations.at(-1)?.value, 0);
  assert.equal(value.state.observations.at(-1)?.series_key, value.state.observations[0].series_key);
  await assert.rejects(action('observation.save', { ...fields, value: 11 }), errorCode('INVALID_INPUT'));
  const foreign = value.state.followup_answers.find((v) => v.patient_id !== value.state.patients[0].id)!;
  await assert.rejects(action('observation.save', { ...fields, followupAnswerId: foreign.id }), errorCode('INVALID_INPUT'));
});
test('mock discomfort always creates contact; duplicate response idempotent, positive reply preserves open task', async () => {
  const visitId = await currentVisit();
  let value = await action('care.save', { visitId, draft_body: '오늘 안내받은 내용을 확인해 주세요.' });
  const messageId = value.state.care_messages.at(-1)!.id;
  await assert.rejects(action('care.sendMock', { messageId }), errorCode('INVALID_INPUT'));
  await action('care.approve', { messageId }); await action('care.sendMock', { messageId });
  value = await action('care.respond', { messageId, option: 'discomfort', eventKey: 'test:event' });
  const response = value.state.care_responses.find((v) => v.event_key === 'test:event')!;
  const task = value.state.contact_tasks.find((v) => v.response_id === response.id)!;
  assert.equal(task.status, 'open'); assert.equal(response.detail, null);
  value = await action('care.respond', { messageId, option: 'discomfort', eventKey: 'test:event' });
  assert.equal(value.state.care_responses.filter((v) => v.event_key === 'test:event').length, 1);
  value = await action('care.respond', { messageId, option: 'taking_well' });
  assert.equal(value.state.contact_tasks.find((v) => v.id === task.id)?.status, 'open');
  await assert.rejects(action('contact.close', { contactId: task.id, resolution_note: '' }), errorCode('INVALID_INPUT'));
  value = await action('contact.close', { contactId: task.id, resolution_note: '모의 연락으로 현재 불편 여부를 확인함.' });
  assert.equal(value.state.contact_tasks.find((v) => v.id === task.id)?.status, 'closed');
});
test('approved message edits create a new draft and keep delivered text fixed', async () => {
  const first = await readState(); const existing = first.state.care_messages.find((v) => v.status === 'sent')!;
  const next = await action('care.save', { messageId: existing.id, draft_body: '새 초안' });
  assert.equal(next.state.care_messages.find((v) => v.id === existing.id)?.approved_body, existing.approved_body);
  assert.equal(next.state.care_messages.at(-1)?.status, 'draft'); assert.notEqual(next.state.care_messages.at(-1)?.id, existing.id);
});
test('raw transcript and approved SOAP cannot be changed by internal worker updates', async () => {
  const first = await readState(); const approved = first.state.soap_documents[0];
  await assert.rejects(updateState((state) => { state.soap_documents.find((v) => v.id === approved.id)!.sections.s = 'overwritten'; }), errorCode('IMMUTABLE_SOURCE'));
  const result = await readState(); assert.equal(result.version, first.version);
});
test('visit finish waits for recording preservation', async () => {
  const visitId = await currentVisit(); await action('visit.start', { visitId });
  await updateState((state) => { state.audioSessions.push({ id: '4db06311-aa93-4d08-b921-7f540b43990e', clinic_id: state.clinic.id, visit_id: visitId, status: 'recording', started_at: new Date().toISOString() }); });
  await assert.rejects(action('visit.complete', { visitId }), errorCode('INVALID_INPUT'));
});
test('PIN sessions are opaque, expire/revoke, and reject cross-origin writes', async () => {
  const { token, session } = await unlock(request(), '1234');
  assert.notEqual(token, '1234'); assert.equal(token.length, 43);
  assert.equal((await requireSession(request({ cookie: `${SESSION_COOKIE}=${token}` }))).id, session.id);
  assert.throws(() => assertSameOrigin(request({ origin: 'https://evil.example' })), errorCode('ORIGIN_REJECTED'));
  assert.throws(() => assertSameOrigin(request({ origin: '' })), errorCode('ORIGIN_REJECTED'));
  await revokeSession(request({ cookie: `${SESSION_COOKIE}=${token}` }));
  await assert.rejects(requireSession(request({ cookie: `${SESSION_COOKIE}=${token}` })), errorCode('AUTH_REQUIRED'));
});
test('PIN failure rate and per-session AI rate are persistent across requests', async () => {
  for (let i = 0; i < 5; i++) await assert.rejects(unlock(request(), '0000'), errorCode('PIN_INVALID'));
  await assert.rejects(unlock(request(), '1234'), errorCode('PIN_RATE_LIMIT'));
  for (let i = 0; i < 5; i++) await assertAiCapacity('test-session');
  await assert.rejects(assertAiCapacity('test-session'), errorCode('AI_RATE_LIMIT'));
});
test('PIN configuration rotates sessions and production has no default PIN', async () => {
  const { token } = await unlock(request(), '1234'); process.env.DEMO_PIN_HASH = hashPin('4321');
  assert.equal(verifyPin('4321'), true); assert.equal(verifyPin('1234'), false);
  await assert.rejects(requireSession(request({ cookie: `${SESSION_COOKIE}=${token}` })), errorCode('AUTH_REQUIRED'));
  delete process.env.DEMO_PIN_HASH; Object.assign(process.env, { NODE_ENV: 'production' });
  assert.throws(() => verifyPin('1234'), errorCode('PIN_NOT_CONFIGURED'));
  process.env.VERCEL = '1'; await assert.rejects(readState(), errorCode('STORAGE_NOT_CONFIGURED'));
});
test('public API does not expose upload hashes or session ownership keys', async () => {
  const state = await initialState();
  state.recordings.push({ id: '1', clinic_id: state.clinic.id, visit_id: state.visits[0].id, source: 'upload', filename: 'test.wav', mime_type: 'audio/wav', size_bytes: 1, object_path: 'test', created_at: new Date().toISOString(), status: 'uploading', upload_token_hash: 'secret', upload_expires_at: 'private' });
  state.audioSessions.push({ id: '2', clinic_id: state.clinic.id, visit_id: state.visits[0].id, status: 'recording', started_at: new Date().toISOString(), owner_session_id: 'private-owner' });
  const result = publicEnvelope({ state, version: 1, storage: 'local', capabilities: { ai: false, live: false } });
  assert.equal(result.state.recordings[0].upload_token_hash, undefined); assert.equal(result.state.audioSessions[0].owner_session_id, undefined);
  assert.equal(state.recordings[0].upload_token_hash, 'secret');
});

test('a newly generated first SOAP cannot be overwritten by an editor based on empty state', async () => {
  const visitId = await currentVisit();
  await action('soap.save', { visitId, expectedSoapId: null, sections: { s: '첫 초안', o: '', a: '', p: '' } });
  await assert.rejects(action('soap.save', { visitId, expectedSoapId: null, sections: { s: '오래된 입력', o: '', a: '', p: '' } }), errorCode('DOCUMENT_CONFLICT'));
});
test('measurement series cannot mix different regions or instruments', async () => {
  const first = await readState(); const visitId = first.state.scenario_inputs[0].current_visit_id;
  await assert.rejects(action('observation.save', { visitId, value: 2, metric_key: 'pain_intensity', instrument: 'NRS', body_region: 'lumbar', laterality: 'right', measurement_context: 'current_pain', series_key: first.state.observations[0].series_key }), errorCode('INVALID_INPUT'));
});

test('expired PIN sessions cannot read patient state', async () => {
  const { token } = await unlock(request(), '1234');
  const file = path.join(directory, 'security.json');
  const security = JSON.parse(await readFile(file, 'utf8'));
  security.sessions[0].expires_at = new Date(Date.now() - 1_000).toISOString();
  await writeFile(file, JSON.stringify(security));
  await assert.rejects(requireSession(request({ cookie: `${SESSION_COOKIE}=${token}` })), errorCode('AUTH_REQUIRED'));
});
test('new transcript revisions block approval of SOAP generated from old inputs', async () => {
  const visitId = await currentVisit();
  const firstTranscriptId = 'ee479c30-1d56-44a2-8d24-eab34900960e';
  await updateState((state) => {
    state.transcripts.push({ id: firstTranscriptId, clinic_id: state.clinic.id, visit_id: visitId, revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: '원본 전사', segments: [{ id: 'd8cb2470-c059-41cc-b370-581a4ea36cb2', ordinal: 1, speaker: 'clinician', text: '원본 전사', start_ms: null, end_ms: null }], origin: 'manual_demo' });
    state.soap_documents.push({ id: 'c0532b96-d44f-46f1-8143-69ee6fe6388b', clinic_id: state.clinic.id, visit_id: visitId, revision: 1, input_transcript_id: firstTranscriptId, status: 'draft', sections: { s: '첫 입력 기준', o: '', a: '', p: '' }, source_refs: [], approved_at: null, approved_by: null, origin: 'manual_demo' });
    state.transcripts.push({ id: '13a42626-1013-4685-94ce-c9d29bda832d', clinic_id: state.clinic.id, visit_id: visitId, revision: 2, status: 'reviewed', source_asset_key: 'manual_seed', text: '검토한 전사', segments: [{ id: '67f39175-1127-462b-988f-66e5d007a4cb', ordinal: 1, speaker: 'clinician', text: '검토한 전사', start_ms: null, end_ms: null }], origin: 'manual_demo' });
  });
  await assert.rejects(action('soap.approve', { visitId }), errorCode('STALE_SOAP_INPUT'));
});

test('changing handwriting clears recognition approval while prior source revision remains archived', async () => {
  const visit_id = await currentVisit();
  let result = await action('annotation.save', { visit_id, modality: 'acupuncture', technique: null, view: 'front', strokes: [] });
  const annotation = result.state.annotations[0];
  result = await action('annotation.review', { id: annotation.id, revision: annotation.revision, extracted_text: '수기로 검토한 메모' });
  assert.equal(result.state.annotations[0].extraction_reviewed, true);
  const priorVersion = result.version;
  result = await action('annotation.save', { ...result.state.annotations[0], strokes: [{ id: 'memo-2', kind: 'memo', created_at: new Date().toISOString(), points: [{ x: 0.2, y: 0.2, t: 1 }] }] });
  assert.equal(result.state.annotations[0].extraction_reviewed, false); assert.equal(result.state.annotations[0].extracted_text, null);
  const archived = JSON.parse(await readFile(path.join(directory, 'revisions', `${priorVersion}.json`), 'utf8'));
  assert.equal(archived.state.annotations[0].extraction_reviewed, true);
});
