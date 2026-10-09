import { randomUUID } from 'node:crypto';
import type { ActionRequest, AppState, CareMessage, FollowupAnswer, Observation, RuntimeAnnotation, RuntimeLiveEvent, SoapDocument, Treatment, Visit } from '../types';
import { AppError, invariant } from './errors';
import { validateEntity } from './validation';
import { BODY_MAP_VERSIONS } from '../tablet/body-map-version';

const text = (value: unknown, label: string, allowEmpty = false): string => {
  invariant(typeof value === 'string' && (allowEmpty || value.trim().length > 0) && value.length <= 100_000, `${label}을 확인해 주세요.`);
  return value;
};
const nullableText = (value: unknown): string | null => value == null ? null : text(value, '입력', true);
const object = (value: unknown): Record<string, unknown> => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), '입력 형식을 확인해 주세요.');
  return value as Record<string, unknown>;
};
const uuid = (value: unknown, label = 'ID') => {
  const id = text(value, label);
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id), `${label} 형식을 확인해 주세요.`);
  return id;
};
function lookup<T extends { id: string }>(rows: T[], id: unknown, label: string): T {
  const row = rows.find((v) => v.id === uuid(id));
  if (!row) throw new AppError(404, 'NOT_FOUND', `${label}을 찾을 수 없습니다.`);
  return row;
}
function targetVisit(state: AppState, payload: Record<string, unknown>) {
  return lookup(state.visits, payload.visitId ?? payload.visit_id, '방문');
}
function manualRefs() { return [{ kind: 'manual' as const, source_id: null, quote: null, origin: 'manual_demo' as const }]; }
const latestSoap = (state: AppState, visitId: string) => state.soap_documents.filter((v) => v.visit_id === visitId).sort((a, b) => b.revision - a.revision)[0];
function assureCurrentSoap(state: AppState, visit: Visit, payload: Record<string, unknown>) {
  const doc = latestSoap(state, visit.id);
  const provided = payload.documentId ?? payload.soapId;
  if (Object.hasOwn(payload, 'expectedSoapId') && (doc?.id ?? null) !== payload.expectedSoapId) throw new AppError(409, 'DOCUMENT_CONFLICT', '새 기록이 생성되었습니다. 최신 기록을 확인해 주세요.');
  if (provided && doc?.id !== provided || payload.revision !== undefined && doc?.revision !== payload.revision) throw new AppError(409, 'DOCUMENT_CONFLICT', '기록이 변경되었습니다. 최신 기록을 확인해 주세요.');
  return doc;
}
function saveTreatment(state: AppState, payload: Record<string, unknown>) {
  const input = payload.treatment ? object(payload.treatment) : payload;
  const visit = targetVisit(state, { ...input, ...payload });
  const id = input.id ?? input.treatmentId;
  const previous = id ? state.treatments.find((v) => v.id === uuid(id)) : undefined;
  invariant(!previous || previous.visit_id === visit.id, '다른 방문의 시술은 변경할 수 없습니다.');
  const allowed = ['id', 'treatmentId', 'clinic_id', 'visitId', 'visit_id', 'modality', 'technique', 'body_region', 'laterality', 'acupoints', 'status', 'source', 'notes', 'origin', 'locations'];
  invariant(Object.keys(input).every((key) => allowed.includes(key)), '지원하지 않는 시술 필드가 있습니다.');
  const treatment: Treatment = {
    id: previous?.id || (id ? uuid(id) : randomUUID()), clinic_id: state.clinic.id, visit_id: visit.id,
    modality: (input.modality ?? previous?.modality ?? 'acupuncture') as Treatment['modality'],
    technique: (input.technique !== undefined ? input.technique : previous?.technique ?? (input.modality === 'pharmacopuncture' ? null : 'standard_acupuncture')) as Treatment['technique'],
    body_region: text(input.body_region ?? previous?.body_region ?? '', '부위', true),
    laterality: (input.laterality ?? previous?.laterality ?? 'not_applicable') as Treatment['laterality'],
    acupoints: (input.acupoints ?? previous?.acupoints ?? []) as Treatment['acupoints'],
    status: (input.status ?? previous?.status ?? 'suggested') as Treatment['status'],
    source: (input.source === 'clinician' ? 'manual' : input.source ?? previous?.source ?? 'manual') as Treatment['source'],
    notes: nullableText(input.notes ?? previous?.notes), origin: 'manual_demo',
    ...(input.locations !== undefined || previous?.locations ? { locations: (input.locations ?? previous?.locations) as Treatment['locations'] } : {}),
  };
  if (treatment.modality !== 'acupuncture') treatment.technique = null;
  validateEntity('treatment', treatment);
  if (treatment.status === 'confirmed') invariant(treatment.body_region.trim(), '시행 확인 전에 부위를 선택해 주세요.');
  if (previous) state.treatments[state.treatments.indexOf(previous)] = treatment;
  else state.treatments.push(treatment);
}
function saveFollowupAnswer(state: AppState, visit: Visit, input: Record<string, unknown>) {
  const existing = input.answerId ?? input.id;
  const answer = existing ? lookup(state.followup_answers, existing, '질문 답변') : state.followup_answers.find((v) => v.visit_id === visit.id && v.item_key === input.item_key && v.subitem_key === (input.subitem_key || 'general'));
  invariant(!answer || answer.visit_id === visit.id, '다른 방문의 답변은 변경할 수 없습니다.');
  const next: FollowupAnswer = {
    id: answer?.id || randomUUID(), clinic_id: state.clinic.id, patient_id: visit.patient_id, visit_id: visit.id,
    item_key: (input.item_key ?? answer?.item_key) as FollowupAnswer['item_key'],
    subitem_key: text(input.subitem_key ?? answer?.subitem_key ?? 'general', '세부 항목'),
    question_text: text(input.question_text ?? answer?.question_text ?? input.item_key ?? '', '질문', true),
    answer_text: input.answer_text !== undefined ? nullableText(input.answer_text) : answer?.answer_text ?? null,
    change: (input.change !== undefined ? input.change : answer?.change ?? null) as FollowupAnswer['change'],
    confirmation_status: (input.confirmation_status ?? answer?.confirmation_status ?? 'not_confirmed') as FollowupAnswer['confirmation_status'],
    applicability: (input.applicability ?? answer?.applicability ?? 'unknown') as FollowupAnswer['applicability'],
    comparison_visit_id: (input.comparison_visit_id !== undefined ? input.comparison_visit_id : answer?.comparison_visit_id ?? null) as string | null,
    source_refs: answer?.source_refs || manualRefs(), review_status: 'reviewed', origin: 'manual_demo',
  };
  validateEntity('followup_answer', next);
  if (answer) state.followup_answers[state.followup_answers.indexOf(answer)] = next;
  else state.followup_answers.push(next);
}
function saveObservation(state: AppState, payload: Record<string, unknown>, now: string) {
  const input = payload.observation ? object(payload.observation) : payload;
  const visit = targetVisit(state, { ...input, ...payload });
  const patient = state.patients.find((v) => v.id === visit.patient_id)!;
  const instrument = (input.instrument || 'NRS') as Observation['instrument'];
  invariant(typeof input.value === 'number' && Number.isFinite(input.value), '새 측정값을 숫자로 입력해 주세요.');
  const metric = text(input.metric_key || (instrument === 'NRS' ? 'pain_intensity' : ''), '측정 항목');
  const region = nullableText(input.body_region);
  const side = (input.laterality ?? null) as Observation['laterality'];
  const activity = nullableText(input.activity_key);
  const context = text(input.measurement_context || (instrument === 'NRS' ? 'current_pain' : ''), '측정 조건');
  const compatible = state.observations.find((v) => v.patient_id === patient.id && v.metric_key === metric && v.instrument === instrument && v.body_region === region && v.laterality === side && v.activity_key === activity && v.measurement_context === context);
  const next: Observation = {
    id: randomUUID(), clinic_id: state.clinic.id, patient_id: patient.id, visit_id: visit.id,
    followup_answer_id: (input.followupAnswerId ?? input.followup_answer_id ?? null) as string | null,
    metric_key: metric, series_key: text(input.series_key || compatible?.series_key || `${patient.demo_key}:${metric}:${instrument}:${region || 'none'}:${side || 'none'}:${activity || 'none'}:${context}:v1`, '경과 계열'),
    instrument, value: input.value, unit: text(input.unit || (instrument === 'NRS' ? 'score' : ''), '단위'),
    scale_min: instrument === 'NRS' ? 0 : typeof input.scale_min === 'number' ? input.scale_min : null,
    scale_max: instrument === 'NRS' ? 10 : typeof input.scale_max === 'number' ? input.scale_max : null,
    body_region: region, laterality: side, activity_key: activity, measurement_context: context,
    measured_at: now, review_status: 'reviewed', source_refs: manualRefs(), origin: 'manual_demo',
  };
  validateEntity('observation', next);
  // Values are append-only measurements; entering 0 is valid and never means "unknown".
  state.observations.push(next);
}

