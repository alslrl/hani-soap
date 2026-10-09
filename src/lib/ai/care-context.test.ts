import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import seed from '../../../data/demo/patients.seed.json';
import type { AppState, CareMessage, CareResponse, RuntimeJob } from '@/lib/types';
import { CARE_CONTEXT_VERSION, collectCareInputs, fingerprintCareInputs, assertCurrentCareMessage, careCommunicationCandidates } from './care-context';
import { validateContextualCare, type ContextualCareGeneration } from './care-generation';

const asOf = '2026-10-09T03:00:00.000Z';
function fixture(key: 'A' | 'B' = 'A'): AppState {
  const state = { ...structuredClone(seed), annotations: [], recordings: [], jobs: [], audioSessions: [], live_events: [], liveProcedureEvents: [] } as unknown as AppState;
  const scenario = state.scenario_inputs.find(item => item.demo_key === key)!;
  const old = state.soap_documents.find(soap => soap.status === 'approved' && state.visits.find(visit => visit.id === soap.visit_id)?.patient_id === scenario.patient_id)!;
  state.soap_documents.push({ ...old, id: randomUUID(), visit_id: scenario.current_visit_id, revision: 1, approved_at: '2026-10-09T02:00:00.000Z', approved_by: 'synthetic-test-clinician', sections: { s: '오늘 상태를 확인한 합성 기록.', o: '', a: '', p: '누울 때 발을 높이고 무리한 걷기는 쉬도록 안내했다.' } });
  return state;
}
function options(state: AppState, key: 'A' | 'B' = 'A') {
  return { visitId: state.scenario_inputs.find(item => item.demo_key === key)!.current_visit_id, stage: 'visit_summary' as const, asOf };
}
function replaceResponses(state: AppState, detail: CareResponse['detail']) {
  const scenario = state.scenario_inputs[0];
  state.care_responses = state.care_responses.filter(item => item.patient_id !== scenario.patient_id);
  state.contact_tasks = state.contact_tasks.filter(item => item.patient_id !== scenario.patient_id);
  const message = state.care_messages.find(item => item.patient_id === scenario.patient_id && item.stage === 'day3')!;
  const response: CareResponse = { id: randomUUID(), clinic_id: state.clinic.id, patient_id: scenario.patient_id, message_id: message.id, option: 'discomfort', detail, received_at: '2026-10-09T01:00:00Z', source: 'demo_simulation', event_key: 'synthetic-test', origin: 'synthetic_response' };
  state.care_responses.push(response);
  state.contact_tasks.push({ id: randomUUID(), clinic_id: state.clinic.id, patient_id: scenario.patient_id, response_id: response.id, reason: '지난 불편 응답을 직접 확인할 연락이 필요함.', status: 'open', resolution_note: null, closed_by: null, closed_at: null, origin: 'synthetic_response' });
}
function supportedResult(snapshot: ReturnType<typeof collectCareInputs>): ContextualCareGeneration {
  const plan = snapshot.sources.find(source => source.kind === 'approved_plan')!;
  return { focus: [{ key: 'general_guidance', title: '안내한 관리의 이해 확인', why: '승인 계획을 다시 설명합니다.', evidence: [{ source_id: plan.id, quote: plan.text }] }], sentences: [{ text: '누울 때 발을 높여 주세요.', purpose: 'instruction', source_id: plan.id, quote: plan.text }], missing_information: [], review_notes: [] };
}

