import type { CareMessage, CareResponse } from './types';

export const KAKAO_RESPONSE_LABELS: Record<CareResponse['option'], string> = {
  taking_well: '잘 먹고 있어요', discomfort: '불편한 점 있어요', improving: '좋아지고 있어요',
  unsure: '잘 모르겠어요', will_book: '예약할게요', will_wait: '더 지켜볼게요',
};
export function responseOptions(stage: CareMessage['stage']): CareResponse['option'][] {
  if (stage === 'visit_summary') return ['discomfort'];
  if (stage === 'week1') return ['improving', 'unsure', 'discomfort'];
  if (stage === 'end_minus3') return ['will_book', 'will_wait', 'discomfort'];
  return ['taking_well', 'discomfort'];
}
/** Kakao text templates allow 200 characters; the link always opens the full approved text. */
export function kakaoPreview(body: string) {
  const prefix = '[HaniSOAP]\n';
  const complete = prefix + body;
  if ([...complete].length <= 200) return complete;
  const suffix = '\n…전체 안내는 링크에서 확인해 주세요.';
  return [...complete].slice(0, 200 - [...suffix].length).join('') + suffix;
}
