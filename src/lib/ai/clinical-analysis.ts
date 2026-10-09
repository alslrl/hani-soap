import { sourceMeasurementConditions } from './clinical-measurement-conditions';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QUESTION_GROUPS } from '@/components/progress/questions';
import { PATIENT_SIGNAL_CATEGORIES, type PatientSignalCategory } from './clinical-analysis-context';
import type { FollowupAnswer, Observation, Segment, SourceRef, Transcript } from '@/lib/types';

const evidence = z.array(z.object({ segment_id: z.string(), quote: z.string().min(1) })).min(1).max(8);
const temporal = z.enum(['current', 'recent', 'past', 'future', 'unclear']);
const answer = z.object({ item_key: z.string(), subitem_key: z.string(), text: z.string(), change: z.enum(['improved', 'same', 'worsened', 'unclear']).nullable(), temporal, evidence });
const measurement = z.object({ item_key: z.string(), subitem_key: z.string(), instrument: z.enum(['NRS', 'FREQUENCY', 'APP_FUNCTION_DISCOMFORT', 'SYMPTOM_BOTHER']), value: z.number(), unit: z.enum(['score', 'count_per_night', 'count_per_day']), body_region: z.string().nullable(), laterality: z.enum(['left', 'right', 'bilateral', 'midline', 'not_applicable']).nullable(), activity_key: z.string().nullable(), measurement_context: z.string(), temporal, evidence });
const signal = z.object({ category: z.enum(PATIENT_SIGNAL_CATEGORIES), topic: z.string(), evidence });
export const clinicalAnalysisSchema = z.object({ answers: z.array(answer).max(40), measurements: z.array(measurement).max(20), signals: z.array(signal).max(20), missing_questions: z.array(z.object({ item_key: z.string(), subitem_key: z.string(), question: z.string() })).max(30) });
export type ClinicalAnalysisOutput = z.infer<typeof clinicalAnalysisSchema>;
export type AnalysisEvidence = { segment_id: string; quote: string }[];
type BaseCandidate = { id: string; text: string; evidence: AnalysisEvidence; source_refs: SourceRef[]; role: Segment['speaker']; temporal: 'current' | 'recent'; status: 'pending' | 'confirmed' | 'rejected'; reviewed_at?: string; reviewed_by?: string; review_hash?: string; saved_ids?: string[]; manual_review?: { text: string; value?: number; source_ref: SourceRef } };
export type AnswerCandidate = BaseCandidate & { kind: 'answer'; item_key: FollowupAnswer['item_key']; subitem_key: string; change: FollowupAnswer['change'] };
export type MeasurementCandidate = BaseCandidate & { kind: 'measurement'; item_key: FollowupAnswer['item_key']; subitem_key: string; instrument: Observation['instrument']; value: number; unit: string; body_region: string | null; laterality: Observation['laterality']; activity_key: string | null; measurement_context: string };
export type SignalCandidate = BaseCandidate & { kind: 'signal'; category: PatientSignalCategory; topic: string };
export type AnalysisCandidate = AnswerCandidate | MeasurementCandidate | SignalCandidate;
export const questionFields = QUESTION_GROUPS.flatMap(group => group.subitems.map(subitem => ({ item_key: group.key, subitem_key: subitem.key, question: `${group.question} (${subitem.label})` })));
export const validField = (item: string, subitem: string) => questionFields.some(field => field.item_key === item && field.subitem_key === subitem);
function canonical(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(canonical);
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => [key,canonical(value)]));
  return data;
}
export const analysisHash = (data: unknown) => createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
const uuid = (data: unknown) => { const h = analysisHash(data); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
export function transcriptSourceRefs(refs: AnalysisEvidence): SourceRef[] { return refs.map(ref => ({ kind: 'provided_transcript', source_id: ref.segment_id, quote: ref.quote, origin: 'manual_demo' })); }
function grounded(refs: AnalysisEvidence, transcript: Transcript, measured = false) {
  return refs.length > 0 && refs.every(ref => ref.quote.trim() && transcript.segments.some(segment => segment.id === ref.segment_id && (['patient', 'guardian'].includes(segment.speaker) || measured && segment.speaker === 'clinician' && /측정|확인(?:했|한|된)|검사/.test(ref.quote)) && segment.text.includes(ref.quote)));
}
const reportQuestion = (text: string) => /[?？]|(?:인가요|일까요|까요|나요|알려\s*주세요|궁금)/.test(text);
const temporalAt = (text: string, position: number) => {
  const prefix = text.slice(0, position);
  const past = [...prefix.matchAll(/지난(?:번|주|달)?|예전|전에는|당시|과거|어제/g)].at(-1)?.index ?? -1;
  const current = [...prefix.matchAll(/지금|현재|오늘|요즘|최근|이제/g)].at(-1)?.index ?? -1;
  const future = [...prefix.matchAll(/앞으로|예정|계획|다음/g)].at(-1)?.index ?? -1;
  return Math.max(past, future) <= current;
};
function currentReport(ref: AnalysisEvidence[number], transcript: Transcript) {
  const segment = transcript.segments.find(segment => segment.id === ref.segment_id)!;
  const start = segment.text.indexOf(ref.quote);
  const sentenceStart = Math.max(segment.text.lastIndexOf('.', start), segment.text.lastIndexOf('?', start), segment.text.lastIndexOf('!', start)) + 1;
  const tail = segment.text.slice(start).search(/[.!?？]/);
  const sentence = segment.text.slice(sentenceStart, tail >= 0 ? start + tail + 1 : undefined);
  if (reportQuestion(sentence)) return false;
  if (/예정|계획|할\s*거|먹을\s*거/.test(ref.quote) && !/먹었|했|하고|먹고|복용\s*중/.test(ref.quote)) return false;
  return /지금|현재|오늘|요즘|최근|이제/.test(ref.quote) || temporalAt(segment.text, start);
}
function measuredNumber(candidate: z.infer<typeof measurement>, transcript: Transcript) {
  if (!Number.isFinite(candidate.value) || candidate.value < 0) return false;
  if (candidate.instrument === 'NRS' && (!Number.isInteger(candidate.value) || candidate.value > 10 || candidate.unit !== 'score' || candidate.item_key !== 'pain')) return false;
  if (candidate.instrument === 'FREQUENCY' && (candidate.item_key !== 'bowel_urine' || candidate.unit === 'score' || !Number.isInteger(candidate.value))) return false;
  if (candidate.instrument === 'APP_FUNCTION_DISCOMFORT' && (candidate.item_key !== 'function_daily' || !Number.isInteger(candidate.value))) return false;
  if (candidate.instrument === 'SYMPTOM_BOTHER' && !['discomfort','chief_complaint'].includes(candidate.item_key)) return false;
  if (!['NRS','FREQUENCY'].includes(candidate.instrument) && (candidate.unit !== 'score' || candidate.value > 10)) return false;
  return candidate.evidence.some(ref => {
    const segment = transcript.segments.find(s => s.id === ref.segment_id)!;
    const preceding = transcript.segments.find(s => s.ordinal === segment.ordinal - 1)?.text ?? '';
    const context = `${preceding} ${segment.text}`;
    if (candidate.instrument === 'NRS' && !/통증|아프|NRS/i.test(context)) return false;
    if (candidate.instrument === 'FREQUENCY' && !/야뇨|소변|실수|이불|밤/.test(context)) return false;
    const matches = [...ref.quote.matchAll(candidate.instrument === 'FREQUENCY' ? /(\d+(?:\.\d+)?)\s*(?:회|번)/g : /(\d+(?:\.\d+)?)\s*점/g)];
    return matches.some(match => {
      const position = segment.text.indexOf(ref.quote) + match.index!;
      const sentenceStart = Math.max(segment.text.lastIndexOf('.', position), segment.text.lastIndexOf('?', position), segment.text.lastIndexOf('!', position)) + 1;
      const tail = segment.text.slice(position).search(/[.!?？]/);
      const sentence = segment.text.slice(sentenceStart, tail >= 0 ? position + tail + 1 : undefined);
      return Number(match[1]) === candidate.value && temporalAt(segment.text, position) && !reportQuestion(sentence);
    });
  });
}
const signalPatterns: Record<PatientSignalCategory, (quote: string) => boolean> = {
  worry: text => /걱정|불안|무서|두렵/.test(text) && !/(?:걱정|불안).{0,6}(?:안|없|않)|안.{0,4}걱정/.test(text),
  effect_question: text => /효과|나아|낫|호전|도움/.test(text) && /[?？]|까요|나요|궁금|모르/.test(text),
  understanding_gap: text => /이해.{0,12}(?:안|못)|잘.{0,5}모르|다시.{0,10}설명|무슨.{0,8}뜻|헷갈/.test(text),
  practice_difficulty: text => /약|복용|운동|관리|실천|스트레칭/.test(text) && /어려|어렵|힘들|못|깜빡|빼먹/.test(text),
  open_question: text => reportQuestion(text),
};
export function validateClinicalAnalysis(output: ClinicalAnalysisOutput, transcript: Transcript) {
  const candidates: AnalysisCandidate[] = [];
  const rejected: string[] = [];
  const base = (kind: string, data: { evidence: AnalysisEvidence }) => {
    const text = data.evidence.map(ref => ref.quote).join('\n');
    return { id: uuid([transcript.id, kind, data]), text, evidence: data.evidence, source_refs: transcriptSourceRefs(data.evidence), role: transcript.segments.find(s => s.id === data.evidence[0].segment_id)!.speaker, temporal: 'current' as const, status: 'pending' as const };
  };
  for (const item of output.answers) {
    if (!validField(item.item_key, item.subitem_key) || !['current','recent'].includes(item.temporal) || !grounded(item.evidence, transcript) || item.item_key !== 'questions_concerns' && !item.evidence.some(ref => currentReport(ref, transcript)) && !(item.temporal === 'recent' && ['treatment_response','medication','discomfort','lifestyle'].includes(item.item_key) && item.evidence.some(ref => !reportQuestion(ref.quote) && !/예정|계획|할\s*거|먹을\s*거/.test(ref.quote))) || item.evidence.every(ref => /^(?:지난|예전|과거|어제)/.test(ref.quote) && !/지금|현재|오늘|요즘|최근|이제/.test(ref.quote)) && !(item.temporal === 'recent' && ['treatment_response','medication','discomfort','lifestyle'].includes(item.item_key))) { rejected.push('answer_boundary'); continue; }
    const text = item.evidence.map(ref => ref.quote).join(' ');
    const change = item.change === 'improved' && !/나아|낫|좋아|줄|덜|호전/.test(text) || item.change === 'same' && !/같|그대로|비슷/.test(text) || item.change === 'worsened' && !/심|더|악화/.test(text) ? 'unclear' : item.change;
    if (!candidates.some(c => c.kind === 'answer' && c.item_key === item.item_key && c.subitem_key === item.subitem_key)) candidates.push({ ...base('answer', item), kind: 'answer', temporal: item.temporal as 'current' | 'recent', item_key: item.item_key as FollowupAnswer['item_key'], subitem_key: item.subitem_key, change });
  }
  for (const item of output.measurements) {
    if (!validField(item.item_key, item.subitem_key) || item.temporal !== 'current' || !grounded(item.evidence, transcript, true) || !measuredNumber(item, transcript)) { rejected.push('measurement_boundary'); continue; }
    candidates.push({ ...base('measurement', item), kind: 'measurement', item_key: item.item_key as FollowupAnswer['item_key'], subitem_key: item.subitem_key, instrument: item.instrument, value: item.value, unit: item.unit === 'count_per_night' ? 'episodes_per_night' : item.unit, ...sourceMeasurementConditions(item,transcript) });
  }
  for (const item of output.signals) {
    if (!grounded(item.evidence, transcript) || !item.evidence.some(ref => signalPatterns[item.category](ref.quote))) { rejected.push('signal_boundary'); continue; }
    candidates.push({ ...base('signal', item), kind: 'signal', category: item.category, topic: item.evidence.some(ref => item.topic.trim() && item.topic.length <= 100 && ref.quote.includes(item.topic)) ? item.topic : ({ worry: '걱정', effect_question: '효과 질문', understanding_gap: '설명 이해', practice_difficulty: '관리 실천', open_question: '미해결 질문' })[item.category] });
  }
  const missing = questionFields.filter(field => !candidates.some(candidate => candidate.kind === 'answer' && candidate.item_key === field.item_key && candidate.subitem_key === field.subitem_key));
  return { candidates: [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()], missing_questions: missing, discarded_count: rejected.length };
}
