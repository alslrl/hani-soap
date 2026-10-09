export type DictionaryTerm = {
  id: string;
  term: string;
  hanja: string | null;
  kind: 'pattern' | 'prescription' | 'clinical';
  aliases?: string[];
  matched_form?: string;
  source_ids: string[];
  sources: { id: string; title: string; original: string; url?: string }[];
};
export type CorrectionSpan = {
  id: string;
  start: number;
  end: number;
  original: string;
  candidates: DictionaryTerm[];
};
export type CorrectionDecision = {
  span_id: string;
  decision: 'suggest' | 'retain' | 'unclear';
  candidate_id: string | null;
  reason: string;
};
export type ValidatedCorrection = CorrectionDecision & {
  start: number;
  end: number;
  original: string;
  replacement: string | null;
  candidate: DictionaryTerm | null;
  review_status: 'pending' | 'accepted' | 'rejected';
};

/** Model output cannot introduce a name, a source, or an arbitrary replacement. */
export function validateCorrections(text: string, spans: CorrectionSpan[], decisions: CorrectionDecision[]): ValidatedCorrection[] {
  if (new Set(spans.map(span => span.id)).size !== spans.length || spans.some(span => span.start < 0 || span.end <= span.start || text.slice(span.start, span.end) !== span.original)) throw new Error('CORRECTION_SPAN_INVALID');
  const seen = new Set<string>();
  const validated: ValidatedCorrection[] = decisions.map((decision) => {
    const span = spans.find((item) => item.id === decision.span_id);
    if (!span || seen.has(span.id) || text.slice(span.start, span.end) !== span.original) throw new Error('CORRECTION_SPAN_INVALID');
    seen.add(span.id);
    const candidate = decision.candidate_id ? span.candidates.find((item) => item.id === decision.candidate_id) : null;
    if (decision.decision === 'suggest' && !candidate) throw new Error('CORRECTION_CANDIDATE_INVALID');
    if (decision.decision !== 'suggest' && decision.candidate_id !== null) throw new Error('CORRECTION_DECISION_INVALID');
    const replacement = candidate?.matched_form ?? candidate?.term ?? null;
    if (candidate && replacement !== candidate.term && !candidate.aliases?.includes(replacement!)) throw new Error('CORRECTION_FORM_INVALID');
    const protectedValues = (value: string) => [
      ...(value.match(/\d+(?:\.\d+)?/g) ?? []),
      ...(value.match(/좌측|우측|왼쪽|오른쪽|양측|양쪽/g) ?? []),
    ];
    if (replacement && JSON.stringify(protectedValues(span.original)) !== JSON.stringify(protectedValues(replacement))) throw new Error('CORRECTION_PROTECTED_VALUE');
    return { ...decision, start: span.start, end: span.end, original: span.original, replacement, candidate: candidate ?? null, review_status: 'pending' };
  });
  for (const span of spans) if (!seen.has(span.id)) validated.push({ span_id: span.id, decision: 'unclear', candidate_id: null, reason: '이 구간의 모델 검토 결과가 없어 원문을 유지했습니다.', start: span.start, end: span.end, original: span.original, replacement: null, candidate: null, review_status: 'pending' });
  return validated.sort((a, b) => a.start - b.start);
}

export function applyAcceptedCorrections(raw: string, corrections: ValidatedCorrection[]): string {
  const accepted = corrections.filter((item) => item.review_status === 'accepted' && item.decision === 'suggest').sort((a, b) => a.start - b.start);
  let end = -1;
  for (const item of accepted) {
    if (item.start < end || raw.slice(item.start, item.end) !== item.original || !item.replacement) throw new Error('CORRECTION_OVERLAP_OR_STALE');
    end = item.end;
  }
  let text = raw;
  for (const item of accepted.reverse()) text = text.slice(0, item.start) + item.replacement + text.slice(item.end);
  return text;
}
