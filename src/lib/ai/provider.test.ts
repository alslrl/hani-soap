import { describe, expect, it } from 'vitest';
import { validateSoapEvidence, type SoapGeneration } from './provider';
import type { Segment } from '@/lib/types';
const segments: Segment[] = [{ id: 'known-segment', ordinal: 1, speaker: 'patient', text: '오른쪽 발목이 아프고 통증은 8점이에요.', start_ms: 0, end_ms: 3000 }];
const valid: SoapGeneration = { sections: { s: '우측 발목 통증 NRS 8점 호소.', o: '', a: '', p: '' }, evidence: [{ section: 's', segment_id: 'known-segment', quote: '오른쪽 발목이 아프고 통증은 8점이에요.' }], warnings: [], followup_questions: [] };
describe('SOAP evidence boundary', () => {
  it('accepts exact quotations from the input segment', () => expect(validateSoapEvidence(valid, segments)).toBe(valid));
  it('rejects a fabricated citation ID', () => expect(() => validateSoapEvidence({ ...valid, evidence: [{ ...valid.evidence[0], segment_id: 'invented' }] }, segments)).toThrow('SOAP_EVIDENCE_INVALID'));
  it('rejects a quote that silently changes laterality or numbers', () => expect(() => validateSoapEvidence({ ...valid, evidence: [{ ...valid.evidence[0], quote: '왼쪽 발목 통증 5점' }] }, segments)).toThrow('SOAP_EVIDENCE_INVALID'));
  it('rejects a filled assessment section with no supporting evidence', () => expect(() => validateSoapEvidence({ ...valid, sections: { ...valid.sections, a: '발목 염좌로 진단함.' } }, segments)).toThrow('SOAP_SECTION_WITHOUT_EVIDENCE'));
});
