import type { MeasurementCandidate, AnalysisEvidence } from './clinical-analysis';
import type { Transcript } from '@/lib/types';
export function canonicalMeasurementRegion(region: string | null) {
  return region && ['ankle','발목','우측 발목','오른쪽 발목','우측발목','오른쪽발목','right_ankle'].includes(region.trim()) ? 'ankle' : region;
}
export function clinicalMeasurementMetricKey(candidate: Pick<MeasurementCandidate,'instrument'|'unit'|'activity_key'|'measurement_context'>) {
  if (candidate.instrument === 'NRS') return 'pain_intensity';
  if (candidate.instrument === 'FREQUENCY') return candidate.unit === 'count_per_day' ? 'urinary_frequency' : 'nocturnal_wetting_frequency';
  if (candidate.instrument === 'APP_FUNCTION_DISCOMFORT') return candidate.activity_key === 'stairs_up' && candidate.measurement_context === 'stair_ascent_discomfort' ? 'stair_ascent_discomfort' : 'function_discomfort';
  return 'symptom_bother';
}
/** Model prose is never sufficient to invent a site, side or activity. */
export function sourceMeasurementConditions(item: Pick<MeasurementCandidate,'instrument'|'value'|'evidence'>, transcript: Transcript) {
  const contexts = item.evidence.map(ref => sourceContext(ref,item.value,transcript));
  const source = contexts.map(context=>context.site).join(' '), activitySource = contexts.map(context=>context.activity).join(' ');
  const ankle = /발목|\bankle\b/i.test(source), otherRegion = /무릎|손목|어깨|허리|\bknee\b|\bwrist\b|\bshoulder\b|\bback\b/i.test(source);
  const body_region = ankle && !otherRegion ? 'ankle' : null;
  const left = /왼(?:쪽)?|좌측|\bleft\b/i.test(source), right = /오른(?:쪽)?|우측|\bright\b/i.test(source);
  const laterality = /양쪽|양측|\bbilateral\b/i.test(source) ? 'bilateral' as const : left !== right ? left ? 'left' as const : 'right' as const : null;
  const activities = [
    ['stairs_up', /계단.{0,15}(?:오르|오를|올라|올리)|(?:오르|오를|올라).{0,15}계단|stairs?\s*up|stair\s*ascent/i],
    ['stairs_down', /계단.{0,15}(?:내려|내리|내릴)|(?:내려|내리|내릴).{0,15}계단|stairs?\s*down|stair\s*descent/i],
    ['walking', /걷|걸을|걸어|\bwalking\b/i],
    ['rest', /가만히|안정\s*시|쉬고|누워|\brest\b/i],
  ] as const;
  const found = activities.filter(([,pattern])=>pattern.test(activitySource)).map(([activity])=>activity);
  const activity_key = found.length === 1 ? found[0] : null;
  const measurement_context = item.instrument === 'NRS' ? found.length > 1 ? 'unclear_pain_condition' : activity_key === null ? 'current_pain' : activity_key === 'stairs_up' ? 'stair_ascent_pain' : `${activity_key}_pain` : item.instrument === 'APP_FUNCTION_DISCOMFORT' ? found.length > 1 ? 'unclear_function_discomfort' : activity_key === 'stairs_up' ? 'stair_ascent_discomfort' : activity_key === 'stairs_down' ? 'stair_descent_discomfort' : 'current_function_discomfort' : item.instrument === 'SYMPTOM_BOTHER' ? 'current_symptom_bother' : 'current_urinary_frequency';
  return { body_region, laterality: body_region ? laterality : null, activity_key, measurement_context };
}
function sourceContext(ref: AnalysisEvidence[number], value: number, transcript: Transcript) {
  const segment = transcript.segments.find(segment=>segment.id===ref.segment_id)!;
  const number = [...ref.quote.matchAll(/(\d+(?:\.\d+)?)\s*(?:점|회|번)/g)].find(match=>Number(match[1])===value);
  const position = segment.text.indexOf(ref.quote) + (number?.index ?? 0);
  const previous = Math.max(segment.text.lastIndexOf('.',position),segment.text.lastIndexOf('?',position),segment.text.lastIndexOf('!',position));
  const next = segment.text.slice(position).search(/[.!?？]/);
  const sentence = segment.text.slice(previous+1,next>=0?position+next:undefined);
  const before = sentence.slice(0,position-previous-1);
  const lastScore = [...before.matchAll(/\d+(?:\.\d+)?\s*점/g)].at(-1);
  const clause = sentence.slice(lastScore ? lastScore.index!+lastScore[0].length : 0,position-previous-1+(number?.[0].length ?? ref.quote.length));
  const preceding = transcript.segments.find(segment=>segment.ordinal===transcript.segments.find(segment=>segment.id===ref.segment_id)!.ordinal-1);
  const currentQuestion = preceding?.speaker === 'clinician' && /[?？]|몇\s*점|어떤가|어떻게/.test(preceding.text) && !/지난|예전|과거|예정|다음/.test(preceding.text) ? preceding.text : '';
  return { site: /발목|무릎|손목|어깨|허리|ankle|knee|wrist|shoulder|back/i.test(clause) ? clause : !/지난|예전|과거|어제|다음|예정|계획/.test(sentence) && /발목|무릎|손목|어깨|허리|ankle|knee|wrist|shoulder|back/i.test(sentence) ? sentence : currentQuestion, activity: /계단|걷|걸을|걸어|가만히|안정|쉬고|누워|stairs|walking|rest/i.test(clause) ? clause : currentQuestion };
}
