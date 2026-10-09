import { beforeAll, describe, expect, it } from 'vitest';
import { loadDictionary, retrieveCorrectionSpans } from './dictionary';
import { phoneticDistance } from './phonetics';
import { applyAcceptedCorrections, validateCorrections, type DictionaryTerm } from './correction';

let terms: DictionaryTerm[];
beforeAll(async () => { terms = await loadDictionary(); });
const find = (text: string) => retrieveCorrectionSpans(text, terms);

describe('real source dictionary and phonetic retrieval', () => {
  it('finds the observed multi-syllable error without hardcoding that error as an alias', () => {
    const raw = '환자분의 현재 상태는 한의학적으로 귀패기어라고 표현할 수 있습니다.';
    const spans = find(raw);
    const span = spans.find(item => item.original === '귀패기어')!;
    const candidate = span.candidates.find(item => item.term === '비폐기허증')!;
    expect(candidate.matched_form).toBe('비폐기허');
    expect(candidate.hanja).toBe('脾肺氣虛證');
    expect(candidate.source_ids.length).toBeGreaterThan(0);
    expect(candidate.sources[0].title).toContain('K0009371');
    expect(candidate.aliases).not.toContain('귀패기어');
    expect(raw.slice(span.start, span.end)).toBe(span.original);
    const reviewed = validateCorrections(raw, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: candidate.id, reason: '문맥과 사전 후보 대조' }]);
    expect(applyAcceptedCorrections(raw, reviewed)).toBe(raw);
    expect(applyAcceptedCorrections(raw, reviewed.map(item => ({ ...item, review_status: 'accepted' })))).toBe('환자분의 현재 상태는 한의학적으로 비폐기허라고 표현할 수 있습니다.');
  });
  it('supports pattern particles and optional 증 without rewriting correct spoken names', () => {
    for (const text of ['변증은 비폐기허라고 표현합니다.', '변증은 비폐기허증으로 봅니다.', '한약은 보중익기탕을 처방합니다.']) expect(find(text)).toEqual([]);
  });
  it('retrieves prescription errors using the supplied corpus and preserves canonical provenance', () => {
    const span = find('한약은 보중이기탕을 처방합니다.').find(item => item.original === '보중이기탕')!;
    expect(span.candidates.some(item => item.term === '보중익기탕' && item.hanja === '補中益氣湯')).toBe(true);
    expect(find('발목 치료에는 보중이기탕을 씁니다.').some(item => item.candidates.some(candidate => candidate.term === '보중익기탕'))).toBe(true);
  });
  it('handles additional phonetic variants rather than one recorded misspelling', () => {
    for (const word of ['비패기허', '비폐기어', '비폐 기어']) {
      expect(find(`한의학적으로 ${word}라고 표현합니다.`).some(span => span.candidates.some(candidate => candidate.term === '비폐기허증'))).toBe(true);
    }
  });
  it('retrieves source-grounded exam and diagnosis spelling candidates', () => {
    expect(find('발목염자로 보입니다.').some(span => span.candidates.some(candidate => candidate.term === '발목염좌'))).toBe(true);
    expect(find('빠르고 미끄러운 렉으로 보입니다.').some(span => span.original === '렉' && span.candidates.some(candidate => candidate.term === '맥'))).toBe(true);
    expect(find('오타와 루르로 이곳저곳 눌러볼 텐데요.').some(span => span.original === '오타와 루르' && span.candidates.some(candidate => candidate.term === '오타와룰'))).toBe(true);
    expect(find('2도 염자의 경우 회복을 설명했습니다.').some(span => span.original === '염자' && span.candidates.some(candidate => candidate.term === '염좌'))).toBe(true);
  });
  it('does not turn ordinary verbs, short replies or quantities into prescription names', () => {
    for (const text of ['약을 드시고 편하게 두시고요.', '발 한번 들어보세요.', '네, 괜찮아요. 감사합니다.', '진찰하면서 네라고 말씀해주세요.', '빠르고 미끄러운 맥으로 보이고 다음으로 혀도 보겠습니다.', '하루 세 번 식후 30분에 드세요.', '우측 45cm, 좌측 43cm, 10도와 25도입니다.']) expect(find(text)).toEqual([]);
  });
  it('does not infer inflammation, a diagnosis or a schedule from incomplete speech', () => {
    for (const text of ['과민성 방광으로 생각됩니다.', '발목이 불편해요.', '주사내 내원해 주세요.', '19, 30분에 드세요.', '보통 다섯 이후에 그래요.']) expect(find(text)).toEqual([]);
  });
  it('never crosses numbers, punctuation or speaker lines when joining words', () => {
    for (const text of ['한약은 보중 3 익기탕입니다.', '한약은 보중. 익기탕입니다.', '한약은 보중\n익기탕입니다.']) {
      expect(find(text).every(span => !span.original.includes('3') && !/[.\n]/.test(span.original))).toBe(true);
    }
  });
  it('keeps bounded, disjoint exact original offsets under repeated inputs', () => {
    const text = Array.from({ length: 40 }, () => '한약은 보중이기탕을 처방합니다.').join('\n');
    const spans = retrieveCorrectionSpans(text, terms, 8);
    expect(spans).toHaveLength(8);
    spans.forEach((span, index) => { expect(text.slice(span.start, span.end)).toBe(span.original); if (index) expect(span.start).toBeGreaterThanOrEqual(spans[index - 1].end); });
  });
  it('ranks Hangul phoneme differences without treating every syllable as a full edit', () => {
    expect(phoneticDistance('귀패기어', '비폐기허')).toBeLessThan(phoneticDistance('귀패기어', '보중익기탕'));
    expect(phoneticDistance('보중익기탕', '보중익기탕')).toBe(0);
  });
});
