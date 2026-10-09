import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import seedSchema from '../../../data/demo/demo.schema.json';
import type { AppState } from '../types';
import { FIXED_CLINIC_ID } from './config';
import { AppError, invariant } from './errors';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(seedSchema, 'seed');
const validators = new Map<string, ValidateFunction>();
export function validateEntity(name: string, value: unknown) {
  let validate = validators.get(name);
  if (!validate) { validate = ajv.compile({ $ref: `seed#/$defs/${name}` }); validators.set(name, validate); }
  if (!validate(value)) throw new AppError(400, 'INVALID_INPUT', '저장할 항목의 형식이나 값 범위를 확인해 주세요.', validate.errors?.map((v) => ({ path: v.instancePath, keyword: v.keyword, message: v.message })));
}
const entityCollections = {
  patients: 'patient', visits: 'visit', transcripts: 'transcript', soap_documents: 'soap_document', treatments: 'treatment',
  followup_answers: 'followup_answer', observations: 'observation', followup_items: 'followup_item', medication_courses: 'medication_course',
  care_messages: 'care_message', care_responses: 'care_response', contact_tasks: 'contact_task',
} as const;
export function validateState(state: AppState) {
  invariant(state.clinic.id === FIXED_CLINIC_ID && state.patients.length === 2, '기관 및 데모 환자 범위를 벗어났습니다.');
  const patients = new Map(state.patients.map((v) => [v.id, v]));
  const visits = new Map(state.visits.map((v) => [v.id, v]));
  const transcripts = new Map(state.transcripts.map((v) => [v.id, v]));
  const answers = new Map(state.followup_answers.map((v) => [v.id, v]));
  const messages = new Map(state.care_messages.map((v) => [v.id, v]));
  const responses = new Map(state.care_responses.map((v) => [v.id, v]));
  for (const [key, entity] of Object.entries(entityCollections)) {
    const rows = state[key as keyof typeof entityCollections];
    invariant(new Set(rows.map((v) => v.id)).size === rows.length, `${key}에 중복된 ID가 있습니다.`);
    for (const row of rows) {
      validateEntity(entity, row);
      invariant(row.clinic_id === FIXED_CLINIC_ID, '기관이 일치하지 않습니다.');
      if ('patient_id' in row) invariant(patients.has(row.patient_id), '연결된 환자가 없습니다.');
      if ('visit_id' in row) {
        const visit = visits.get(row.visit_id);
        invariant(visit, '연결된 방문이 없습니다.');
        if ('patient_id' in row) invariant(visit.patient_id === row.patient_id, '다른 환자의 방문에 연결할 수 없습니다.');
      }
      if ('source_visit_id' in row) invariant(visits.get(row.source_visit_id)?.patient_id === row.patient_id, '원본 방문의 환자가 일치하지 않습니다.');
    }
  }
  for (const visit of state.visits) {
    invariant(visit.workflow_status !== 'completed' || Boolean(visit.completed_at), '진료 완료 시간이 필요합니다.');
    invariant(visit.workflow_status === 'completed' || visit.completed_at === null, '현재 방문 상태와 완료 시간이 일치하지 않습니다.');
    invariant(visit.workflow_status === 'waiting' || Boolean(visit.started_at), '진료 시작 시간이 필요합니다.');
    const latest = state.soap_documents.filter((v) => v.visit_id === visit.id).sort((a, b) => b.revision - a.revision)[0];
    if (visit.record_status === 'approved') invariant(latest?.status === 'approved', '최신 기록이 승인되지 않았습니다.');
  }
  for (const transcript of state.transcripts) {
    invariant(state.transcripts.filter((v) => v.visit_id === transcript.visit_id && v.revision === transcript.revision).length === 1, '같은 전사 버전이 있습니다.');
  }
  for (const doc of state.soap_documents) {
    if (doc.input_transcript_id) invariant(transcripts.get(doc.input_transcript_id)?.visit_id === doc.visit_id, '기록의 전사 연결이 일치하지 않습니다.');
    if (doc.status === 'approved') invariant(doc.approved_at && doc.approved_by, '승인 정보가 없습니다.');
    invariant(state.soap_documents.filter((v) => v.visit_id === doc.visit_id && v.revision === doc.revision).length === 1, '같은 기록 버전이 있습니다.');
  }
  for (const row of state.observations) {
    invariant(Number.isFinite(row.value), '측정값은 숫자여야 합니다.');
    if (row.instrument === 'NRS') invariant(row.value >= 0 && row.value <= 10 && row.scale_min === 0 && row.scale_max === 10 && row.metric_key === 'pain_intensity', '통증 NRS는 0~10 범위입니다.');
    if (row.instrument === 'FREQUENCY') invariant(row.value >= 0, '횟수는 0 이상이어야 합니다.');
    if (row.scale_min !== null) invariant(row.value >= row.scale_min, '측정값이 척도의 최솟값보다 작습니다.');
    if (row.scale_max !== null) invariant(row.value <= row.scale_max, '측정값이 척도의 최댓값보다 큽니다.');
    for (const other of state.observations.filter((v) => v.id !== row.id && v.series_key === row.series_key)) {
      invariant(['patient_id', 'metric_key', 'instrument', 'unit', 'scale_min', 'scale_max', 'body_region', 'laterality', 'activity_key', 'measurement_context'].every((key) => other[key as keyof typeof other] === row[key as keyof typeof row]), '같은 경과 계열은 척도·부위·측정 조건이 일치해야 합니다.');
    }
    if (row.followup_answer_id) invariant(answers.get(row.followup_answer_id)?.visit_id === row.visit_id, '측정과 질문의 방문이 일치하지 않습니다.');
  }
  for (const row of state.followup_answers) {
    if (row.comparison_visit_id) invariant(visits.get(row.comparison_visit_id)?.patient_id === row.patient_id && Date.parse(visits.get(row.comparison_visit_id)!.scheduled_at) < Date.parse(visits.get(row.visit_id)!.scheduled_at), '비교 방문은 같은 환자의 이전 방문이어야 합니다.');
  }
  for (const row of state.followup_items) if (row.resolved_visit_id) invariant(visits.get(row.resolved_visit_id)?.patient_id === row.patient_id, '확인 방문의 환자가 일치하지 않습니다.');
  for (const row of state.care_messages) {
    if (row.medication_course_id) invariant(state.medication_courses.find((v) => v.id === row.medication_course_id)?.patient_id === row.patient_id, '복약 과정의 환자가 일치하지 않습니다.');
    if (['approved', 'sent'].includes(row.status)) invariant(row.approved_body?.trim() && row.approved_at, '승인된 안내 문안이 필요합니다.');
    if (row.status === 'sent') invariant(row.delivered_at && row.delivery_mode !== 'preview', '발송 결과가 필요합니다.');
  }
  for (const row of state.care_responses) {
    invariant(messages.get(row.message_id)?.patient_id === row.patient_id, '응답의 안내 대상이 일치하지 않습니다.');
    if (row.option === 'discomfort') invariant(state.contact_tasks.some((v) => v.response_id === row.id), '불편 응답에는 연락 작업이 필요합니다.');
  }
  for (const row of state.contact_tasks) {
    invariant(responses.get(row.response_id)?.patient_id === row.patient_id, '연락 작업의 대상이 일치하지 않습니다.');
    if (row.status === 'closed') invariant(row.closed_at && row.closed_by && row.resolution_note?.trim(), '연락 종료에는 처리 기록이 필요합니다.');
  }
  for (const key of ['annotations', 'recordings', 'jobs', 'audioSessions', 'live_events'] as const) {
    invariant(new Set(state[key].map((v) => v.id)).size === state[key].length, `${key} 중복 ID가 있습니다.`);
    for (const row of state[key]) {
      invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id), '실행 데이터 ID 형식을 확인해 주세요.');
      invariant(row.clinic_id === FIXED_CLINIC_ID && visits.has(row.visit_id), '실행 데이터의 방문과 기관을 확인해 주세요.');
    }
  }
  for (const annotation of state.annotations) {
    invariant(annotation.coordinate_space === 'normalized' && annotation.coordinate_version === 'body-map-v1', '필기 좌표 형식이 맞지 않습니다.');
    invariant(Array.isArray(annotation.strokes) && annotation.strokes.length <= 2000, '필기 획이 너무 많거나 형식이 잘못되었습니다.');
    invariant(Number.isFinite(annotation.canvas_size.width) && Number.isFinite(annotation.canvas_size.height) && annotation.canvas_size.width > 0 && annotation.canvas_size.height > 0, '필기 화면 크기가 잘못되었습니다.');
    invariant(new Set(annotation.strokes.map((v) => v.id)).size === annotation.strokes.length, '중복된 필기 획이 있습니다.');
    for (const stroke of annotation.strokes) {
      invariant(typeof stroke.id === 'string' && stroke.id.length > 0 && ['memo', 'check'].includes(stroke.kind) && Number.isFinite(Date.parse(stroke.created_at)), '필기 획 형식을 확인해 주세요.');
      invariant(Array.isArray(stroke.points) && stroke.points.length <= 10000, '필기 점이 너무 많거나 형식이 잘못되었습니다.');
      for (const point of stroke.points) invariant(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && Number.isFinite(point.t) && (point.pressure === undefined || Number.isFinite(point.pressure) && point.pressure >= 0 && point.pressure <= 1), '필기 좌표는 0~1 범위여야 합니다.');
    }
  }
  for (const recording of state.recordings) invariant(recording.size_bytes >= 0 && Number.isFinite(recording.size_bytes), '파일 크기가 올바르지 않습니다.');
  if (state.jobs.filter((v) => v.status === 'queued' || v.status === 'running').length > 2) throw new AppError(429, 'AI_CONCURRENCY_LIMIT', '처리 중인 작업이 있습니다. 완료 후 다시 시도해 주세요.');
}
