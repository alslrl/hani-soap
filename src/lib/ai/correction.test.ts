import { describe, expect, it } from 'vitest';
import { applyAcceptedCorrections, validateCorrections, type CorrectionSpan, type DictionaryTerm } from './correction';
import { editDistance, retrieveCorrectionSpans } from './dictionary';
const term: DictionaryTerm = { id: 'term-1', term: '보중익기탕', hanja: '補中益氣湯', kind: 'prescription', source_ids: ['textbook-1'], sources: [{ id: 'textbook-1', title: '교재', original: '보중익기탕' }] };
const raw = '보중이기탕을 처방할게요.';
const span: CorrectionSpan = { id: 'span-0-5', start: 0, end: 5, original: '보중이기탕', candidates: [term] };
describe('dictionary correction review', () => {
  it('only retrieves supplied terms and preserves source provenance', () => {
    const spans = retrieveCorrectionSpans(raw, [term]);
    expect(spans).toHaveLength(1);
    expect(spans[0].candidates[0].source_ids).toEqual(['textbook-1']);
  });
  it('keeps exact matches unchanged', () => expect(retrieveCorrectionSpans('보중익기탕을 처방할게요.', [term])).toEqual([]));
  it('rejects invented candidate IDs', () => expect(() => validateCorrections(raw, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: 'invented', reason: '' }])).toThrow('CORRECTION_CANDIDATE_INVALID'));
  it('rejects mismatched original offsets', () => expect(() => validateCorrections('새 ' + raw, [span], [{ span_id: span.id, decision: 'retain', candidate_id: null, reason: '' }])).toThrow('CORRECTION_SPAN_INVALID'));
  it('rejects duplicate span decisions', () => {
    const decision = { span_id: span.id, decision: 'retain' as const, candidate_id: null, reason: '' };
    expect(() => validateCorrections(raw, [span], [decision, decision])).toThrow('CORRECTION_SPAN_INVALID');
  });
  it('does not apply unreviewed proposals', () => {
    const corrections = validateCorrections(raw, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: term.id, reason: '후보' }]);
    expect(applyAcceptedCorrections(raw, corrections)).toBe(raw);
    expect(applyAcceptedCorrections(raw, corrections.map((item) => ({ ...item, review_status: 'accepted' })))).toBe('보중익기탕을 처방할게요.');
    expect(raw).toBe('보중이기탕을 처방할게요.');
  });
  it('rejects overlapping accepted changes', () => {
    const corrections = validateCorrections(raw, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: term.id, reason: '' }]).map((item) => ({ ...item, review_status: 'accepted' as const }));
    expect(() => applyAcceptedCorrections(raw, [...corrections, ...corrections])).toThrow('CORRECTION_OVERLAP_OR_STALE');
  });
  it('retains uncertain text', () => {
    expect(validateCorrections(raw, [span], [{ span_id: span.id, decision: 'unclear', candidate_id: null, reason: '불명확' }])[0].replacement).toBeNull();
  });
  it('calculates candidate edit distance without changing the text', () => expect(editDistance('보중이기탕', '보중익기탕')).toBe(1));
  it('rejects a replacement form not declared by the source candidate', () => {
    const changed = { ...span, candidates: [{ ...term, matched_form: '임의 처방' }] };
    expect(() => validateCorrections(raw, [changed], [{ span_id: span.id, decision: 'suggest', candidate_id: term.id, reason: '' }])).toThrow('CORRECTION_FORM_INVALID');
  });
  it('protects numbers and explicit laterality even when a candidate ID is valid', () => {
    for (const [original, replacement] of [['처방1', '처방2'], ['우측발목염자', '좌측발목염좌']]) {
      const candidate = { ...term, term: replacement };
      const protectedSpan = { id: 'protected', start: 0, end: original.length, original, candidates: [candidate] };
      expect(() => validateCorrections(original, [protectedSpan], [{ span_id: 'protected', decision: 'suggest', candidate_id: term.id, reason: '' }])).toThrow('CORRECTION_PROTECTED_VALUE');
    }
  });
  it('makes omitted model decisions explicit and keeps their original wording', () => {
    const reviewed = validateCorrections(raw, [span], []);
    expect(reviewed).toMatchObject([{ span_id: span.id, decision: 'unclear', replacement: null, review_status: 'pending' }]);
    expect(applyAcceptedCorrections(raw, reviewed)).toBe(raw);
  });
});
