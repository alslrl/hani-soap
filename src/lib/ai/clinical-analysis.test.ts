import { describe, expect, it } from 'vitest';
import { analysisHash, validateClinicalAnalysis, type ClinicalAnalysisOutput } from './clinical-analysis';
import type { Transcript } from '@/lib/types';
const transcript = (text: string, speaker: 'patient' | 'guardian' | 'unknown' | 'clinician' = 'patient'): Transcript => ({ id: 'raw', clinic_id: 'clinic', visit_id: 'visit', revision: 1, status: 'reviewed', source_asset_key: 'manual_seed', origin: 'manual_demo', text, segments: [{ id: 'segment', ordinal: 1, speaker, text, start_ms: 0, end_ms: 1000 }] });
const empty: ClinicalAnalysisOutput = { answers: [], measurements: [], signals: [], missing_questions: [] };
const measure = (quote: string, value: number, instrument: 'NRS' | 'FREQUENCY' = 'NRS'): ClinicalAnalysisOutput['measurements'][number] => ({ item_key: instrument === 'NRS' ? 'pain' : 'bowel_urine', subitem_key: instrument === 'NRS' ? 'current_pain' : 'urine', instrument, value, unit: instrument === 'NRS' ? 'score' : 'count_per_night', body_region: null, laterality: null, activity_key: null, measurement_context: instrument === 'NRS' ? 'current_pain' : 'current_nocturnal_wetting', temporal: 'current', evidence: [{ segment_id: 'segment', quote }] });
describe('clinical analysis evidence and meaning boundaries', () => {
  it('keeps idempotence across JSONB key ordering', () => expect(analysisHash({a:1,b:{x:2,y:3}})).toBe(analysisHash({b:{y:3,x:2},a:1})));
  it('keeps past 8 distinct from current 5 and preserves current NRS 0', () => {
    const quote = '지난번 통증은 8점이었지만 지금 통증은 5점이에요.';
    const result = validateClinicalAnalysis({ ...empty, measurements: [measure(quote,8), measure(quote,5), measure('8점',8)] }, transcript(quote));
    expect(result.candidates.map(c => c.kind === 'measurement' ? c.value : null)).toEqual([5]);
    expect(validateClinicalAnalysis({ ...empty, answers: [{ item_key: 'pain', subitem_key: 'current_pain', text:'8점', change:null, temporal:'current', evidence:[{segment_id:'segment', quote:'8점'}] }] }, transcript(quote)).candidates).toEqual([]);
    const measured = '현재 통증 NRS를 4점으로 측정 확인했습니다.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [measure(measured,4)] }, transcript(measured,'clinician')).candidates[0]).toMatchObject({ role: 'clinician', kind: 'measurement', value: 4 });
    const zero = '현재 통증은 0점이에요.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [measure(zero,0)] }, transcript(zero)).candidates).toHaveLength(1);
  });
  it('leaves unanswered questions missing; unknown roles and invented source IDs cannot become answers', () => {
    const quote = '현재 통증은 5점인가요?';
    const output: ClinicalAnalysisOutput = { ...empty, answers: [{ item_key: 'pain', subitem_key: 'current_pain', text: '5점', change: null, temporal: 'current', evidence: [{ segment_id: 'segment', quote }] }], measurements: [measure(quote,5)] };
    expect(validateClinicalAnalysis(output, transcript(quote)).candidates).toEqual([]);
    expect(validateClinicalAnalysis(output, transcript(quote)).missing_questions.some(q => q.item_key === 'pain')).toBe(true);
    const report = '지금 통증은 5점이에요.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [measure(report,5)] }, transcript(report,'unknown')).candidates).toEqual([]);
    expect(validateClinicalAnalysis({ ...empty, measurements: [{ ...measure(report,5), evidence: [{ segment_id: 'invented', quote: report }] }] }, transcript(report)).candidates).toEqual([]);
  });
  it('guardian urinary frequency 2 remains frequency and never becomes NRS 2', () => {
    const quote = '아이가 요즘 밤마다 이불에 소변 실수를 2번 해요.';
    const result = validateClinicalAnalysis({ ...empty, measurements: [measure(quote,2,'FREQUENCY'), measure(quote,2)] }, transcript(quote,'guardian'));
    expect(result.candidates).toHaveLength(1); expect(result.candidates[0]).toMatchObject({ kind: 'measurement', instrument: 'FREQUENCY', value: 2, unit: 'episodes_per_night', role: 'guardian' });
  });
  it('keeps only directly expressed worry and understanding gaps; source text is never strengthened by summaries', () => {
    const quote = '걱정돼요. 지난 설명은 잘 모르겠어요.';
    const signals: ClinicalAnalysisOutput['signals'] = [{ category: 'worry', topic: '치료 걱정', evidence: [{ segment_id: 'segment', quote }] }, { category: 'understanding_gap', topic: '설명 이해', evidence: [{ segment_id: 'segment', quote }] }];
    expect(validateClinicalAnalysis({ ...empty, signals }, transcript(quote)).candidates).toHaveLength(2);
    const practice = '안내받은 운동은 시키기가 어려워요.';
    expect(validateClinicalAnalysis({ ...empty, signals: [{ category: 'practice_difficulty', topic: '운동 실천', evidence: [{ segment_id: 'segment', quote: practice }] }] }, transcript(practice,'guardian')).candidates).toHaveLength(1);
    const inferred = '오늘 약을 먹었습니다.';
    expect(validateClinicalAnalysis({ ...empty, signals: [{ ...signals[0], evidence: [{ segment_id: 'segment', quote: inferred }] }] }, transcript(inferred)).candidates).toEqual([]);
    const answer = { item_key: 'medication', subitem_key: 'adherence', text: '약이 완치시켰다', change: null, temporal: 'current' as const, evidence: [{ segment_id: 'segment', quote: inferred }] };
    expect(validateClinicalAnalysis({ ...empty, answers: [answer] }, transcript(inferred)).candidates[0].text).toBe(inferred);
  });
  it('rejects past/future, unknown fields and invented values or units', () => {
    const quote = '지난주 통증은 8점이었어요. 다음에는 5점을 목표로 해요.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [measure(quote,8), measure(quote,5), measure(quote,0)] }, transcript(quote)).candidates).toEqual([]);
    const functional = '현재 계단 이용의 불편감은 3점이에요.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [{ ...measure(functional,3), instrument:'APP_FUNCTION_DISCOMFORT',item_key:'function_daily',subitem_key:'daily_activity' }] }, transcript(functional)).candidates).toHaveLength(1);
    expect(validateClinicalAnalysis({ ...empty, measurements: [{ ...measure(functional,3), instrument:'APP_FUNCTION_DISCOMFORT' }] }, transcript(functional)).candidates).toEqual([]);
    const current = '현재 통증은 5점이에요.';
    expect(validateClinicalAnalysis({ ...empty, measurements: [{ ...measure(current,5), item_key: 'bowel_urine', subitem_key: 'urine' }] }, transcript(current)).candidates).toEqual([]);
  });
});
