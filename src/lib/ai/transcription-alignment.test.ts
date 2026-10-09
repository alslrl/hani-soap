import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Segment } from '@/lib/types';
import { alignTranscriptContent } from './transcription-alignment';
import fixture from './__fixtures__/dual-transcription.json';
const segment = (text: string, speaker: string, start: number, end: number): Segment => ({ id: randomUUID(), ordinal: 1, speaker: 'unknown', raw_speaker: speaker, text, start_ms: start, end_ms: end });

describe('content-to-speaker alignment', () => {
  it('isolates overlapping timing without throwing away clear speaker evidence elsewhere', () => {
    const source=[segment('오늘 어디가 아프세요?','A',0,2000),segment('발목이 아파요.','B',1840,3200),segment('우측 부종은 45cm입니다.','A',3400,5000)];
    const result=alignTranscriptContent('오늘 어디가 아프세요? 발목이 아파요. 우측 부종은 45cm입니다.',source);
    expect(result.segments.map(s=>s.raw_speaker)).toEqual(['A','B','A']);
    expect(result.segments[0].timing_review).toBe(true);expect(result.segments[0].start_ms).toBeNull();
    expect(result.segments[2].start_ms).toBe(3400);
    expect(result.unassigned_groups).toBe(0);
  });
  it('maps the real synthetic ASR pair into intact sentences with eight consecutive speaker groups without losing or rewriting content', () => {
    const source = structuredClone(fixture.diarized) as Segment[]; const before = JSON.stringify(source);
    const result = alignTranscriptContent(fixture.content, source);
    expect(result.segments.map((v) => v.text).join('')).toBe(fixture.content);
    expect(result.segments.map((v) => v.raw_speaker).filter((v,i,a)=>!i||v!==a[i-1])).toEqual(['A','B','A','B','A','B','A','B']);
    expect(result.unassigned_groups).toBe(0);
    expect(result.changed_groups).toBeGreaterThan(0);
    expect(result.segments.some(s=>s.text.includes('김서연'))).toBe(true);
    expect(result.segments.find(s=>s.text.includes('발을 높여'))?.raw_speaker).toBe('B');
    expect(new Set(result.segments.flatMap(v=>v.source_segment_ids))).toEqual(new Set(source.map(v=>v.id)));
    expect(JSON.stringify(source)).toBe(before);
  });
  it('keeps whitespace and punctuation exact and preserves the original time ranges', () => {
    const source=[segment('안녕하세요?','A',100,1000),segment('발목이 아파요.','B',1200,2200)];
    const text='  안녕하세요!\n발목이 아파요.  ';
    const result=alignTranscriptContent(text,source);
    expect(result.segments.map(s=>s.text).join('')).toBe(text);
    expect(result.segments.map(s=>[s.start_ms,s.end_ms])).toEqual([[100,1000],[1200,2200]]);
    expect(result.changed_groups).toBe(0);
  });
  it('leaves a new phrase at a speaker boundary unassigned instead of silently picking a speaker', () => {
    const source=[segment('안녕하세요.','A',0,1000),segment('발목이 아파요.','B',1100,2200)];
    const text='안녕하세요. 처음 왔어요. 발목이 아파요.';
    const result=alignTranscriptContent(text,source);
    expect(result.segments.map(s=>s.text).join('')).toBe(text);
    expect(result.unassigned_groups).toBeGreaterThan(0);
    expect(result.segments.filter(s=>s.alignment_status==='review_needed').every(s=>!s.raw_speaker&&s.speaker==='unknown')).toBe(true);
  });
  it('preserves the primary text when wording is unrelated, timestamps overlap or the bounded algorithm is exceeded', () => {
    for(const [text,source] of [
      ['완전히 다른 녹음 내용입니다.',[segment('그렇군요.','A',0,1000)]],
      ['안녕하세요 발목이 아파요',[segment('안녕하세요','A',0,2000),segment('발목이 아파요','B',1000,3000)]],
      ['통증'.repeat(2500),[segment('통증'.repeat(2500),'A',0,10000)]],
    ] as [string,Segment[]][]){
      const result=alignTranscriptContent(text,source);
      expect(result.segments.map(s=>s.text).join('')).toBe(text);
      expect(result.segments).toHaveLength(1); expect(result.segments[0].raw_speaker).toBeUndefined();
      expect(result.segments[0].start_ms).toBeNull();
    }
  });
  it('does not invent a speaker for text-only diarization or drop deleted/repeated turns', () => {
    const content='네'; const result=alignTranscriptContent(content,[segment('네','A',0,500),segment('네','B',700,1000)]);
    expect(result.segments[0]).toMatchObject({text:content,speaker:'unknown',alignment_status:'review_needed'});
    expect(result.segments[0].raw_speaker).toBeUndefined();
  });
});
