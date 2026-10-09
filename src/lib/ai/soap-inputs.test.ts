import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import seed from '../../../data/demo/patients.seed.json';
import type { AppState, SoapDocument, Transcript } from '@/lib/types';
import { collectClinicalSoapSources, soapInputSnapshot, assertSoapInputsCurrent, soapEvidenceRef } from './soap-inputs';
import { validateSoapEvidence } from './provider';
import { applyAction } from '@/lib/server/actions';

function fixture() {
  const state = { ...structuredClone(seed), annotations: [], jobs: [], recordings: [], audioSessions: [], live_events: [], liveProcedureEvents: [] } as AppState;
  const visitId = state.scenario_inputs[0].current_visit_id;
  const transcript: Transcript = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, revision: 1, status: 'reviewed', source_asset_key: 'manual_seed', origin: 'manual_demo', text: '현재 통증은 0점이에요.', segments: [{ id: randomUUID(), ordinal: 1, speaker: 'patient', text: '현재 통증은 0점이에요.', start_ms: 0, end_ms: 1000 }] };
  state.transcripts.push(transcript);
  const treatment = { id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, modality: 'acupuncture' as const, technique: 'standard_acupuncture' as const, body_region: '발목', laterality: 'right' as const, acupoints: [{ code: 'GB40', label_ko: '구허' }], status: 'confirmed' as const, source: 'manual' as const, notes: null, origin: 'manual_demo' as const };
  state.treatments.push(treatment);
  return { state, visitId, transcript, treatment };
}
function docFor(state: AppState, transcript: Transcript): SoapDocument {
  return { id: randomUUID(), clinic_id: state.clinic.id, visit_id: transcript.visit_id, revision: 1, input_transcript_id: transcript.id, input_snapshot: soapInputSnapshot(state, transcript), status: 'draft', sections: { s: '', o: '', a: '', p: '우측 발목 구허에 침 시행 확인.' }, source_refs: [], approved_at: null, approved_by: null, origin: 'manual_demo' };
}
describe('confirmed multi-source SOAP inputs', () => {
  it('excludes unconfirmed procedures, unbound handwriting and other visits', () => {
    const { state, visitId, treatment } = fixture();
    state.treatments.push({ ...treatment, id: randomUUID(), status: 'suggested' });
    state.annotations.push({ id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, extraction_reviewed: false, extracted_text: '아직 미검토', revision: 2 } as any);
    const sources = collectClinicalSoapSources(state, visitId);
    expect(sources).toHaveLength(1); expect(sources[0].text).toContain('시행 확인');
    expect(sources[0].text).toContain('구허(GB40)'); expect(sources[0].allowed_sections).toEqual(['p']);
  });
  it('keeps reviewed handwriting, confirmed answers and numeric zero as separately cited sources', () => {
    const { state, visitId, transcript } = fixture(); const patientId = state.visits.find(v => v.id === visitId)!.patient_id;
    const annotationId = randomUUID();
    state.annotations.push({ id: annotationId, clinic_id: state.clinic.id, visit_id: visitId, extraction_reviewed: true, extracted_text: '우측 발목 부종 관찰', revision: 2 } as any);
    state.followup_answers.push({ id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, patient_id: patientId, item_key: 'sleep', subitem_key: 'sleep_quality', question_text: '수면은 어떤가요?', answer_text: '잘 잤어요.', change: null, confirmation_status: 'confirmed', applicability: 'applicable', comparison_visit_id: null, source_refs: [], review_status: 'reviewed', origin: 'manual_demo' });
    state.observations.push({ ...state.observations[0], id: randomUUID(), visit_id: visitId, patient_id: patientId, followup_answer_id: null, series_key: 'current-zero', instrument: 'NRS', metric_key: 'pain_intensity', value: 0, unit: 'score', scale_min: 0, scale_max: 10, review_status: 'reviewed' });
    const sources = collectClinicalSoapSources(state, visitId);
    expect(sources.some(s => s.text.includes('0 score'))).toBe(true);
    expect(sources.some(s => s.kind === 'followup_answer')).toBe(true);
    const handwritten = sources.find(s => s.kind === 'handwriting')!;
    expect(soapEvidenceRef(handwritten.id, handwritten.text, transcript.segments, sources)).toMatchObject({ kind: 'manual', source_id: annotationId, quote: handwritten.text });
  });
  it('freezes reviewed text as well as revision; changes prevent approval until regeneration', () => {
    const { state, visitId, transcript } = fixture();
    state.annotations.push({ id: randomUUID(), clinic_id: state.clinic.id, visit_id: visitId, extraction_reviewed: true, extracted_text: '우측 압통', revision: 1 } as any);
    const doc = docFor(state, transcript); state.soap_documents.push(doc);
    state.annotations[0].extracted_text = '좌측 압통';
    expect(() => assertSoapInputsCurrent(state, doc)).toThrow('최신 입력');
    expect(() => applyAction(state, { type: 'soap.approve', payload: { visitId, soapId: doc.id } })).toThrow('최신 입력');
    expect(doc.status).toBe('draft');
  });
  it('ignores edits to unused candidates but changes the fingerprint when a procedure is confirmed', () => {
    const { state, transcript, treatment } = fixture(); const before = soapInputSnapshot(state, transcript).hash;
    const extra = { ...treatment, id: randomUUID(), status: 'suggested' as const }; state.treatments.push(extra);
    expect(soapInputSnapshot(state, transcript).hash).toBe(before);
    state.treatments.at(-1)!.status = 'confirmed'; expect(soapInputSnapshot(state, transcript).hash).not.toBe(before);
  });
  it('keeps the original source snapshot in a manually edited draft and preserves approved records', () => {
    const { state, visitId, transcript } = fixture(); const doc = docFor(state, transcript); state.soap_documents.push(doc);
    const originalApprovals = state.soap_documents.filter(d => d.status === 'approved').map(d => JSON.stringify(d));
    applyAction(state, { type: 'soap.save', payload: { visitId, soapId: doc.id, sections: { ...doc.sections, p: '검토한 시술 문안 수정' } } });
    expect(state.soap_documents.at(-1)!.input_snapshot).toEqual(doc.input_snapshot);
    expect(state.soap_documents.filter(d => d.status === 'approved').map(d => JSON.stringify(d))).toEqual(originalApprovals);
  });
  it('checks exact quotations, section eligibility and unsupported numbers across source kinds', () => {
    const { state, visitId, transcript } = fixture(); const sources = collectClinicalSoapSources(state, visitId);
    const source = sources[0]; const result = { sections: { s: '', o: '', a: '', p: '구허(GB40)에 침 시행 확인.' }, evidence: [{ section: 'p' as const, segment_id: source.id, quote: source.text }], warnings: [], followup_questions: [] };
    expect(validateSoapEvidence(result, transcript.segments, sources)).toBe(result);
    expect(() => validateSoapEvidence({ ...result, evidence: [{ ...result.evidence[0], section: 'o' }] }, transcript.segments, sources)).toThrow('SOAP_SOURCE_SECTION_INVALID');
    expect(() => validateSoapEvidence({ ...result, sections: { ...result.sections, p: '침 3회 시행 확인.' } }, transcript.segments, sources)).toThrow('SOAP_NUMBER_UNSUPPORTED');
  });
});