export function applyAction(state: AppState, action: ActionRequest, sessionId = 'demo_clinician') {
  const p = action.payload;
  const now = new Date().toISOString();
  switch (action.type) {
    case 'visit.start': {
      const visit = targetVisit(state, p);
      invariant(visit.workflow_status !== 'completed', '완료한 방문은 다시 진료하기로 재개해 주세요.');
      visit.workflow_status = 'in_progress'; visit.started_at ||= now;
      break;
    }
    case 'visit.reopen': {
      const visit = targetVisit(state, p);
      invariant(visit.workflow_status === 'completed', '완료한 방문만 재개할 수 있습니다.');
      visit.workflow_status = 'in_progress'; visit.completed_at = null; visit.started_at ||= now;
      break;
    }
    case 'visit.complete': {
      const visit = targetVisit(state, p);
      invariant(visit.workflow_status === 'in_progress', '진료 중인 방문만 완료할 수 있습니다.');
      invariant(!state.audioSessions.some((v) => v.visit_id === visit.id && v.status === 'recording') && !state.recordings.some((v) => v.visit_id === visit.id && ['recording', 'uploading'].includes(v.status)), '녹음을 종료하고 파일 보존이 끝난 후 진료를 마쳐 주세요.');
      visit.workflow_status = 'completed'; visit.completed_at = now;
      break;
    }
    case 'patient.note': {
      lookup(state.patients, p.patientId ?? p.patient_id, '환자').notes = nullableText(p.notes);
      break;
    }
    case 'soap.save': {
      const visit = targetVisit(state, p);
      const previous = assureCurrentSoap(state, visit, p);
      const sections = object(p.sections);
      const doc: SoapDocument = {
        id: randomUUID(), clinic_id: state.clinic.id, visit_id: visit.id, revision: (previous?.revision || 0) + 1,
        input_transcript_id: previous?.input_transcript_id || null, status: 'draft',
        sections: { s: text(sections.s ?? sections.S ?? '', 'S', true), o: text(sections.o ?? sections.O ?? '', 'O', true), a: text(sections.a ?? sections.A ?? '', 'A', true), p: text(sections.p ?? sections.P ?? '', 'P', true) },
        source_refs: previous?.source_refs || manualRefs(), approved_at: null, approved_by: null, origin: 'manual_demo',
      };
      validateEntity('soap_document', doc); state.soap_documents.push(doc); visit.record_status = 'draft';
      break;
    }
    case 'soap.approve': {
      const visit = targetVisit(state, p.documentId && !p.visitId && !p.visit_id ? { visitId: lookup(state.soap_documents, p.documentId, '기록').visit_id } : p);
      const doc = assureCurrentSoap(state, visit, p);
      invariant(doc && Object.values(doc.sections).some((v) => v.trim()), '검토할 기록을 먼저 작성해 주세요.');
      const latestTranscript = state.transcripts.filter((v) => v.visit_id === visit.id).sort((a, b) => b.revision - a.revision)[0];
      if (doc.input_transcript_id && latestTranscript?.id !== doc.input_transcript_id || state.jobs.some((v) => v.result?.soapId === doc.id && v.result?.stale_input === true)) {
        throw new AppError(409, 'STALE_SOAP_INPUT', '전사가 변경되었습니다. 최신 전사로 기록을 다시 생성하고 검토해 주세요.');
      }
      if (doc.status !== 'approved') { doc.status = 'approved'; doc.approved_at = now; doc.approved_by = sessionId; }
      visit.record_status = 'approved';
      break;
    }
    case 'treatment.save': saveTreatment(state, p); break;
    case 'treatment.confirm': {
      const treatment = lookup(state.treatments, p.treatmentId ?? p.id, '시술');
      invariant(treatment.body_region.trim(), '부위를 선택한 뒤 시행을 확인해 주세요.');
      treatment.status = 'confirmed'; treatment.origin = 'manual_demo'; break;
    }
    case 'treatment.remove': {
      const row = lookup(state.treatments, p.treatmentId ?? p.id, '시술');
      state.treatments = state.treatments.filter((v) => v.id !== row.id); break;
    }
    case 'annotation.save': {
      const input = p.annotation ? object(p.annotation) : p;
      const visit = targetVisit(state, { ...input, ...p });
      const byId = input.id ? state.annotations.find(v => v.id === uuid(input.id)) : undefined;
      const coordinateVersion = input.coordinate_version ?? byId?.coordinate_version ?? 'body-map-v1';
      invariant(BODY_MAP_VERSIONS.some(version => version === coordinateVersion), '지원하지 않는 인체 좌표 버전입니다.');
      const slot = state.annotations.find(v => v.visit_id === visit.id && v.modality === input.modality && v.technique === (input.technique ?? null) && v.view === input.view && v.coordinate_version === coordinateVersion);
      if (input.id && !byId && slot) throw new AppError(409, 'ANNOTATION_CONFLICT', '다른 화면에서 이 도해의 필기를 저장했습니다. 새로고침 후 확인해 주세요.');
      const existing = byId ?? slot;
      invariant(!existing || existing.visit_id === visit.id && existing.modality === input.modality && existing.technique === (input.technique ?? null) && existing.view === input.view, '필기 레이어가 일치하지 않습니다.');
      invariant(!existing || existing.coordinate_version === coordinateVersion, '저장된 필기의 인체 좌표 버전을 바꿀 수 없습니다.');
      if (existing && input.revision !== undefined && input.revision !== existing.revision) throw new AppError(409, 'ANNOTATION_CONFLICT', '다른 화면에서 필기가 변경되었습니다.');
      invariant(Array.isArray(input.strokes), '필기 획을 확인해 주세요.');
      const strokesChanged = !existing || JSON.stringify(existing.strokes) !== JSON.stringify(input.strokes);
      const next: RuntimeAnnotation = {
        id: existing?.id || (input.id ? uuid(input.id) : randomUUID()), clinic_id: state.clinic.id, visit_id: visit.id,
        scope: 'treatment', modality: input.modality as Treatment['modality'], technique: (input.technique ?? null) as Treatment['technique'],
        view: input.view as 'front' | 'back', coordinate_space: 'normalized', coordinate_version: coordinateVersion as RuntimeAnnotation['coordinate_version'],
        canvas_size: (input.canvas_size || { width: 1000, height: 1000 }) as RuntimeAnnotation['canvas_size'],
        strokes: input.strokes as RuntimeAnnotation['strokes'], revision: (existing?.revision || 0) + 1, updated_at: now,
        extracted_text: strokesChanged ? null : existing?.extracted_text || null, extraction_reviewed: strokesChanged ? false : existing?.extraction_reviewed || false,
      };
      invariant(['front', 'back'].includes(next.view) && ['acupuncture', 'pharmacopuncture', 'moxibustion', 'cupping', 'tuina'].includes(next.modality), '필기 화면/시술을 확인해 주세요.');
      if (existing) state.annotations[state.annotations.indexOf(existing)] = next; else state.annotations.push(next);
      break;
    }
    case 'annotation.review': {
      const row = lookup(state.annotations, p.id ?? p.annotationId, '필기');
      if (p.revision !== undefined && p.revision !== row.revision) throw new AppError(409, 'ANNOTATION_CONFLICT', '필기가 변경되었습니다.');
      row.extracted_text = text(p.extracted_text, '검토한 필기 내용', true); row.extraction_reviewed = true; row.updated_at = now;
      break;
    }
    case 'followup.save': {
      const visit = targetVisit(state, p);
      invariant(Array.isArray(p.answers) && p.answers.length <= 100, '질문 답변 목록을 확인해 주세요.');
      for (const answer of p.answers) saveFollowupAnswer(state, visit, object(answer));
      break;
    }
    case 'followup.answer': { const visit = targetVisit(state, p); saveFollowupAnswer(state, visit, p); break; }
    case 'followup.create': {
      const visit = targetVisit(state, p);
      const item = { id: randomUUID(), clinic_id: state.clinic.id, patient_id: visit.patient_id, source_visit_id: visit.id, item_key: p.item_key || 'questions_concerns', title: text(p.title, '다음 확인 항목'), status: 'pending', resolved_visit_id: null, source_refs: manualRefs(), origin: 'manual_demo' } as const;
      validateEntity('followup_item', item); state.followup_items.push(item as AppState['followup_items'][number]); break;
    }
    case 'followup.resolve': {
      const visit = targetVisit(state, p); const item = lookup(state.followup_items, p.itemId, '확인 항목');
      invariant(item.patient_id === visit.patient_id, '다른 환자의 항목은 확인할 수 없습니다.');
      item.status = 'resolved'; item.resolved_visit_id = visit.id; break;
    }
    case 'observation.save': saveObservation(state, p, now); break;
    case 'care.save': {
      const existing = p.messageId ? lookup(state.care_messages, p.messageId, '안내') : undefined;
      const visit = targetVisit(state, p.visitId || p.visit_id ? p : { visitId: existing?.visit_id });
      invariant(!existing || existing.visit_id === visit.id, '안내의 방문이 일치하지 않습니다.');
      const body = text(p.draft_body ?? p.body, '안내 초안');
      const courseId = p.medication_course_id ?? existing?.medication_course_id ?? null;
      const stage = (p.stage || existing?.stage || 'visit_summary') as CareMessage['stage'];
      const course = state.medication_courses.find((v) => v.id === courseId);
      let scheduled = p.scheduled_at ?? existing?.scheduled_at ?? now;
      if (!p.scheduled_at && !existing && stage !== 'visit_summary') {
        invariant(course, '복약 일정이 확인된 과정을 선택해 주세요.');
        const base = stage === 'end_minus3' ? course.end_date : course.start_date;
        invariant(base, '일정 기준일이 확인되지 않았습니다.');
        const date = new Date(`${base}T10:00:00+09:00`); date.setUTCDate(date.getUTCDate() + (stage === 'day3' ? 2 : stage === 'week1' ? 7 : -3)); scheduled = date.toISOString();
      }
      const editable = existing?.approved_body == null ? existing : undefined;
      const message: CareMessage = {
        id: editable?.id || randomUUID(), clinic_id: state.clinic.id, patient_id: visit.patient_id, visit_id: visit.id,
        medication_course_id: courseId as string | null, stage, scheduled_at: text(scheduled, '안내 예정일'), draft_body: body,
        approved_body: null, approved_at: null, delivered_at: null, delivery_mode: 'preview', status: 'draft', origin: 'manual_demo',
      };
      validateEntity('care_message', message);
      if (editable) state.care_messages[state.care_messages.indexOf(editable)] = message; else state.care_messages.push(message);
      break;
    }
    case 'care.approve': {
      const message = lookup(state.care_messages, p.messageId ?? p.id, '안내');
      invariant(message.status === 'draft' && message.draft_body.trim(), '승인할 초안을 확인해 주세요.');
      message.approved_body = message.draft_body; message.approved_at = now; message.status = 'approved'; break;
    }
    case 'care.sendMock': {
      const message = lookup(state.care_messages, p.messageId ?? p.id, '안내');
      if (message.status === 'sent' && message.delivery_mode === 'mock') break;
      invariant(message.status === 'approved' && message.approved_body, '의료진이 안내를 승인한 뒤 모의 발송해 주세요.');
      message.status = 'sent'; message.delivery_mode = 'mock'; message.delivered_at = now; break;
    }
    case 'care.respond': {
      const message = lookup(state.care_messages, p.messageId ?? p.id, '안내');
      invariant(message.status === 'sent' && message.delivery_mode === 'mock', '모의 발송한 안내에만 데모 응답을 추가할 수 있습니다.');
      const eventKey = p.eventKey ? text(p.eventKey, '응답 키') : `manual:${randomUUID()}`;
      if (state.care_responses.some((v) => v.event_key === eventKey)) break;
      const response = { id: randomUUID(), clinic_id: state.clinic.id, patient_id: message.patient_id, message_id: message.id, option: p.option, detail: p.detail ?? null, received_at: now, source: 'demo_simulation', event_key: eventKey, origin: 'synthetic_response' } as const;
      validateEntity('care_response', response); state.care_responses.push(response as AppState['care_responses'][number]);
      if (response.option === 'discomfort') state.contact_tasks.push({ id: randomUUID(), clinic_id: state.clinic.id, patient_id: message.patient_id, response_id: response.id, reason: '모의 응답: 불편한 점 있어요. 현재 상태와 상세 내용을 확인해 주세요.', status: 'open', resolution_note: null, closed_by: null, closed_at: null, origin: 'synthetic_response' });
      break;
    }
    case 'contact.close': {
      const task = lookup(state.contact_tasks, p.contactId ?? p.id, '연락 작업');
      task.resolution_note = text(p.resolution_note ?? p.note, '연락 처리 기록'); task.status = 'closed'; task.closed_by = sessionId; task.closed_at = now; break;
    }
    case 'live.accept': case 'live.dismiss': {
      const event = lookup(state.live_events, p.eventId ?? p.id, '실시간 후보');
      if (action.type === 'live.dismiss') { event.status = 'dismissed'; break; }
      invariant(event.context !== 'past' && event.context !== 'negated', '과거·부정 표현은 현재 시술 후보로 추가할 수 없습니다.');
      event.status = 'accepted';
      if (!state.treatments.some((v) => v.visit_id === event.visit_id && v.modality === event.modality && v.technique === event.technique && v.source === 'realtime_candidate')) {
        saveTreatment(state, { visitId: event.visit_id, modality: event.modality, technique: event.technique, source: 'realtime_candidate', notes: event.text });
      }
      break;
    }
    case 'live.update': case 'live.event': {
      const visit = targetVisit(state, p); const input = p.event ? object(p.event) : p;
      const event: RuntimeLiveEvent = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visit.id, audio_session_id: (input.audio_session_id || null) as string | null, text: text(input.text, '실시간 발화'), modality: input.modality as Treatment['modality'], technique: (input.technique ?? null) as Treatment['technique'], context: (input.context || 'unclear') as RuntimeLiveEvent['context'], status: 'suggested', created_at: now };
      invariant(['acupuncture', 'pharmacopuncture', 'moxibustion', 'cupping', 'tuina'].includes(event.modality) && ['current', 'planned', 'past', 'negated', 'unclear'].includes(event.context), '실시간 후보 형식을 확인해 주세요.');
      state.live_events.push(event); break;
    }
    default: throw new AppError(400, 'UNKNOWN_ACTION', '지원하지 않는 작업입니다.');
  }
}
