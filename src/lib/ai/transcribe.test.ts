import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { normalizeDiarizedTranscript } from './transcribe';
import { validateEntity } from '@/lib/server/validation';

describe('diarization storage boundary', () => {
  it('keeps labels distinct from clinical roles and conforms to the seed contract', () => {
    const result = normalizeDiarizedTranscript({ text: '어디가 아프세요? 발목이 아파요.', segments: [{ speaker: 'A', text: '어디가 아프세요?', start: 0, end: 1.21 }, { speaker: 'B', text: '발목이 아파요.', start: 1.4, end: 3 }] });
    expect(result.segments.map((item) => item.ordinal)).toEqual([1, 2]);
    expect(result.segments.every((item) => item.speaker === 'unknown')).toBe(true);
    expect(result.rawSpeakers[result.segments[0].id]).toBe('A');
    expect(result.segments[0].end_ms).toBe(1210);
    expect(() => validateEntity('transcript', { id: randomUUID(), clinic_id: '6c8ad2ac-7ed0-5688-9784-cd287f2a7b51', visit_id: randomUUID(), revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: result.text, segments: result.segments, origin: 'manual_demo' })).not.toThrow();
  });
  it('preserves API original text without joining speaker segments over it', () => {
    const result = normalizeDiarizedTranscript({ text: '원문  그대로', segments: [{ text: '원문 그대로', speaker: 'A' }] });
    expect(result.text).toBe('원문  그대로');
  });
  it('provides a role-unknown segment when the API has text but no timestamps', () => {
    const result = normalizeDiarizedTranscript({ text: '원문' });
    expect(result.segments[0]).toMatchObject({ ordinal: 1, speaker: 'unknown', start_ms: null, end_ms: null, text: '원문' });
  });
  it('rejects empty transcription rather than fabricating text', () => expect(() => normalizeDiarizedTranscript({ text: '', segments: [] })).toThrow());
});
