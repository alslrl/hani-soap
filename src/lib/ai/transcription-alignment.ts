import { randomUUID } from 'node:crypto';
import type { Segment } from '@/lib/types';

export const DUAL_TRANSCRIPTION_VERSION = 'dual-asr-v2.1';
const MAX_CELLS = 16_000_000;
export type AlignmentCandidate = { segment_id: string; source_ids: string[] };
export type AlignmentResult = { segments: Segment[]; warnings: string[]; changed_groups: number; unassigned_groups: number; algorithm: typeof DUAL_TRANSCRIPTION_VERSION; candidates: AlignmentCandidate[]; omissions: Segment[] };
export const normalizeSpeech = (text: string) => [...text.matchAll(/[\p{L}\p{N}]/gu)].map(m => m[0].toLocaleLowerCase('ko')).join('');
export function speechSimilarity(a: string, b: string) {
  a = normalizeSpeech(a); b = normalizeSpeech(b);
  if (!a || !b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1])); diagonal = old; }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
export function sentenceSpans(text: string) {
  return [...new Intl.Segmenter('ko', { granularity: 'sentence' }).segment(text)].map(s => ({ text: s.segment, from: s.index, to: s.index + s.segment.length }));
}
export function alignmentWarnings(segments: Segment[], omissions: Segment[] = []) {
  const changed = segments.filter(s => s.transcription_changed).length;
  const unknown = segments.filter(s => s.alignment_status === 'review_needed').length;
  return [
    ...(changed ? [`두 전사의 표현이 다른 문장 ${changed}개가 있습니다. 숫자·좌우·치료 지시는 원음과 확인해 주세요.`] : []),
    ...(segments.some(s => s.timing_review) ? ['일부 원음 시간 구간이 겹치거나 불명확하여 해당 문장의 시간 표시를 보류했습니다. 화자 대응은 문장 근거로 별도 검토합니다.'] : []),
    ...(unknown ? [`화자 대응 확인이 필요한 문장 ${unknown}개를 미확인으로 보존했습니다.`] : []),
    ...(omissions.length ? [`화자 전사에만 남은 발화 ${omissions.length}개가 있습니다. 짧은 응답의 누락 여부를 원음으로 확인합니다.`] : []),
  ];
}
/** Character alignment supplies anchors only. It never determines text cut points. */
export function alignTranscriptContent(content: string, source: Segment[]): AlignmentResult {
  const fallback = (reason: string): AlignmentResult => ({ segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: content, start_ms: null, end_ms: null, alignment_status: 'review_needed' }], warnings: [reason], changed_groups: 0, unassigned_groups: 1, algorithm: DUAL_TRANSCRIPTION_VERSION, candidates: [], omissions: [] });
  if (!content.trim()) throw new Error('TRANSCRIPTION_EMPTY');
  const valid = source.filter(s => s.text.trim());
  const unreliableTimes = new Set<string>();
  valid.forEach((s, i) => {
    if (s.start_ms === null || s.end_ms === null || !Number.isFinite(s.start_ms) || !Number.isFinite(s.end_ms) || s.start_ms < 0 || s.end_ms < s.start_ms) unreliableTimes.add(s.id);
    const prior = valid[i - 1];
    if (prior && s.start_ms !== null && prior.end_ms !== null && s.start_ms < prior.end_ms - 100) { unreliableTimes.add(s.id); unreliableTimes.add(prior.id); }
  });
  const a: string[] = [], owners: number[] = [];
  valid.forEach((s, i) => { for (const ch of normalizeSpeech(s.text)) { a.push(ch); owners.push(i); } });
  const target = [...content.matchAll(/[\p{L}\p{N}]/gu)];
  const b = target.map(m => m[0].toLocaleLowerCase('ko'));
  const n = a.length, m = b.length, width = m + 1;
  if (!n || !m || (n + 1) * width > MAX_CELLS || Math.min(n, m) / Math.max(n, m) < .55) return fallback('두 전사의 차이 또는 길이 때문에 자동 화자 대응을 보류했습니다.');
  const dirs = new Uint8Array((n + 1) * width);
  let prev = Uint32Array.from({ length: width }, (_, i) => i), curr = new Uint32Array(width);
  for (let j = 1; j <= m; j++) dirs[j] = 3;
  for (let i = 1; i <= n; i++) {
    curr[0] = i; dirs[i * width] = 2;
    for (let j = 1; j <= m; j++) {
      const diag = prev[j - 1] + Number(a[i - 1] !== b[j - 1]), del = prev[j] + 1, ins = curr[j - 1] + 1;
      curr[j] = Math.min(diag, del, ins); dirs[i * width + j] = curr[j] === diag ? 1 : curr[j] === del ? 2 : 3;
    }
    [prev, curr] = [curr, prev];
  }
  const map = new Int32Array(m).fill(-1), exact = new Uint8Array(m), sourceHits = new Uint32Array(valid.length);
  let i = n, j = m;
  while (i || j) {
    const d = dirs[i * width + j];
    if (d === 1) { map[j - 1] = owners[i - 1]; if (a[i - 1] === b[j - 1]) { exact[j - 1] = 1; sourceHits[owners[i - 1]]++; } i--; j--; }
    else if (d === 2) i--; else if (d === 3) j--; else return fallback('대응 경로를 확인하지 못했습니다.');
  }
  if (exact.reduce((sum, x) => sum + x, 0) / Math.max(n, m) < .55) return fallback('두 전사의 표현 차이가 커서 화자를 미확인으로 보존했습니다.');
  const segments: Segment[] = [], candidates: AlignmentCandidate[] = [];
  let cursor = 0;
  for (const span of sentenceSpans(content)) {
    const start = cursor; while (cursor < m && target[cursor].index! < span.to) cursor++;
    const hits = new Map<string, number>(), indexes = new Set<number>();
    for (let k = start; k < cursor; k++) if (map[k] >= 0) {
      indexes.add(map[k]); const speaker = valid[map[k]].raw_speaker;
      if (speaker && exact[k]) hits.set(speaker, (hits.get(speaker) ?? 0) + 1);
    }
    const literal = [...indexes].filter(k => normalizeSpeech(valid[k].text) === normalizeSpeech(span.text));
    if (literal.length === 1 && cursor - start > 3 && valid[literal[0]].raw_speaker) { hits.clear(); hits.set(valid[literal[0]].raw_speaker!, cursor - start); }
    const ranked = [...hits.entries()].sort((x, y) => y[1] - x[1]);
    const best = ranked[0]; const size = cursor - start;
    const chosen = [...indexes].filter(k => valid[k].raw_speaker === best?.[0]);
    const neighboring = indexes.size ? valid.slice(Math.max(0, Math.min(...indexes) - 1), Math.min(valid.length, Math.max(...indexes) + 2)) : [];
    const repeatedShort = size <= 3 && neighboring.filter(s => normalizeSpeech(s.text) === normalizeSpeech(span.text)).length > 1;
    const safe = Boolean(best) && best[1] / Math.max(1, size) >= .64 && (ranked[1]?.[1] ?? 0) / Math.max(1, size) <= .15 && !repeatedShort;
    const refs = safe ? chosen.map(k => valid[k]) : [...indexes].map(k => valid[k]);
    const changed = refs.length > 0 && !normalizeSpeech(refs.map(s => s.text).join('')).includes(normalizeSpeech(span.text));
    const id = randomUUID();
    const timeSafe = refs.length > 0 && refs.every(s => !unreliableTimes.has(s.id));
    segments.push({ id, source_segment_id: id, source_segment_ids: refs.map(s => s.id), ordinal: segments.length + 1, speaker: 'unknown', text: span.text, ...(safe ? { raw_speaker: best![0] } : {}), start_ms: safe && timeSafe ? Math.min(...refs.map(s => s.start_ms!)) : null, end_ms: safe && timeSafe ? Math.max(...refs.map(s => s.end_ms!)) : null, alignment_status: safe ? 'aligned' : 'review_needed', timing_review: !timeSafe, transcription_changed: changed });
    if (!safe && neighboring.length) candidates.push({ segment_id: id, source_ids: neighboring.map(s => s.id) });
  }
  const omissions = valid.filter((s, k) => normalizeSpeech(s.text).length >= 2 && sourceHits[k] / normalizeSpeech(s.text).length < .5).map(s => ({ ...s, timing_review: unreliableTimes.has(s.id) }));
  if (segments.map(s => s.text).join('') !== content) return fallback('본문 보존 검사를 통과하지 못해 화자 대응을 보류했습니다.');
  return { segments, candidates, omissions, warnings: alignmentWarnings(segments, omissions), changed_groups: segments.filter(s => s.transcription_changed).length, unassigned_groups: segments.filter(s => s.alignment_status === 'review_needed').length, algorithm: DUAL_TRANSCRIPTION_VERSION };
}
