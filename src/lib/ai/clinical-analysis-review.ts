import { canonicalMeasurementRegion, clinicalMeasurementMetricKey } from './clinical-measurement-conditions';
import { AppError } from '@/lib/server/errors';
import { applyAction } from '@/lib/server/actions';
import { analysisHash, questionFields, validField, type AnalysisCandidate, type MeasurementCandidate } from './clinical-analysis';
import type { ReviewedPatientSignal } from './clinical-analysis-context';
import type { AppState, SourceRef } from '@/lib/types';

export type AnalysisReviewInput = { jobId: string; candidateId: string; visitId: string; patientId: string; expectedTranscriptRevision: number; decision: 'confirm' | 'reject'; edit?: { text?: string; value?: number }; allowOverwrite?: boolean; expectedTargetHash?: string };
const manualRef = (sessionId: string, quote: string): SourceRef => ({ kind: 'manual', source_id: sessionId, quote, origin: 'manual_demo' });
export function analysisTarget(state: AppState, visitId: string, candidate: AnalysisCandidate) {
  const answer = candidate.kind !== 'signal' ? state.followup_answers.find(item => item.visit_id === visitId && item.item_key === candidate.item_key && item.subitem_key === candidate.subitem_key) : undefined;
  const metrics = candidate.kind === 'measurement' ? state.observations.filter(item => item.visit_id === visitId && item.metric_key === clinicalMeasurementMetricKey(candidate) && item.instrument === candidate.instrument && item.unit === candidate.unit && canonicalMeasurementRegion(item.body_region) === canonicalMeasurementRegion(candidate.body_region) && item.laterality === candidate.laterality && item.activity_key === candidate.activity_key && item.measurement_context === candidate.measurement_context) : [];
  const occupied = candidate.kind === 'answer' ? Boolean(answer && (answer.answer_text?.trim() || answer.confirmation_status === 'confirmed' || answer.applicability !== 'unknown')) : candidate.kind === 'measurement' ? metrics.length > 0 : false;
  return { answer, metrics, occupied, targetHash: analysisHash(candidate.kind === 'answer' ? answer ?? null : metrics), current: candidate.kind === 'answer' ? answer?.answer_text ?? '' : metrics.map(item => `${item.value}${({ score: '점', episodes_per_night: '회/밤', count_per_night: '회/밤', count_per_day: '회/일' } as Record<string,string>)[item.unit] ?? item.unit}`).join(', ') };
}
function validateEditedMeasurement(candidate: MeasurementCandidate, value: number) {
  if (!Number.isFinite(value) || value < 0 || candidate.instrument === 'NRS' && (!Number.isInteger(value) || value > 10) || ['FREQUENCY','APP_FUNCTION_DISCOMFORT'].includes(candidate.instrument) && !Number.isInteger(value) || !['NRS','FREQUENCY'].includes(candidate.instrument) && value > 10) throw new AppError(400, 'INVALID_MEASUREMENT', '점수·횟수 범위를 확인해 주세요. NRS는 0~10 정수입니다.');
}
export function reviewClinicalCandidate(state: AppState, input: AnalysisReviewInput, sessionId: string) {
  const job = state.jobs.find(item => item.id === input.jobId && item.kind === 'analysis' && item.result?.task === 'clinical_analysis' && item.clinic_id === state.clinic.id);
  const visit = state.visits.find(item => item.id === input.visitId && item.patient_id === input.patientId);
  const latest = state.transcripts.filter(item => item.visit_id === input.visitId).sort((a,b) => b.revision-a.revision)[0];
  if (!job || !visit || job.visit_id !== visit.id || job.result?.patientId !== input.patientId) throw new AppError(404, 'ANALYSIS_NOT_FOUND', '같은 환자·방문의 분석을 선택해 주세요.');
  if (!latest || latest.id !== job.result?.transcriptId || latest.revision !== input.expectedTranscriptRevision || latest.revision !== job.result?.input_transcript_revision || job.result?.stale_input === true) throw new AppError(409, 'ANALYSIS_STALE', '새 전사가 있습니다. 최신 전사로 다시 분석해 주세요.');
  if (job.status !== 'waiting_review' && job.status !== 'completed') throw new AppError(409, 'ANALYSIS_NOT_READY', '분석이 끝난 뒤 후보를 검토해 주세요.');
  const candidates = job.result?.candidates as AnalysisCandidate[] | undefined;
  const candidate = candidates?.find(item => item.id === input.candidateId);
  if (!candidate || !['confirm','reject'].includes(input.decision)) throw new AppError(400, 'INVALID_ANALYSIS_REVIEW', '검토할 후보를 확인해 주세요.');
  if (!candidate.source_refs.length || candidate.source_refs.some(ref => ref.kind !== 'provided_transcript' || !latest.segments.some(segment => segment.id === ref.source_id && typeof ref.quote === 'string' && ref.quote.trim() && segment.text.includes(ref.quote)))) throw new AppError(409, 'ANALYSIS_EVIDENCE_CHANGED', '전사 근거가 일치하지 않습니다. 다시 분석해 주세요.');
  if (candidate.kind !== 'signal' && !validField(candidate.item_key, candidate.subitem_key)) throw new AppError(400, 'INVALID_ANALYSIS_FIELD', '질문 항목이 일치하지 않습니다.');
  if (input.edit && (Object.keys(input.edit).some(key => !['text','value'].includes(key)) || input.edit.text !== undefined && (typeof input.edit.text !== 'string' || !input.edit.text.trim() || input.edit.text.length > 5000) || input.edit.value !== undefined && (candidate.kind !== 'measurement' || typeof input.edit.value !== 'number'))) throw new AppError(400, 'INVALID_ANALYSIS_EDIT', '수정할 후보 내용을 확인해 주세요.');
  const reviewHash = analysisHash([input.decision, input.edit?.text ?? null, input.edit?.value ?? null]);
  if (candidate.status !== 'pending') {
    if (candidate.review_hash === reviewHash) return { reused: true, savedIds: candidate.saved_ids ?? [] };
    throw new AppError(409, 'ANALYSIS_ALREADY_REVIEWED', '이미 검토한 후보입니다. 기존 입력 화면에서 수정해 주세요.');
  }
  const target = analysisTarget(state, visit.id, candidate);
  if (input.decision === 'confirm' && target.occupied && (!input.allowOverwrite || input.expectedTargetHash !== target.targetHash)) throw new AppError(409, 'ANALYSIS_ENTRY_CONFLICT', '이미 저장된 의료진 입력이 있습니다. 현재 기록을 확인하고 명시적으로 교체를 선택해 주세요.', { candidateId: candidate.id, targetHash: target.targetHash, current: target.current });
  const now = new Date().toISOString(), savedIds: string[] = [];
  const text = input.edit?.text ?? candidate.text;
  const edited = text !== candidate.text || candidate.kind === 'measurement' && input.edit?.value !== undefined && input.edit.value !== candidate.value;
  const refs = [...candidate.source_refs, ...(edited ? [manualRef(sessionId, candidate.kind === 'measurement' ? `${text}\n검토 측정값: ${input.edit?.value ?? candidate.value} ${candidate.unit}` : text)] : [])];
  if (input.decision === 'confirm') {
    if (candidate.kind === 'answer') {
      applyAction(state, { type: 'followup.answer', payload: { visitId: visit.id, item_key: candidate.item_key, subitem_key: candidate.subitem_key, question_text: target.answer?.question_text ?? questionFields.find(field => field.item_key === candidate.item_key && field.subitem_key === candidate.subitem_key)!.question, answer_text: text, change: candidate.change, confirmation_status: 'confirmed', applicability: 'applicable' } }, sessionId);
      const answer = state.followup_answers.find(item => item.visit_id === visit.id && item.item_key === candidate.item_key && item.subitem_key === candidate.subitem_key)!;
      answer.source_refs = refs; savedIds.push(answer.id);
    } else if (candidate.kind === 'measurement') {
      const value = input.edit?.value ?? candidate.value; validateEditedMeasurement(candidate, value);
      const metricKey = clinicalMeasurementMetricKey(candidate);
      const patient = state.patients.find(item => item.id === visit.patient_id)!;
      const compatible = state.observations.find(item => item.patient_id === patient.id && item.metric_key === metricKey && item.instrument === candidate.instrument && item.unit === candidate.unit && item.body_region === candidate.body_region && item.laterality === candidate.laterality && item.activity_key === candidate.activity_key && item.measurement_context === candidate.measurement_context);
      applyAction(state, { type: 'observation.save', payload: { visitId: visit.id, followupAnswerId: target.answer?.id, metric_key: metricKey, series_key: compatible?.series_key ?? `${patient.demo_key}:${metricKey}:${candidate.instrument}:${candidate.body_region ?? 'none'}:${candidate.laterality ?? 'none'}:${candidate.activity_key ?? 'none'}:${candidate.measurement_context}:${candidate.unit}:analysis-v1`, instrument: candidate.instrument, value, unit: candidate.unit, scale_min: 0, scale_max: candidate.instrument === 'FREQUENCY' ? null : 10, body_region: candidate.body_region, laterality: candidate.laterality, activity_key: candidate.activity_key, measurement_context: candidate.measurement_context } }, sessionId);
      const observation = state.observations.at(-1)!; observation.source_refs = refs; savedIds.push(observation.id);
    } else {
      const signals = (job.result?.reviewed_signals ?? []) as ReviewedPatientSignal[];
      signals.push({ id: candidate.id, category: candidate.category, topic: candidate.topic, text, source_refs: candidate.source_refs, reviewed_at: now });
      job.result!.reviewed_signals = signals; savedIds.push(candidate.id);
    }
  }
  Object.assign(candidate, { status: input.decision === 'confirm' ? 'confirmed' : 'rejected', reviewed_at: now, reviewed_by: sessionId, review_hash: reviewHash, saved_ids: savedIds, ...(edited ? { manual_review: { text, ...(candidate.kind === 'measurement' ? { value: input.edit?.value ?? candidate.value } : {}), source_ref: refs.at(-1) } } : {}), ...(target.occupied && input.decision === 'confirm' ? { replaced_target: { answer: target.answer ? structuredClone(target.answer) : null, observations: structuredClone(target.metrics) } } : {}) });
  job.updated_at = now;
  if (candidates!.every(item => item.status !== 'pending')) { job.status = 'completed'; job.stage = 'clinical_analysis_completed'; }
  return { reused: false, savedIds };
}
