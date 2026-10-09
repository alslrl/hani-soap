import { randomUUID } from 'node:crypto';
import type { Segment } from '@/lib/types';
import type { AiTextPrivacy } from '@/lib/privacy/text';
import { cropAudio } from '@/lib/audio/crop';
import { transcribeContentAudio } from './transcribe';
import { reviewTranscriptAlignment } from './provider';
import { alignmentWarnings, normalizeSpeech, speechSimilarity, type AlignmentResult } from './transcription-alignment';

export type AudioRecheck = { source_id: string; start_ms: number; end_ms: number; text: string; status: 'confirmed' | 'conflict' | 'failed'; model: string };
type Decision = { segment_id: string; source_id: string | null; source_quote: string; reason: string };
export function applyAlignmentReview(alignment: AlignmentResult, source: Segment[], decisions: Decision[]) {
  const changed = alignment.segments.map(s => ({ ...s }));
  for (const decision of decisions) {
    const target = changed.find(s => s.id === decision.segment_id);
    const candidate = alignment.candidates.find(c => c.segment_id === decision.segment_id);
    const original = source.find(s => s.id === decision.source_id);
    if (!target || target.alignment_status !== 'review_needed' || !original?.raw_speaker || !candidate?.source_ids.includes(original.id)) continue;
    if (!decision.source_quote.trim() || !original.text.includes(decision.source_quote)) continue;
    // A semantic judgment cannot override contradictory words or numeric facts.
    if (speechSimilarity(target.text, decision.source_quote) < .75) continue;
    if (normalizeSpeech(target.text).length <= 3) continue; // repeated fillers remain uncertain
    const sourceNumbers = new Set(decision.source_quote.match(/\d+(?:\.\d+)?/g) ?? []);
    if ((target.text.match(/\d+(?:\.\d+)?/g) ?? []).some(v => !sourceNumbers.has(v))) continue;
    const targetIndex = changed.indexOf(target);
    const left = changed.slice(0, targetIndex).reverse().find(s => s.start_ms !== null);
    const right = changed.slice(targetIndex + 1).find(s => s.end_ms !== null);
    if ((left && original.end_ms! < left.start_ms!) || (right && original.start_ms! > right.end_ms!)) continue;
    target.raw_speaker = original.raw_speaker; target.start_ms = target.timing_review ? null : original.start_ms; target.end_ms = target.timing_review ? null : original.end_ms;
    target.source_segment_ids = [original.id]; target.alignment_status = 'aligned'; target.alignment_method = 'model_review';
  }
  return changed;
}
export function recheckTargets(alignment: AlignmentResult) {
  return alignment.omissions.filter(s => !s.timing_review && s.start_ms !== null && s.end_ms !== null && s.raw_speaker && s.end_ms - s.start_ms <= 8_000 && normalizeSpeech(s.text).length >= 3)
    .sort((a, b) => Number(/아파|괜찮|아니|없|못/.test(b.text)) - Number(/아파|괜찮|아니|없|못/.test(a.text)) || a.start_ms! - b.start_ms!).slice(0, 16);
}
export function insertVerifiedReplies(segments: Segment[], source: Segment[], rechecks: AudioRecheck[]) {
  const result = segments.map(s => ({ ...s }));
  for (const check of rechecks) {
    const original = source.find(s => s.id === check.source_id);
    if (check.status !== 'confirmed' || !original?.raw_speaker || !check.text.trim() || speechSimilarity(original.text, check.text) < .8) continue;
    // Rechecking cannot splice another utterance into a long existing sentence.
    if (result.some(s => s.source_segment_ids?.includes(original.id) && speechSimilarity(s.text, check.text) >= .8)) continue;
    const index = result.findIndex(s => s.start_ms !== null && s.start_ms >= original.end_ms!);
    const left = index < 0 ? result.at(-1) : result[index - 1];
    const right = index < 0 ? undefined : result[index];
    if (!left || left.end_ms === null || left.end_ms > original.start_ms! + 100 || (right && right.start_ms! < original.end_ms! - 100)) continue;
    const id = randomUUID();
    const added: Segment = { id, source_segment_id: id, source_segment_ids: [original.id], ordinal: 0, speaker: 'unknown', raw_speaker: original.raw_speaker, start_ms: original.start_ms, end_ms: original.end_ms, text: check.text.trim() + ' ', alignment_status: 'aligned', alignment_method: 'audio_recheck', transcription_changed: true };
    result.splice(index < 0 ? result.length : index, 0, added);
  }
  return result.map((s, i) => ({ ...s, ordinal: i + 1 }));
}
export async function refineTranscription(alignment: AlignmentResult, source: Segment[], privacy: AiTextPrivacy, audio: () => Promise<Blob>, prior: AudioRecheck[], save: (result: AudioRecheck) => Promise<void>) {
  let segments = alignment.segments.map(s => ({ ...s, alignment_method: 'sentence' as const })) as Segment[];
  const notes: string[] = [];
  if (alignment.candidates.length) {
    try { segments = applyAlignmentReview({ ...alignment, segments }, source, await reviewTranscriptAlignment(segments, source, alignment.candidates, privacy)); }
    catch { notes.push('문장 대응 AI 검토를 완료하지 못해 해당 구간을 미확인으로 보존했습니다.'); }
  }
  const targets = recheckTargets(alignment), checks = [...prior];
  if (targets.some(t => !checks.some(c => c.source_id === t.id))) {
    const blob = await audio();
    // Bounded concurrency and persisted individual outcomes prevent repeated paid calls.
    for (let index = 0; index < targets.length; index += 4) await Promise.all(targets.slice(index, index + 4).map(async target => {
      if (checks.some(c => c.source_id === target.id)) return;
      let check: AudioRecheck;
      const start = Math.max(0, target.start_ms! - 100), end = target.end_ms! + 100;
      try {
        const clip = await cropAudio(blob, start, end);
        const result = await transcribeContentAudio(clip, 'recheck.wav', true);
        check = { source_id: target.id, start_ms: start, end_ms: end, text: result.text, status: speechSimilarity(target.text, result.text) >= .8 ? 'confirmed' : 'conflict', model: result.model };
      } catch { check = { source_id: target.id, start_ms: start, end_ms: end, text: '', status: 'failed', model: 'not_completed' }; }
      checks.push(check); await save(check);
    }));
  }
  segments = insertVerifiedReplies(segments, source, checks);
  const inserted = new Set(segments.filter(s => s.alignment_method === 'audio_recheck').flatMap(s => s.source_segment_ids ?? []));
  const unresolved = alignment.omissions.filter(s => !inserted.has(s.id));
  return { segments, rechecks: checks, warnings: [...alignmentWarnings(segments, unresolved), ...notes], omissions: unresolved, inserted: inserted.size };
}
