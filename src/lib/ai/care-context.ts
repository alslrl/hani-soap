import { createHash } from 'node:crypto';
import type { AppState, CareMessage, CareResponse, MedicationCourse, SourceRef } from '@/lib/types';
import { AppError, invariant } from '@/lib/server/errors';
import { reviewedPatientSignals, type PatientSignalCategory } from './clinical-analysis-context';

export const CARE_CONTEXT_VERSION = 'contextual-care-v1';
export type CareContextOptions = { visitId: string; stage: CareMessage['stage']; medicationCourseId?: string | null; asOf: string };
export type CareEvidenceKind = 'approved_plan' | 'medication_instruction' | 'reviewed_signal' | 'care_response' | 'open_contact' | 'followup_answer' | 'observation' | 'approved_history' | 'care_message';
export type CareContextSource = {
  id: string; kind: CareEvidenceKind; record_id: string; visit_id: string; date: string;
  text: string; use: 'instruction' | 'context'; temporal: 'target_visit' | 'past_record' | 'dated_report';
  origin: string; source_refs: SourceRef[]; source_soap_id?: string; section?: 's' | 'o' | 'a' | 'p';
  reported_only?: boolean; unresolved?: boolean; response_source?: CareResponse['source'];
  signal_category?: PatientSignalCategory; topic?: string; transcript_id?: string; transcript_revision?: number; reviewed_at?: string;
};
export type CareInputSnapshot = {
  version: typeof CARE_CONTEXT_VERSION; as_of: string;
  visit: { id: string; patient_id: string; date: string };
  recipient: { kind: 'patient' | 'guardian'; relationship: string | null };
  requested_stage: CareMessage['stage']; selected_medication_course_id: string | null;
  approved_soap: { id: string; visit_id: string; revision: number; approved_at: string | null; sections: { s: string; o: string; a: string; p: string } }[];
  medication_courses: (MedicationCourse & { confirmation: 'confirmed_record' | 'incomplete_record' })[];
  sources: CareContextSource[];
};
const responseLabels: Record<CareResponse['option'], string> = { taking_well: '잘 먹고 있어요', discomfort: '불편한 점 있어요', improving: '좋아지고 있어요', unsure: '잘 모르겠어요', will_book: '예약할게요', will_wait: '더 지켜볼게요' };
const detailLabels: Record<NonNullable<CareResponse['detail']>, string> = { stomach_discomfort: '속이 불편해요', difficulty_taking: '약 챙기기가 어려워요', other: '기타' };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const validTime = (value: string) => Number.isFinite(Date.parse(value));
const atOrBefore = (value: string, limit: string) => validTime(value) && Date.parse(value) <= Date.parse(limit);
function kstDate(time: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}

