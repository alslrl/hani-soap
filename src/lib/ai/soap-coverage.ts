import type { Segment } from '@/lib/types';
export type ClinicalFact = { segment_id: string; quote: string; section: 's' | 'o' | 'a' | 'p'; numbers: string[]; status: 'supported' | 'speaker_review' };
export function transcriptFacts(segments: Segment[]): ClinicalFact[] {
  return segments.flatMap(s => {
    if (/[?？]/.test(s.text) || /생년월일|성함|제 이름|학생의사|(?:19|20)\d{2}년\s*\d{1,2}월\s*\d{1,2}일(?:생)?[, ]*[가-힣]{2,5}(?:입니다|이에요|예요)/.test(s.text)) return [];
    const numbers = s.text.match(/\d+(?:\.\d+)?/g) ?? [];
    const measurement = /측정|부종|cm|센티|도 정도|맥을|혀는|혀가|백태|설태/.test(s.text) && !/보겠습니다|볼\s*텐데|측정할|확인할 예정|확인해 보|측정해 보|방지|좋습니다|하도록|계획/.test(s.text);
    const clinicalNumber = numbers.length && /통증|점|배뇨|소변|야뇨|회|번|분|주|개월|년 전|cm|도/.test(s.text);
    if (!measurement && !clinicalNumber) return [];
    const section = s.speaker === 'patient' || s.speaker === 'guardian' ? 's' : measurement ? 'o' : /염좌|진단|평가|단계/.test(s.text) ? 'a' : 'p';
    return [{ segment_id: s.id, quote: s.text.trim(), section, numbers, status: s.speaker === 'unknown' ? 'speaker_review' : 'supported' } satisfies ClinicalFact];
  });
}
export function checkFactCoverage(facts: ClinicalFact[], result: { sections: Record<'s'|'o'|'a'|'p', string>; evidence: { section: string; segment_id: string; quote: string }[] }) {
  return facts.map(f => ({ ...f, covered: f.status === 'supported' && result.evidence.some(e => e.section === f.section && e.segment_id === f.segment_id) && f.numbers.every(n => new RegExp(`(?<!\\d)${n.replace('.', '\\.')}(?!\\d)`).test(result.sections[f.section])) }));
}
