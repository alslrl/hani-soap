import { randomUUID } from 'node:crypto';
import { AI_MODELS, getApiKey } from './config';
import type { Segment } from '@/lib/types';
import { AppError } from '@/lib/server/errors';

type DiarizedResponse = { text?: string; segments?: { id?: string; text?: string; speaker?: string; start?: number; end?: number }[]; usage?: unknown };

export function normalizeDiarizedTranscript(data: DiarizedResponse) {
  const rawSpeakers: Record<string, string> = {};
  const segments: Segment[] = (data.segments || []).filter((item) => typeof item.text === 'string' && item.text.trim()).map((item, index) => {
    const id = randomUUID();
    if (item.speaker) rawSpeakers[id] = item.speaker;
    return { id, ordinal: index + 1, speaker: 'unknown', text: item.text!, start_ms: typeof item.start === 'number' ? Math.round(item.start * 1000) : null, end_ms: typeof item.end === 'number' ? Math.round(item.end * 1000) : null };
  });
  const text = typeof data.text === 'string' && data.text.trim() ? data.text : segments.map((item) => item.text).join('\n');
  if (!text.trim()) throw new AppError(422, 'TRANSCRIPTION_EMPTY', '음성에서 전사할 문장을 찾지 못했습니다. 원음과 마이크 입력을 확인해 주세요.');
  if (!segments.length) segments.push({ id: randomUUID(), ordinal: 1, speaker: 'unknown', text, start_ms: null, end_ms: null });
  return { text, segments, rawSpeakers, model: AI_MODELS.transcription };
}

export async function transcribeAudio(blob: Blob, filename: string) {
  const form = new FormData();
  form.set('file', blob, filename);
  form.set('model', AI_MODELS.transcription);
  form.set('response_format', 'diarized_json');
  form.set('chunking_strategy', 'auto');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${getApiKey()}` }, body: form, signal: AbortSignal.timeout(240_000) });
  if (!response.ok) {
    // Do not log provider bodies: they can include snippets of patient input.
    const temporary = response.status === 429 || response.status >= 500;
    throw new AppError(temporary ? 503 : 422, temporary ? 'TRANSCRIPTION_RETRYABLE' : 'TRANSCRIPTION_REJECTED', `설정된 전사 모델 ${AI_MODELS.transcription} 호출이 실패했습니다 (HTTP ${response.status}). 계정 모델 접근·파일 형식·한도를 확인해 주세요.`);
  }
  const data = await response.json() as DiarizedResponse;
  return normalizeDiarizedTranscript(data);
}