/** Collects same-patient, dated, reviewed context without changing any clinical state. */
export function collectCareInputs(state: AppState, options: CareContextOptions): CareInputSnapshot {
  invariant(validTime(options.asOf), '케어 기준 시각을 확인해 주세요.');
  const visit = state.visits.find(item => item.id === options.visitId && item.clinic_id === state.clinic.id);
  if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
  invariant(atOrBefore(visit.scheduled_at, options.asOf), '미래 방문의 케어 안내는 생성할 수 없습니다.', 'CARE_FUTURE_VISIT');
  const patient = state.patients.find(item => item.id === visit.patient_id && item.clinic_id === state.clinic.id)!;
  const visits = state.visits.filter(item => item.patient_id === patient.id && item.clinic_id === state.clinic.id && atOrBefore(item.scheduled_at, visit.scheduled_at) && atOrBefore(item.scheduled_at, options.asOf));
  const visitById = new Map(visits.map(item => [item.id, item]));
  const approved = visits.flatMap(item => {
    const soap = state.soap_documents.filter(soap => soap.visit_id === item.id && soap.clinic_id === state.clinic.id && soap.status === 'approved' && soap.approved_at && atOrBefore(soap.approved_at, options.asOf)).sort((a, b) => b.revision - a.revision)[0];
    return soap ? [soap] : [];
  });
  const target = approved.find(soap => soap.visit_id === visit.id);
  invariant(target, '해당 방문의 SOAP를 먼저 승인해 주세요.', 'APPROVED_SOURCE_REQUIRED');
  const sources: CareContextSource[] = [];
  sources.push({ id: `approved-plan:${target.id}`, kind: 'approved_plan', record_id: target.id, source_soap_id: target.id, section: 'p', visit_id: visit.id, date: visit.scheduled_at, text: target.sections.p, use: 'instruction', temporal: 'target_visit', origin: target.origin, source_refs: target.source_refs });
  for (const soap of approved.filter(item => item.visit_id !== visit.id)) {
    for (const section of ['s', 'o', 'a', 'p'] as const) {
      if (!soap.sections[section].trim()) continue;
      sources.push({ id: `approved-history:${soap.id}:${section}`, kind: 'approved_history', record_id: soap.id, source_soap_id: soap.id, section, visit_id: soap.visit_id, date: visitById.get(soap.visit_id)!.scheduled_at, text: soap.sections[section], use: 'context', temporal: 'past_record', origin: soap.origin, source_refs: soap.source_refs });
    }
  }
  const courses = state.medication_courses.filter(course => course.patient_id === patient.id && course.clinic_id === state.clinic.id && visitById.has(course.source_visit_id) && course.start_date <= kstDate(options.asOf)).sort((a, b) => a.id.localeCompare(b.id));
  const selected = options.medicationCourseId ? courses.find(course => course.id === options.medicationCourseId) : undefined;
  if (options.medicationCourseId) invariant(selected, '기준 복약 과정의 환자와 시작일을 확인해 주세요.');
  if (options.stage !== 'visit_summary') {
    invariant(selected?.start_date, '복약 시작일이 확인된 과정을 선택해 주세요.');
    if (options.stage === 'end_minus3') invariant(selected.end_date, '종료일을 확인해 주세요.');
  }
  const medicationCourses = courses.map(course => {
    const confirmed = Boolean(course.medication_name && course.daily_frequency !== null && course.instructions?.trim() && approved.some(soap => soap.visit_id === course.source_visit_id));
    // An explicit course selection is required before a regimen can enter patient instructions.
    if (confirmed && selected?.id === course.id && course.instructions?.trim() && (!course.end_date || course.end_date >= kstDate(options.asOf))) sources.push({ id: `medication-instruction:${course.id}`, kind: 'medication_instruction', record_id: course.id, visit_id: course.source_visit_id, date: visitById.get(course.source_visit_id)!.scheduled_at, text: course.instructions, use: 'instruction', temporal: 'target_visit', origin: course.origin, source_refs: [] });
    return { ...course, confirmation: confirmed ? 'confirmed_record' as const : 'incomplete_record' as const };
  });
  const eligibleMessages = new Map(state.care_messages.filter(message => message.patient_id === patient.id && message.clinic_id === state.clinic.id && visitById.has(message.visit_id) && message.status === 'sent' && message.delivered_at && atOrBefore(message.delivered_at, options.asOf)).map(message => [message.id, message]));
  const responses = state.care_responses.filter(response => response.patient_id === patient.id && response.clinic_id === state.clinic.id && eligibleMessages.has(response.message_id) && atOrBefore(response.received_at, options.asOf)).sort((a, b) => a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id));
  const responseById = new Map(responses.map(response => [response.id, response]));
  for (const response of responses) {
    const message = eligibleMessages.get(response.message_id)!;
    const text = `응답: ${responseLabels[response.option]}${response.detail ? `\n상세: ${detailLabels[response.detail]}` : ''}`;
    sources.push({ id: `care-response:${response.id}`, kind: 'care_response', record_id: response.id, visit_id: message.visit_id, date: response.received_at, text, use: 'context', temporal: 'dated_report', origin: response.origin, source_refs: [], reported_only: true, response_source: response.source });
  }
  for (const messageId of [...new Set(responses.map(response => response.message_id))].sort()) {
    const message = eligibleMessages.get(messageId)!;
    if (message.approved_body) sources.push({ id: `care-message:${message.id}`, kind: 'care_message', record_id: message.id, visit_id: message.visit_id, date: message.delivered_at!, text: message.approved_body, use: 'context', temporal: 'past_record', origin: message.origin, source_refs: [] });
  }
  for (const task of state.contact_tasks.filter(task => task.patient_id === patient.id && task.clinic_id === state.clinic.id && task.status === 'open' && responseById.has(task.response_id))) {
    const response = responseById.get(task.response_id)!;
    sources.push({ id: `open-contact:${task.id}`, kind: 'open_contact', record_id: task.id, visit_id: eligibleMessages.get(response.message_id)!.visit_id, date: response.received_at, text: task.reason, use: 'context', temporal: 'dated_report', origin: task.origin, source_refs: [], unresolved: true, reported_only: true, response_source: response.source });
  }
  for (const answer of state.followup_answers.filter(answer => answer.patient_id === patient.id && answer.clinic_id === state.clinic.id && visitById.has(answer.visit_id) && answer.review_status === 'reviewed' && answer.confirmation_status === 'confirmed' && answer.applicability === 'applicable' && answer.answer_text?.trim())) {
    sources.push({ id: `followup-answer:${answer.id}`, kind: 'followup_answer', record_id: answer.id, visit_id: answer.visit_id, date: visitById.get(answer.visit_id)!.scheduled_at, text: answer.answer_text!, use: 'context', temporal: answer.visit_id === visit.id ? 'target_visit' : 'past_record', origin: answer.origin, source_refs: answer.source_refs, reported_only: true, topic: answer.item_key });
  }
  for (const observation of state.observations.filter(item => item.patient_id === patient.id && item.clinic_id === state.clinic.id && visitById.has(item.visit_id) && item.review_status === 'reviewed' && atOrBefore(item.measured_at, options.asOf))) {
    const text = `항목: ${observation.metric_key}\n측정: ${observation.value} ${observation.unit}\n척도: ${observation.instrument}\n조건: ${observation.measurement_context}${observation.body_region ? `\n부위: ${observation.body_region}` : ''}${observation.laterality ? `\n좌우: ${observation.laterality}` : ''}${observation.activity_key ? `\n활동: ${observation.activity_key}` : ''}`;
    sources.push({ id: `observation:${observation.id}`, kind: 'observation', record_id: observation.id, visit_id: observation.visit_id, date: observation.measured_at, text, use: 'context', temporal: observation.visit_id === visit.id ? 'target_visit' : 'past_record', origin: observation.origin, source_refs: observation.source_refs, reported_only: true });
  }
  for (const signal of reviewedPatientSignals(state, patient.id, visit.id).filter(signal => visitById.has(signal.visit_id) && atOrBefore(signal.reviewed_at, options.asOf))) {
    sources.push({ id: `reviewed-signal:${signal.visit_id}:${signal.id}`, kind: 'reviewed_signal', record_id: signal.id, visit_id: signal.visit_id, date: signal.visit_date, text: signal.text, use: 'context', temporal: signal.visit_id !== visit.id ? 'past_record' : /(?:지난|이전|과거|전에|어제)/.test(signal.text) ? 'dated_report' : 'target_visit', origin: 'manual_demo', source_refs: signal.source_refs, reported_only: true, signal_category: signal.category, topic: signal.topic, transcript_id: signal.transcript_id, transcript_revision: signal.transcript_revision, reviewed_at: signal.reviewed_at });
  }
  return { version: CARE_CONTEXT_VERSION, as_of: options.asOf, visit: { id: visit.id, patient_id: patient.id, date: visit.scheduled_at }, recipient: { kind: patient.guardian ? 'guardian' : 'patient', relationship: patient.guardian?.relationship ?? null }, requested_stage: options.stage, selected_medication_course_id: selected?.id ?? null, approved_soap: [{ id: target.id, visit_id: target.visit_id, revision: target.revision, approved_at: target.approved_at, sections: target.sections }], medication_courses: medicationCourses, sources: sources.sort((a, b) => a.id.localeCompare(b.id)) };
}

