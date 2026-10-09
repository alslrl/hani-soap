// Small, source-grounded charting vocabulary. This is not a diagnosis/treatment rule set.
// Numeric schedules, dose/time expressions and disease-expanding suffixes are not aliases.
export const CLINICAL_TERMS = [
  { term: '발목염좌', hanja: null, quote: '오른쪽 발목 염좌', source: 'docs/verification/데모_정답차팅_초안.md' },
  { term: '염좌', hanja: null, quote: '발목 염좌', source: 'docs/verification/데모_정답차팅_초안.md' },
  { term: '맥', hanja: '脈', quote: '맥은 빠르고 미끄러운 양상', source: 'docs/verification/데모_정답차팅_초안.md' },
  { term: '오타와룰', hanja: null, quote: '오타와 룰로', source: 'docs/transcripts/진료영상1_4조_전사.txt' },
] as const;