describe('dated same-patient care inputs', () => {
  it('excludes other-patient records, future visits and responses received after the cutoff', () => {
    const state = fixture(); const input = options(state); const futureId = randomUUID();
    const visit = state.visits.find(item => item.id === input.visitId)!;
    state.visits.push({ ...visit, id: futureId, visit_no: 5, scheduled_at: '2026-10-10T00:00:00Z' });
    state.soap_documents.push({ ...state.soap_documents.at(-1)!, id: randomUUID(), visit_id: futureId, sections: { s: 'future-private-marker', o: '', a: '', p: 'future-plan-marker' } });
    const old = state.care_responses.find(item => item.patient_id === visit.patient_id)!;
    state.care_responses.push({ ...old, id: randomUUID(), received_at: '2026-10-09T04:00:00Z', event_key: 'future-response', detail: 'difficulty_taking' });
    const snapshot = collectCareInputs(state, input);
    expect(snapshot.sources.every(source => state.visits.find(item => item.id === source.visit_id)?.patient_id === visit.patient_id)).toBe(true);
    expect(snapshot.sources.some(source => source.visit_id === futureId)).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('future-response');
    expect(JSON.stringify(snapshot)).not.toContain('future-plan-marker');
    expect(snapshot.sources.filter(source => source.kind === 'care_response').every(source => Date.parse(source.date) <= Date.parse(asOf))).toBe(true);
  });
  it('keeps reviewed historical values dated instead of copying them into today facts', () => {
    const state = fixture(); const snapshot = collectCareInputs(state, options(state));
    const measured = snapshot.sources.filter(source => source.kind === 'observation');
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.every(source => source.temporal === 'past_record')).toBe(true);
    state.observations[0].review_status = 'draft';
    expect(collectCareInputs(state, options(state)).sources.some(source => source.id === `observation:${state.observations[0].id}`)).toBe(false);
  });
  it('separates guardian recipient and frequency from adult pain context', () => {
    const state = fixture('B'); const snapshot = collectCareInputs(state, options(state, 'B'));
    expect(snapshot.recipient.kind).toBe('guardian');
    expect(snapshot.sources.some(source => source.kind === 'observation' && source.text.includes('FREQUENCY'))).toBe(true);
    expect(snapshot.sources.some(source => source.kind === 'observation' && source.text.includes('NRS'))).toBe(false);
  });
  it('reflects stomach discomfort versus taking difficulty with the same approved plan', () => {
    const stomach = fixture(); replaceResponses(stomach, 'stomach_discomfort');
    const forgetting = structuredClone(stomach); replaceResponses(forgetting, 'difficulty_taking');
    const one = collectCareInputs(stomach, options(stomach)); const two = collectCareInputs(forgetting, options(forgetting));
    expect(one.approved_soap).toEqual(two.approved_soap);
    expect(careCommunicationCandidates(one).map(item => item.key)).not.toContain('practice_difficulty');
    expect(careCommunicationCandidates(two).map(item => item.key)).toContain('practice_difficulty');
    expect(fingerprintCareInputs(one)).not.toBe(fingerprintCareInputs(two));
  });
  it('does not let a positive response resolve an existing open contact', () => {
    const state = fixture(); const response = state.care_responses.find(item => item.option === 'discomfort')!;
    state.care_responses.push({ ...response, id: randomUUID(), option: 'taking_well', detail: null, received_at: '2026-10-09T02:10:00Z', event_key: 'positive-later' });
    const before = structuredClone(state.contact_tasks);
    const snapshot = collectCareInputs(state, options(state));
    expect(snapshot.sources.some(source => source.kind === 'open_contact' && source.unresolved)).toBe(true);
    expect(state.contact_tasks).toEqual(before);
  });
  it('requires a selected, confirmed medication record before exposing regimen instructions', () => {
    const adult = fixture(); const aCourse = adult.medication_courses.find(course => course.patient_id === adult.scenario_inputs[0].patient_id)!;
    expect(collectCareInputs(adult, { ...options(adult), medicationCourseId: aCourse.id }).sources.some(source => source.kind === 'medication_instruction')).toBe(false);
    const child = fixture('B'); const bCourse = child.medication_courses.find(course => course.patient_id === child.scenario_inputs[1].patient_id)!;
    expect(collectCareInputs(child, { ...options(child, 'B'), medicationCourseId: bCourse.id }).sources.some(source => source.kind === 'medication_instruction')).toBe(true);
    bCourse.end_date = '2026-10-08';
    expect(collectCareInputs(child, { ...options(child, 'B'), medicationCourseId: bCourse.id }).sources.some(source => source.kind === 'medication_instruction')).toBe(false);
  });
  it('uses only latest-transcript clinician-reviewed direct signals', () => {
    const state = fixture(); const visitId = options(state).visitId; const transcriptId = randomUUID(); const segmentId = randomUUID();
    state.transcripts.push({ id: transcriptId, clinic_id: state.clinic.id, visit_id: visitId, revision: 1, source_asset_key: 'manual_seed', status: 'reviewed', text: '효과가 있는지 잘 모르겠어요.', segments: [{ id: segmentId, ordinal: 0, speaker: 'patient', text: '효과가 있는지 잘 모르겠어요.', start_ms: null, end_ms: null }], origin: 'manual_demo' });
    const job: RuntimeJob = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, kind: 'analysis', status: 'waiting_review', stage: 'reviewed', created_at: '2026-10-09T02:00:00Z', updated_at: '2026-10-09T02:10:00Z', input_hash: 'synthetic', result: { task: 'clinical_analysis', transcriptId, input_transcript_revision: 1, reviewed_signals: [{ id: 'explicit-effect-question', category: 'effect_question', topic: '효과 확인', text: '효과가 있는지 잘 모르겠어요.', reviewed_at: '2026-10-09T02:10:00Z', source_refs: [{ kind: 'provided_transcript', source_id: segmentId, quote: '효과가 있는지 잘 모르겠어요.', origin: 'manual_demo' }] }] } };
    state.jobs.push(job);
    const one = collectCareInputs(state, options(state));
    expect(one.sources.find(source => source.kind === 'reviewed_signal')?.signal_category).toBe('effect_question');
    state.transcripts.push({ ...state.transcripts.at(-1)!, id: randomUUID(), revision: 2 });
    expect(collectCareInputs(state, options(state)).sources.some(source => source.kind === 'reviewed_signal')).toBe(false);
  });
});

