import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTextPrivacy } from '@/lib/privacy/text';
import type { Transcript } from '@/lib/types';
const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', () => ({ generateText: mock.generate, Output: { object: (value: unknown) => value } }));
import { analyzeClinicalTranscript } from './clinical-analysis-provider';
beforeEach(() => { mock.generate.mockReset(); vi.stubEnv('OPENAI_API_KEY', 'synthetic-not-sent'); });
afterEach(() => vi.unstubAllEnvs());
describe('new analysis provider privacy and quote restoration', () => {
  it('sends only masked identifiers, restores exact local evidence and exposes count-only audits', async () => {
    const text = '김서연입니다. 전화는 010-1234-5678이고 지금 발목 통증은 0점이에요.';
    const transcript: Transcript = { id: 'raw', clinic_id: 'clinic', visit_id: 'visit', revision:1,status:'reviewed',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:'segment',ordinal:1,speaker:'patient',text,start_ms:null,end_ms:null}] };
    mock.generate.mockImplementation(async (options: { prompt: string }) => {
      expect(options.prompt).not.toContain('김서연'); expect(options.prompt).not.toContain('010-1234-5678'); expect(options.prompt).toContain('[HANI_PII:');
      const prompt = JSON.parse(options.prompt);
      return { output: { answers: [{item_key:'pain',subitem_key:'current_pain',text:prompt.transcript.segments[0].text,change:null,temporal:'current',evidence:[{segment_id:'segment',quote:prompt.transcript.segments[0].text}]}],measurements:[],signals:[],missing_questions:[] },totalUsage:{inputTokens:1,outputTokens:1,totalTokens:2} };
    });
    const privacy = new AiTextPrivacy([{ value: '김서연',kind:'patient_name' }]);
    const result = await analyzeClinicalTranscript(transcript,privacy);
    expect(result.candidates[0].source_refs[0].quote).toBe(text);
    const audit = JSON.stringify(privacy.summary()); expect(audit).not.toContain('김서연'); expect(audit).not.toContain('5678'); expect(audit).not.toContain('HANI_PII'); expect(privacy.summary().redacted_count).toBe(2);
  });
});
