import { createHash } from 'node:crypto';
import type { AppState, Segment, SoapDocument, SoapInputSnapshot, SourceRef, Transcript } from '@/lib/types';
import { AppError } from '@/lib/server/errors';

export type ClinicalSoapSource = {
  id: string; record_id: string; kind: 'treatment' | 'treatment_finding' | 'handwriting' | 'followup_answer' | 'observation';
  text: string; allowed_sections: ('s' | 'o' | 'a' | 'p')[]; revision: number | null;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sides = { left: '좌측', right: '우측', bilateral: '양측', midline: '정중선', not_applicable: '좌우 해당 없음' };
const procedures = { acupuncture: '침', pharmacopuncture: '약침', moxibustion: '뜸', cupping: '부항', tuina: '추나' };

/** Structured records render deterministically; nothing unconfirmed is an AI fact input. */
export function collectClinicalSoapSources(state: AppState, visitId: string): ClinicalSoapSource[] {
  const visit = state.visits.find(v => v.id === visitId && (!v.clinic_id || v.clinic_id === state.clinic.id));
  if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
  const sources: ClinicalSoapSource[] = [];
  for (const row of state.treatments ?? []) {
    if (row.visit_id !== visitId || row.clinic_id !== state.clinic.id || row.status !== 'confirmed') continue;
    const name = row.technique === 'needle_knife' ? '도침' : procedures[row.modality];
    const locations = row.locations?.map(l => `${l.label_ko ?? l.acupoint_code ?? l.location_type} (${sides[l.laterality] ?? l.laterality} ${l.body_region})${l.location_note ? `: ${l.location_note}` : ''}`).join('; ');
    const points = row.acupoints.map(p => `${p.label_ko}(${p.code})`).join(', ');
    const text = `의료진 시행 확인: ${name}. 부위: ${row.body_region}. 좌우: ${sides[row.laterality]}. 선택 위치: ${locations || points || '경혈 미지정'}.${row.notes ? ` 시술자 메모: ${row.notes}` : ''}`;
    sources.push({ id: `treatment:${row.id}`, record_id: row.id, kind: 'treatment', text, allowed_sections: ['p'], revision: null });
    for (const [index, location] of (row.locations ?? []).entries()) {
      if (!location.location_type.includes('tender') || !location.location_note?.trim()) continue;
      sources.push({ id: `finding:${row.id}:${index}`, record_id: row.id, kind: 'treatment_finding', text: `의료진 확인 압통 위치: ${sides[location.laterality] ?? location.laterality} ${location.body_region}. ${location.location_note}`, allowed_sections: ['o'], revision: null });
    }
  }
  for (const row of state.annotations ?? []) {
    if (row.visit_id !== visitId || row.clinic_id !== state.clinic.id || !row.extraction_reviewed || !row.extracted_text?.trim()) continue;
    sources.push({ id: `handwriting:${row.id}`, record_id: row.id, kind: 'handwriting', text: row.extracted_text, allowed_sections: ['s', 'o', 'a', 'p'], revision: row.revision });
  }
  for (const row of state.followup_answers ?? []) {
    if (row.visit_id !== visitId || row.patient_id !== visit.patient_id || row.clinic_id !== state.clinic.id || row.review_status !== 'reviewed' || row.confirmation_status !== 'confirmed' || row.applicability !== 'applicable' || !row.answer_text?.trim()) continue;
    sources.push({ id: `answer:${row.id}`, record_id: row.id, kind: 'followup_answer', text: `의료진 확인 환자/보호자 보고. 질문: ${row.question_text}\n답변: ${row.answer_text}${row.change ? `\n기록된 변화: ${row.change}` : ''}`, allowed_sections: ['s'], revision: null });
  }
  const latest = new Map<string, (AppState['observations'])[number]>();
  for (const row of state.observations ?? []) {
    if (row.visit_id !== visitId || row.patient_id !== visit.patient_id || row.clinic_id !== state.clinic.id || row.review_status !== 'reviewed') continue;
    const previous = latest.get(row.series_key);
    if (!previous || row.measured_at >= previous.measured_at) latest.set(row.series_key, row);
  }
  for (const row of latest.values()) {
    sources.push({ id: `observation:${row.id}`, record_id: row.id, kind: 'observation', text: `의료진 확인 보고 수치: ${row.instrument} ${row.metric_key} ${row.value} ${row.unit}${row.scale_min !== null && row.scale_max !== null ? ` (척도 ${row.scale_min}~${row.scale_max})` : ''}. 부위: ${row.body_region ?? '미지정'}, 좌우: ${row.laterality ? sides[row.laterality] : '미지정'}, 활동: ${row.activity_key ?? '미지정'}. 측정 조건: ${row.measurement_context}.`, allowed_sections: ['s'], revision: null });
  }
  return sources.sort((a,b) => a.id.localeCompare(b.id));
}
export function soapInputSnapshot(state: AppState, transcript: Transcript): SoapInputSnapshot {
  const sources = collectClinicalSoapSources(state, transcript.visit_id).map(source => ({ id: source.id, record_id: source.record_id, kind: source.kind, revision: source.revision, digest: digest(source) }));
  return { hash: digest({ transcript: { id: transcript.id, revision: transcript.revision, text: transcript.text, segments: transcript.segments }, sources }), transcript_id: transcript.id, transcript_revision: transcript.revision, sources };
}
export function assertSoapInputsCurrent(state: AppState, document: SoapDocument) {
  if (!document.input_snapshot) return;
  const latest = state.transcripts.filter(t => t.visit_id === document.visit_id).sort((a,b) => b.revision-a.revision)[0];
  if (!latest || latest.id !== document.input_snapshot.transcript_id || soapInputSnapshot(state, latest).hash !== document.input_snapshot.hash) {
    throw new AppError(409, 'STALE_SOAP_INPUT', '전사·확인 시술·검토 필기·재진 입력이 변경되었습니다. 최신 입력으로 SOAP를 갱신하고 검토해 주세요.');
  }
}
export function soapEvidenceRef(id: string, quote: string, segments: Segment[], sources: ClinicalSoapSource[]): SourceRef {
  if (segments.some(s => s.id === id)) return { kind: 'provided_transcript', source_id: id, quote, origin: 'manual_demo' };
  const source = sources.find(s => s.id === id);
  if (!source) throw new AppError(502, 'SOAP_EVIDENCE_INVALID', 'SOAP 근거 기록을 확인할 수 없습니다.');
  return { kind: 'manual', source_id: source.record_id, quote, origin: 'manual_demo' };
}
