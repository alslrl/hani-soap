import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const model = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', async original => ({ ...await original(), generateText: model.generate }));
import { generateCareStep, prepareClinicalTextJob } from './care-generation';
import { assertCurrentCareMessage } from './care-context';
import { readState, updateState, mutateState } from '@/lib/server/store';
import { unlock, SESSION_COOKIE } from '@/lib/server/auth';

const headers = { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' };
async function request(visitId: string, payload: Record<string, unknown> = {}) {
  const { token } = await unlock(new Request('http://localhost:3000/api/access/unlock', { method: 'POST', headers }), '1234');
  return new Request('http://localhost:3000/api/care/generate', { method: 'POST', headers: { ...headers, cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify({ visitId, ...payload }) });
}
async function approveCurrent(key: 'A' | 'B' = 'A') {
  const before = await readState(); const scenario = before.state.scenario_inputs.find(item => item.demo_key === key)!;
  const patient = before.state.patients.find(item => item.id === scenario.patient_id)!;
  const sourceText = `${patient.display_name}님에게 누울 때 발을 높이는 관리를 설명했다. 문의 연락은 010-1234-5678이다.`;
  const saved = await mutateState({ type: 'soap.save', payload: { visitId: scenario.current_visit_id, sections: { s: '확인한 합성 현재 기록.', o: '', a: '', p: sourceText } } });
  const soap = saved.state.soap_documents.filter(item => item.visit_id === scenario.current_visit_id).at(-1)!;
  await mutateState({ type: 'soap.approve', payload: { visitId: scenario.current_visit_id, soapId: soap.id, revision: soap.revision } });
  return { visitId: scenario.current_visit_id, patientId: patient.id, sourceText, patientName: patient.display_name, soapId: soap.id };
}
function reply(call: { prompt: string }) {
  const input = JSON.parse(call.prompt);
  const plan = input.sources.find((source: { kind: string }) => source.kind === 'approved_plan');
  const report = input.sources.find((source: { kind: string; text: string }) => source.kind === 'care_response' && source.text.includes('불편한 점 있어요'));
  const difficulty = Boolean(report?.text.includes('약 챙기기가 어려워요'));
  const evidence = { source_id: report?.id ?? plan.id, quote: report?.text ?? plan.text };
  return { output: { focus: [{ key: report ? difficulty ? 'practice_difficulty' : 'discomfort_check' : 'general_guidance', title: difficulty ? '복용 실천의 어려움 확인' : report ? '지난 불편의 현재 상태 확인' : '승인 계획의 이해 확인', why: difficulty ? '지난 응답에서 약 챙기기의 어려움을 보고했습니다.' : report ? '불편을 보고한 지난 응답을 현재 확인합니다.' : '승인 계획을 다시 확인합니다.', evidence: [evidence] }], sentences: [{ purpose: 'instruction', source_id: plan.id, quote: plan.text, text: '누울 때 발을 높여 주세요.' }, ...(report ? [{ purpose: 'check_question', source_id: report.id, quote: report.text, text: difficulty ? '지난 응답에서 약 챙기기가 어렵다고 알려주셨는데, 지금 어떤 점이 어려우신가요?' : '지난 응답에서 속이 불편하다고 알려주셨는데 지금도 그런 불편이 있나요?' }] : [])], missing_information: [], review_notes: [] }, totalUsage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 } };
}

describe('contextual care persists reviewed drafts and privacy-safe evidence', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hani-context-care-test-'));
    vi.stubEnv('HANI_DATA_DIR', directory); vi.stubEnv('HANI_STORAGE_MODE', 'local'); vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); vi.stubEnv('DEMO_DEV_PIN', '1234'); vi.stubEnv('DEMO_PIN_HASH', ''); vi.stubEnv('VERCEL', ''); vi.stubEnv('OPENAI_API_KEY', 'test-only-no-provider-call');
    model.generate.mockReset();
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
  it('masks every new contextual text input, restores quotes and keeps only audit counts', async () => {
    const source = await approveCurrent();
    model.generate.mockImplementation(async call => {
      expect(call.prompt).not.toContain(source.patientName); expect(call.prompt).not.toContain('010-1234-5678'); expect(call.prompt).toContain('[HANI_PII:');
      return reply(call);
    });
    const prepared = await prepareClinicalTextJob(await request(source.visitId), 'care');
    await generateCareStep(prepared.jobId);
    const state = (await readState()).state; const job = state.jobs.find(item => item.id === prepared.jobId)!;
    const evidence = job.result!.evidence as { quote: string }[];
    expect(evidence[0].quote).toBe(source.sourceText);
    expect(JSON.stringify(job.result!.text_privacy)).not.toContain(source.patientName);
    expect(JSON.stringify(job.result!.text_privacy)).not.toContain('010-1234-5678');
    expect(JSON.stringify(job.result!.text_privacy)).not.toContain('[HANI_PII:');
    expect(job.result!.care_context_version).toBe('contextual-care-v1');
    expect(state.care_messages.find(item => item.id === job.result!.messageId)).toMatchObject({ status: 'draft', approved_body: null, delivery_mode: 'preview' });
  });
  it('changes source fingerprint and proposed focus when stomach discomfort becomes taking difficulty', async () => {
    const source = await approveCurrent(); model.generate.mockImplementation(async call => reply(call));
    const one = await prepareClinicalTextJob(await request(source.visitId), 'care'); await generateCareStep(one.jobId);
    const before = (await readState()).state;
    await updateState(state => {
      const response = state.care_responses.find(item => item.patient_id === source.patientId && item.option === 'discomfort')!;
      response.detail = 'difficulty_taking'; // Isolated synthetic fixture variant; generation itself never edits responses.
    });
    const two = await prepareClinicalTextJob(await request(source.visitId), 'care'); await generateCareStep(two.jobId);
    const after = (await readState()).state;
    const firstJob = after.jobs.find(item => item.id === one.jobId)!; const secondJob = after.jobs.find(item => item.id === two.jobId)!;
    expect(one.jobId).not.toBe(two.jobId); expect(firstJob.result!.care_input_hash).not.toBe(secondJob.result!.care_input_hash);
    expect(JSON.stringify(firstJob.result!.care_strategy)).toContain('discomfort_check'); expect(JSON.stringify(secondJob.result!.care_strategy)).toContain('practice_difficulty');
    expect(after.soap_documents.find(item => item.id === source.soapId)).toEqual(before.soap_documents.find(item => item.id === source.soapId));
    expect(after.contact_tasks.filter(item => item.status === 'open')).toEqual(before.contact_tasks.filter(item => item.status === 'open'));
  });
  it('flags an input change during generation and refuses approval while preserving the editable draft', async () => {
    const source = await approveCurrent();
    model.generate.mockImplementation(async call => {
      const result = reply(call);
      await updateState(state => {
        const prior = state.care_responses.find(item => item.patient_id === source.patientId)!;
        state.care_responses.push({ ...prior, id: randomUUID(), option: 'taking_well', detail: null, received_at: new Date().toISOString(), event_key: `synthetic:${randomUUID()}` });
      });
      return result;
    });
    const prepared = await prepareClinicalTextJob(await request(source.visitId), 'care'); await generateCareStep(prepared.jobId);
    const state = (await readState()).state; const job = state.jobs.find(item => item.id === prepared.jobId)!;
    expect(job.result!.stale_input).toBe(true);
    const messageId = String(job.result!.messageId);
    expect(state.care_messages.find(item => item.id === messageId)?.status).toBe('draft');
    expect(() => assertCurrentCareMessage(state, messageId)).toThrow('바뀌었습니다');
    expect(state.contact_tasks.some(item => item.patient_id === source.patientId && item.status === 'open')).toBe(true);
  });
  it('pins a confirmed follow-up schedule when the medication start changes during generation', async () => {
    const source = await approveCurrent('B'); const before = (await readState()).state;
    const course = before.medication_courses.find(item => item.patient_id === source.patientId)!;
    model.generate.mockImplementation(async call => {
      const output = reply(call);
      await updateState(state => { state.medication_courses.find(item => item.id === course.id)!.start_date = '2026-10-03'; });
      return output;
    });
    const prepared = await prepareClinicalTextJob(await request(source.visitId, { stage: 'week1', medication_course_id: course.id }), 'care');
    await generateCareStep(prepared.jobId);
    const after = (await readState()).state; const job = after.jobs.find(item => item.id === prepared.jobId)!;
    const message = after.care_messages.find(item => item.id === job.result!.messageId)!;
    expect(message.scheduled_at).toBe('2026-10-09T01:00:00.000Z');
    expect(job.result!.stale_input).toBe(true);
    expect(() => assertCurrentCareMessage(after, message.id)).toThrow();
  });
  it('addresses the guardian and preserves all existing approved messages', async () => {
    const source = await approveCurrent('B'); const before = (await readState()).state;
    model.generate.mockImplementation(async call => { expect(JSON.parse(call.prompt).recipient.kind).toBe('guardian'); return reply(call); });
    const prepared = await prepareClinicalTextJob(await request(source.visitId), 'care'); await generateCareStep(prepared.jobId);
    const after = (await readState()).state; const job = after.jobs.find(item => item.id === prepared.jobId)!;
    expect(after.care_messages.find(item => item.id === job.result!.messageId)?.draft_body).toContain(`${source.patientName} 보호자님`);
    for (const message of before.care_messages.filter(item => item.approved_body !== null)) expect(after.care_messages.find(item => item.id === message.id)).toEqual(message);
    for (const response of before.care_responses) expect(after.care_responses.find(item => item.id === response.id)).toEqual(response);
  });
});