/** The clock is a collection cutoff, not a fact; advancing it alone never invalidates a draft. */
export function fingerprintCareInputs(snapshot: CareInputSnapshot) {
  const { as_of: _cutoff, ...facts } = snapshot;
  return createHash('sha256').update(JSON.stringify(canonical(facts))).digest('hex');
}

/** Parent approval hook: call in care.approve before fixing approved_body. */
export function assertCurrentCareMessage(state: AppState, messageId: string, asOf = new Date().toISOString()): void {
  const message = state.care_messages.find(item => item.id === messageId);
  if (!message || message.approved_body !== null) return; // Existing approved bodies remain immutable and sendable.
  const job = state.jobs.filter(item => item.kind === 'care' && item.result?.messageId === messageId && item.result?.care_context_version === CARE_CONTEXT_VERSION).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!job) return; // Seed and earlier manually authored/legacy AI messages stay compatible.
  const pinnedCourse = typeof job.result?.medication_course_id === 'string' ? job.result.medication_course_id : null;
  if (message.visit_id !== job.visit_id || message.stage !== job.result?.requested_stage || message.medication_course_id !== pinnedCourse) throw new AppError(409, 'CARE_INPUT_STALE', '안내 시점이나 기준 복약 과정이 변경되었습니다. 최신 맥락으로 다시 생성한 뒤 검토해 주세요.');
  let current: CareInputSnapshot;
  try { current = collectCareInputs(state, { visitId: job.visit_id, stage: job.result?.requested_stage as CareMessage['stage'], medicationCourseId: pinnedCourse, asOf }); }
  catch (error) { if (error instanceof AppError) throw new AppError(409, 'CARE_INPUT_STALE', '안내 기준 기록이 변경되었습니다. 최신 맥락으로 다시 생성한 뒤 검토해 주세요.'); throw error; }
  if (job.result?.stale_input === true || typeof job.result?.care_input_hash !== 'string' || fingerprintCareInputs(current) !== job.result.care_input_hash) throw new AppError(409, 'CARE_INPUT_STALE', '안내 생성 뒤 환자 응답이나 확인 기록이 바뀌었습니다. 최신 맥락으로 다시 생성한 뒤 검토해 주세요.');
}

