export type DictionaryTerm = {
  id: string;
  term: string;
  hanja: string | null;
  kind: 'pattern' | 'prescription';
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
  const seen = new Set<string>();
  return decisions.map((decision) => {
    const span = spans.find((item) => item.id === decision.span_id);
    if (!span || seen.has(span.id) || text.slice(span.start, span.end) !== span.original) throw new Error('CORRECTION_SPAN_INVALID');
    seen.add(span.id);
    const candidate = decision.candidate_id ? span.candidates.find((item) => item.id === decision.candidate_id) : null;
    if (decision.decision === 'suggest' && !candidate) throw new Error('CORRECTION_CANDIDATE_INVALID');
    if (decision.decision !== 'suggest' && decision.candidate_id !== null) throw new Error('CORRECTION_DECISION_INVALID');
    return { ...decision, start: span.start, end: span.end, original: span.original, replacement: candidate?.term ?? null, candidate: candidate ?? null, review_status: 'pending' };
  });
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