describe('context-aware grounding', () => {
  it('accepts an exact dated acknowledgement/question but refuses a new medication instruction from a response', () => {
    const state = fixture(); const snapshot = collectCareInputs(state, options(state)); const result = supportedResult(snapshot);
    const report = snapshot.sources.find(source => source.kind === 'care_response')!;
    result.sentences.push({ text: '지난 응답에서 말씀하신 불편은 지금도 있나요?', purpose: 'check_question', source_id: report.id, quote: report.text });
    expect(validateContextualCare(result, snapshot)).toBe(result);
    result.sentences.at(-1)!.purpose = 'instruction'; result.sentences.at(-1)!.text = '복용을 중단하세요.';
    expect(() => validateContextualCare(result, snapshot)).toThrow('승인 계획');
  });
  it('rejects quote changes, unsupported numbers, causal attribution, current claims and resolution', () => {
    const state = fixture(); const snapshot = collectCareInputs(state, options(state)); const report = snapshot.sources.find(source => source.kind === 'care_response')!;
    const result = supportedResult(snapshot);
    const sentence = { text: '지난 응답에서 불편한 점이 있다고 알려주셨습니다.', purpose: 'acknowledgment' as const, source_id: report.id, quote: report.text };
    for (const invalid of [{ ...sentence, quote: 'invented' }, { ...sentence, text: '지난 응답은 4회였습니다.' }, { ...sentence, text: '약 때문에 불편했던 것으로 확인했습니다.' }, { ...sentence, text: '지금 속이 불편합니다.' }, { ...sentence, text: '지난 불편 문제가 해결되었습니다.' }]) expect(() => validateContextualCare({ ...result, sentences: [invalid] }, snapshot)).toThrow();
  });
  it('does not turn a weekly plan into a daily regimen or reuse a duration number as a dose', () => {
    const state = fixture(); const snapshot = collectCareInputs(state, options(state)); const plan = snapshot.sources.find(source => source.kind === 'approved_plan')!;
    plan.text = '주 3회 침·한약 병행 계획. 회복 약 4~8주.';
    const result = supportedResult(snapshot);
    for (const text of ['하루 3회 복용하세요.', '한약 4mg을 복용하세요.']) expect(() => validateContextualCare({ ...result, sentences: [{ ...result.sentences[0], text }] }, snapshot)).toThrow();
  });
  it('requires explicit reviewed evidence for an effect concern or understanding gap', () => {
    const state = fixture(); const snapshot = collectCareInputs(state, options(state)); const result = supportedResult(snapshot);
    for (const key of ['effect_question', 'understanding_gap'] as const) expect(() => validateContextualCare({ ...result, focus: [{ ...result.focus[0], key }] }, snapshot)).toThrow('직접');
  });
});

describe('approval fingerprint contract', () => {
  it('ignores clock-only change but rejects a newly received response and preserves legacy/approved bodies', () => {
    const state = fixture(); const input = options(state); const snapshot = collectCareInputs(state, input);
    expect(fingerprintCareInputs(snapshot)).toBe(fingerprintCareInputs(collectCareInputs(state, { ...input, asOf: '2026-10-09T03:10:00Z' })));
    const message: CareMessage = { ...state.care_messages[0], id: randomUUID(), visit_id: input.visitId, medication_course_id: null, status: 'draft' as const, approved_body: null, approved_at: null, delivered_at: null, delivery_mode: 'preview' as const };
    state.care_messages.push(message);
    state.jobs.push({ id: randomUUID(), clinic_id: state.clinic.id, visit_id: input.visitId, kind: 'care', status: 'waiting_review', stage: 'review_needed', input_hash: 'synthetic', created_at: asOf, updated_at: asOf, result: { messageId: message.id, care_context_version: CARE_CONTEXT_VERSION, care_input_hash: fingerprintCareInputs(snapshot), requested_stage: 'visit_summary', medication_course_id: null } });
    expect(() => assertCurrentCareMessage(state, message.id, '2026-10-09T03:10:00Z')).not.toThrow();
    message.stage = 'week1';
    expect(() => assertCurrentCareMessage(state, message.id, '2026-10-09T03:10:00Z')).toThrow('안내 시점');
    message.stage = 'visit_summary';
    state.care_responses.push({ ...state.care_responses[0], id: randomUUID(), option: 'taking_well', detail: null, received_at: '2026-10-09T03:05:00Z', event_key: 'new-after-generation' });
    expect(() => assertCurrentCareMessage(state, message.id, '2026-10-09T03:10:00Z')).toThrow('바뀌었습니다');
    const original = state.care_messages[0]; expect(() => assertCurrentCareMessage(state, original.id, '2026-10-09T03:10:00Z')).not.toThrow();
    message.approved_body = '의료진이 승인한 불변 문안'; message.approved_at = asOf;
    const before = structuredClone(message); assertCurrentCareMessage(state, message.id, '2026-10-09T03:10:00Z'); expect(message).toEqual(before);
  });
});