export type CareFocusKey = 'direct_worry' | 'effect_question' | 'understanding_gap' | 'practice_difficulty' | 'discomfort_check' | 'medication_followup' | 'general_guidance';
export type CareFocusCandidate = { key: CareFocusKey; source_ids: string[]; reason: string };
/** Communication priorities reflect explicit reports only; they are not patient-risk scores. */
export function careCommunicationCandidates(snapshot: CareInputSnapshot): CareFocusCandidate[] {
  const candidates: CareFocusCandidate[] = [];
  const groups = new Map<CareFocusKey, { ids: string[]; reason: string }>();
  const add = (key: CareFocusKey, source: CareContextSource, reason: string) => {
    const existing = groups.get(key) ?? { ids: [], reason };
    existing.ids.push(source.id); groups.set(key, existing);
  };
  for (const source of snapshot.sources) {
    if (source.kind === 'reviewed_signal') {
      const mapped: Record<PatientSignalCategory, CareFocusKey> = { worry: 'direct_worry', effect_question: 'effect_question', understanding_gap: 'understanding_gap', practice_difficulty: 'practice_difficulty', open_question: 'understanding_gap' };
      add(mapped[source.signal_category!], source, '의료진이 확인한 직접 표현을 설명·확인 방향에 반영');
    }
    if (source.kind === 'care_response' && source.text.includes('약 챙기기가 어려워요')) add('practice_difficulty', source, '지난 응답에 복용 실천의 어려움을 직접 보고');
    else if (source.kind === 'care_response' && source.text.includes('불편한 점 있어요')) add('discomfort_check', source, '지난 불편 응답의 현재 지속 여부를 먼저 확인');
    if (source.kind === 'open_contact') add('discomfort_check', source, '연락 작업이 미해결이며 긍정 응답만으로 닫지 않음');
  }
  for (const [key, group] of groups) candidates.push({ key, source_ids: [...new Set(group.ids)].sort(), reason: group.reason });
  if (!candidates.length) {
    const plan = snapshot.sources.find(source => source.kind === 'approved_plan');
    if (plan) candidates.push({ key: 'general_guidance', source_ids: [plan.id], reason: '별도 확인된 걱정 표현 없이 승인 계획의 이해를 확인' });
  }
  return candidates;
}
