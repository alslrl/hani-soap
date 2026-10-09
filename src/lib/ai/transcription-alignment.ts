import { randomUUID } from 'node:crypto';
import type { Segment } from '@/lib/types';

export const DUAL_TRANSCRIPTION_VERSION = 'dual-asr-v1';
const MAX_CELLS = 16_000_000;
type Group = { ids: string[]; speaker?: string; text: string; start: number | null; end: number | null; from: number; to: number };
export type AlignmentResult = { segments: Segment[]; warnings: string[]; changed_groups: number; unassigned_groups: number; algorithm: typeof DUAL_TRANSCRIPTION_VERSION };
function normalized(text: string) {
  const chars: string[] = []; const offsets: number[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]/gu)) { chars.push(match[0].toLocaleLowerCase('ko')); offsets.push(match.index!); }
  return { chars, offsets };
}
/** Align text locally. The second ASR's exact wording is retained; this does not certify correctness. */
export function alignTranscriptContent(content: string, source: Segment[]): AlignmentResult {
  const fallback = (reason: string): AlignmentResult => ({
    segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: content, start_ms: null, end_ms: null, alignment_status: 'review_needed', transcription_changed: true }],
    warnings: [reason], changed_groups: 1, unassigned_groups: 1, algorithm: DUAL_TRANSCRIPTION_VERSION,
  });
  if (!content.trim()) throw new Error('TRANSCRIPTION_EMPTY');
  const groups: Group[] = [];
  let position = 0; let priorStart = -1; let priorEnd = -1;
  for (const segment of source) {
    if (!segment.text.trim()) continue;
    if (segment.start_ms === null || segment.end_ms === null || segment.start_ms < priorStart || segment.end_ms < segment.start_ms || segment.start_ms < priorEnd - 100) return fallback('화자 시간 구간을 확인할 수 없어 본문을 화자 미확인으로 보존했습니다.');
    priorStart = segment.start_ms; priorEnd = segment.end_ms;
    const size = normalized(segment.text).chars.length;
    const previous = groups.at(-1);
    if (previous && previous.speaker === segment.raw_speaker) {
      previous.text += ' ' + segment.text; previous.ids.push(segment.id); previous.end = segment.end_ms; previous.to += size;
    } else groups.push({ ids: [segment.id], speaker: segment.raw_speaker, text: segment.text, start: segment.start_ms, end: segment.end_ms, from: position, to: position + size });
    position += size;
  }
  const a = normalized(groups.map((group) => group.text).join(''));
  const b = normalized(content);
  const n = a.chars.length; const m = b.chars.length;
  if (!n || !m || (n + 1) * (m + 1) > MAX_CELLS) return fallback('자동 화자 대응 범위를 넘어 본문을 미확인으로 보존했습니다. 전사 검토에서 역할을 확인해 주세요.');
  if (Math.min(n, m) / Math.max(n, m) < 0.6) return fallback('두 전사의 길이 차이가 커서 화자를 자동으로 대응하지 않았습니다.');
  const width = m + 1;
  const directions = new Uint8Array((n + 1) * width);
  let previous = new Uint32Array(width); let current = new Uint32Array(width);
  for (let j = 1; j <= m; j++) { previous[j] = j; directions[j] = 3; }
  for (let i = 1; i <= n; i++) {
    current[0] = i; directions[i * width] = 2;
    for (let j = 1; j <= m; j++) {
      const same = a.chars[i - 1] === b.chars[j - 1];
      const diagonal = previous[j - 1] + (same ? 0 : 1);
      const deletion = previous[j] + 1; const insertion = current[j - 1] + 1;
      const value = Math.min(diagonal, deletion, insertion);
      current[j] = value;
      directions[i * width + j] = value === diagonal ? 1 : value === deletion ? 2 : 3;
    }
    [previous, current] = [current, previous];
  }
  const boundaries = new Int32Array(n + 1).fill(-1);
  const matches = new Uint8Array(n);
  const insertions = new Set<number>();
  let i = n; let j = m; boundaries[n] = m;
  while (i || j) {
    const direction = directions[i * width + j];
    if (direction === 1) { if (a.chars[i - 1] === b.chars[j - 1]) matches[i - 1] = 1; i--; j--; }
    else if (direction === 2) i--;
    else if (direction === 3) { insertions.add(i); j--; }
    else return fallback('두 전사의 대응 경로를 확인하지 못해 화자를 미확인으로 남겼습니다.');
    boundaries[i] = j;
  }
  const matched = matches.reduce((sum, value) => sum + value, 0);
  if (matched / Math.max(n, m) < 0.6) return fallback('두 전사의 표현 차이가 커서 화자를 자동으로 대응하지 않았습니다.');
  const uncertain = new Set<number>();
  for (let index = 0; index < groups.length - 1; index++) {
    const left = groups[index]; const right = groups[index + 1]; const cut = left.to;
    const leftCount = matches.slice(Math.max(left.from, cut - 10), cut).reduce((sum, value) => sum + value, 0);
    const rightCount = matches.slice(cut, Math.min(right.to, cut + 10)).reduce((sum, value) => sum + value, 0);
    const localInsert = insertions.has(cut) || insertions.has(cut - 1) || insertions.has(cut + 1);
    if (localInsert || leftCount < Math.min(4, cut - left.from) || rightCount < Math.min(4, right.to - cut)) { uncertain.add(index); uncertain.add(index + 1); }
  }
  const segments: Segment[] = [];
  let changed = 0; let unassigned = 0;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const from = index === 0 ? 0 : b.offsets[boundaries[group.from]] ?? content.length;
    const to = index === groups.length - 1 ? content.length : b.offsets[boundaries[group.to]] ?? content.length;
    const text = content.slice(from, to);
    if (!text.trim()) { unassigned++; continue; }
    const localMatches = matches.slice(group.from, group.to).reduce((sum, value) => sum + value, 0);
    const targetSize = boundaries[group.to] - boundaries[group.from];
    const safe = Boolean(group.speaker) && !uncertain.has(index) && localMatches / Math.max(group.to - group.from, targetSize, 1) >= 0.6;
    const differs = normalized(text).chars.join('') !== normalized(group.text).chars.join('');
    if (differs) changed++; if (!safe) unassigned++;
    const id = randomUUID();
    segments.push({ id, source_segment_id: id, source_segment_ids: [...group.ids], ordinal: segments.length + 1, speaker: 'unknown', ...(safe ? { raw_speaker: group.speaker } : {}), text, start_ms: safe ? group.start : null, end_ms: safe ? group.end : null, alignment_status: safe ? 'aligned' : 'review_needed', transcription_changed: differs });
  }
  if (segments.map((segment) => segment.text).join('') !== content) return fallback('본문 전체를 보존하기 위해 자동 화자 대응을 해제했습니다.');
  const warnings: string[] = [];
  if (changed) warnings.push(`두 전사의 표현이 다른 발화 ${changed}개가 있습니다. 본문 전사를 사용하되 숫자·좌우·치료 지시는 원음과 확인해 주세요.`);
  if (unassigned) warnings.push(`화자 대응 확인이 필요한 발화 ${unassigned}개는 역할 미확인으로 남겼습니다.`);
  return { segments, warnings, changed_groups: changed, unassigned_groups: unassigned, algorithm: DUAL_TRANSCRIPTION_VERSION };
}
