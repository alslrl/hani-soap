export type ProcedureCandidate = {
  modality: 'acupuncture' | 'pharmacopuncture' | 'moxibustion' | 'cupping' | 'tuina';
  technique: 'standard_acupuncture' | 'needle_knife' | null;
  context: 'current' | 'planned' | 'past' | 'negated' | 'unclear';
  keyword: string;
  text: string;
  start: number;
  end: number;
};

const terms = [
  { keyword: '약침', modality: 'pharmacopuncture', technique: null },
  { keyword: '도침', modality: 'acupuncture', technique: 'needle_knife' },
  { keyword: '침', modality: 'acupuncture', technique: 'standard_acupuncture' },
  { keyword: '뜸', modality: 'moxibustion', technique: null },
  { keyword: '부항', modality: 'cupping', technique: null },
  { keyword: '추나', modality: 'tuina', technique: null },
] as const;

/** Candidates only: a keyword never proves that treatment was performed. */
export function detectProcedures(text: string): ProcedureCandidate[] {
  const result: ProcedureCandidate[] = [];
  const pattern = /약침|도침|부항|추나|침|뜸/g;
  const matches = [...text.matchAll(pattern)].filter((match) => {
    const start = match.index!;
    return match[0] !== '침' || (!/[가-힣]/.test(text[start - 1] || '') && !/[대샘착묵범전입수]/.test(text[start + 1] || ''));
  });
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const start = match.index!;
    // Avoid ordinary words such as 아침, 기침, 침대, 침샘, 침착 and 이침.
    if (match[0] === '침' && /[가-힣]/.test(text[start - 1] || '')) continue;
    if (match[0] === '침' && /[대샘착묵범전입수]/.test(text[start + 1] || '')) continue;
    const leftBoundary = Math.max(text.lastIndexOf('.', start - 1), text.lastIndexOf('\n', start - 1), text.lastIndexOf(',', start - 1));
    const after = text.slice(start).search(/[.!?\n,]/);
    const clauseEnd = after < 0 ? text.length : start + after;
    const clause = text.slice(leftBoundary + 1, clauseEnd).trim();
    const previous = matches[index - 1];
    const next = matches[index + 1];
    const localStart = previous && previous.index! > leftBoundary ? previous.index! + previous[0].length : leftBoundary + 1;
    const localEnd = next && next.index! < clauseEnd ? next.index! : clauseEnd;
    let before = text.slice(localStart, start);
    const presentMarker = Math.max(before.lastIndexOf('오늘'), before.lastIndexOf('지금'));
    if (presentMarker >= 0) before = before.slice(presentMarker);
    const following = text.slice(start + match[0].length, localEnd);
    const scoped = before + match[0] + following;
    let context: ProcedureCandidate['context'] = 'unclear';
    if (/(안\s*(?:맞|놓|하)|하지\s*않|않을|않았|않겠|금기|빼고|제외|말고|필요\s*없)/.test(following) || /안\s*$/.test(before)) context = 'negated';
    else if (/(어제|지난|전에|예전|과거|받았|맞았|했었)/.test(scoped)) context = 'past';
    else if (/(계획|예정|할\s*게|할게|하겠|하겠습니다|놓겠|놓을|하실|해\s*드릴|해드릴|해볼|병행|하자|할까요|할\s*거)/.test(scoped)) context = 'planned';
    else if (!/(지금|오늘)/.test(scoped) && /(어제|지난|전에|예전|과거)/.test(clause)) context = 'past';
    else if (/(계획|예정|병행)/.test(clause)) context = 'planned';
    else if (/(지금|오늘|시작|진행|시행|놓고|놓는|놓았|놓겠습니다|합니다|하겠습니다|하자)/.test(before + following)) context = 'current';
    const term = terms.find((item) => item.keyword === match[0])!;
    result.push({ ...term, context, text: clause, start, end: start + match[0].length });
  }
  return result;
}