it('includes only the current successful AI extraction as a draft source and warns before SOAP approval',()=>{
 const {state,visitId,transcript}=fixture();const id=randomUUID();
 state.annotations.push({id,clinic_id:state.clinic.id,visit_id:visitId,revision:2,extraction_reviewed:false,extracted_text:'우측 발목 부종 관찰'} as any);
 state.jobs.push({id:randomUUID(),clinic_id:state.clinic.id,visit_id:visitId,kind:'handwriting',status:'waiting_review',stage:'review_needed',input_hash:'memo',created_at:'now',updated_at:'now',result:{annotationId:id,revision:2,text:'우측 발목 부종 관찰',stale_input:false}});
 const sources=collectClinicalSoapSources(state,visitId),note=sources.find(source=>source.record_id===id)!;
 expect(note.review_status).toBe('ai_draft');const result=validateSoapEvidence({sections:{s:'',o:'우측 발목 부종 관찰.',a:'',p:''},evidence:[{section:'o',segment_id:note.id,quote:'우측 발목 부종 관찰'}],warnings:[],followup_questions:[]},transcript.segments,sources);
 expect(result.warnings.join(' ')).toContain('SOAP 승인 전에');
 state.annotations.at(-1)!.revision=3;expect(collectClinicalSoapSources(state,visitId).some(source=>source.record_id===id)).toBe(false);
});
