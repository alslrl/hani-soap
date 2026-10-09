import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const model = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', async (original) => ({ ...await original(), generateText: model.generate }));
import { generateSoap, inferSpeakerRoles, proposeCorrections } from './provider';
import { transcribeAudio } from './transcribe';
import { AiTextPrivacy, identitiesForVisit } from '@/lib/privacy/text';
import { privateAudioFilename } from '@/lib/audio/filename';
import { prepareClinicalTextJob, generateCareStep, generateBriefingStep } from './care-generation';
import { readState, mutateState } from '@/lib/server/store';
import { unlock, SESSION_COOKIE } from '@/lib/server/auth';
import type { Segment } from '@/lib/types';

const rawText = '김서연님은 통증 NRS 8점이며 연락처는 010-1234-5678입니다.';
const segment: Segment = { id: 'stable-segment', ordinal: 1, raw_speaker: 'A', speaker: 'patient', text: rawText, start_ms: 0, end_ms: 1000 };
const context = () => new AiTextPrivacy([{ value: '김서연', kind: 'patient_name' }]);
function outgoing(call: { prompt: string }) {
  expect(call.prompt).not.toContain('김서연'); expect(call.prompt).not.toContain('010-1234-5678');
  expect(call.prompt).toContain('[HANI_PII:'); return JSON.parse(call.prompt);
}
beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key'); model.generate.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('outbound text-model boundaries', () => {
  it('masks speaker-role input and restores evidence before group validation', async () => {
    model.generate.mockImplementation(async (call) => {
      const input = outgoing(call);
      return { output: { groups: [{ group: 'A', role: 'patient', evidence: [{ segment_id: segment.id, quote: input.segments[0].text }] }] } };
    });
    const result = await inferSpeakerRoles(rawText, [segment], context());
    expect(result.A).toMatchObject({ role: 'patient', evidence: [rawText] });
    expect(segment.text).toBe(rawText);
  });
  it('masks SOAP input while preserving exact original citations and clinical numbers', async () => {
    model.generate.mockImplementation(async (call) => {
      const input = outgoing(call); expect(input.segments[0].text).toContain('NRS 8');
      return { output: { sections: { s: '통증 NRS 8점', o: '', a: '', p: '' }, evidence: [{ section: 's', segment_id: segment.id, quote: input.segments[0].text }], warnings: [], followup_questions: [] } };
    });
    const result = await generateSoap([segment], context());
    expect(result.evidence[0].quote).toBe(rawText); expect(result.sections.s).toBe('통증 NRS 8점');
  });
  it('masks correction context and keeps raw offset validation on the server', async () => {
    const original = '보중이기탕'; const text = rawText + original;
    model.generate.mockImplementation(async (call) => {
      const input = outgoing(call);
      expect(input.spans[0]).not.toHaveProperty('start'); expect(input.spans[0].original).toBe(original);
      return { output: { decisions: [{ span_id: 'span', candidate_id: 'candidate', decision: 'retain', reason: input.transcript }] } };
    });
    const result = await proposeCorrections(text, [{ id: 'span', start: rawText.length, end: text.length, original, candidates: [] }], context());
    expect(result[0].reason).toBe(text);
  });
});

describe('audio file name minimization', () => {
  it('never sends the original filename but preserves audio bytes and diarization settings', async () => {
    const blob = new Blob(['synthetic audio bytes'], { type: 'audio/mpeg' });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = init.body as FormData; const file = body.get('file') as File;
      expect(file.name).toMatch(/^audio-[a-f\d-]{36}\.mp3$/); expect(file.name).not.toContain('김서연');
      expect(await file.text()).toBe('synthetic audio bytes'); expect(body.get('response_format')).toBe('diarized_json');
      return Response.json({ text: '김서연님', segments: [{ text: '김서연님', speaker: 'A' }] });
    }));
    const result = await transcribeAudio(blob, '김서연-01012345678.MP3');
    expect(result.text).toBe('김서연님');
    expect(() => privateAudioFilename('이름.exe')).toThrow('AUDIO_FORMAT_UNSUPPORTED');
  });
});

describe('care and briefing masking with isolated persistence', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hani-privacy-test-'));
    vi.stubEnv('HANI_DATA_DIR', directory); vi.stubEnv('HANI_STORAGE_MODE', 'local'); vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); vi.stubEnv('DEMO_DEV_PIN', '1234'); vi.stubEnv('DEMO_PIN_HASH', ''); vi.stubEnv('VERCEL', '');
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
  const headers = { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' };
  async function approvedSource() {
    const state = (await readState()).state;
    const past = state.soap_documents.find((item) => item.status === 'approved')!;
    const patient = state.patients.find((item) => item.id === state.visits.find((v) => v.id === past.visit_id)!.patient_id)!;
    const body = `${patient.display_name}님은 하루 3회 식후 30분 복용하며 010-1234-5678로 문의하도록 안내했다.`;
    const saved = await mutateState({ type: 'soap.save', payload: { visitId: past.visit_id, sections: { s: rawText, o: '', a: '', p: body } } });
    const doc = saved.state.soap_documents.filter((item) => item.visit_id === past.visit_id).at(-1)!;
    await mutateState({ type: 'soap.approve', payload: { visitId: past.visit_id, soapId: doc.id, revision: doc.revision } });
    return { visitId: past.visit_id, body, patient, originalApproved: state.soap_documents.find((v) => v.id === past.id)! };
  }
  async function request(visitId: string) {
    const session = await unlock(new Request('http://localhost:3000/api/access/unlock', { method: 'POST', headers }), '1234');
    return new Request('http://localhost:3000/api/care/generate', { method: 'POST', headers: { ...headers, cookie: `${SESSION_COOKIE}=${session.token}` }, body: JSON.stringify({ visitId }) });
  }
  it('sends masked approved P, restores quotes and keeps only counts in the care job audit', async () => {
    const source = await approvedSource();
    model.generate.mockImplementation(async (call) => {
      expect(call.prompt).not.toContain(source.patient.display_name); expect(call.prompt).not.toContain('010-1234-5678');
      const input = JSON.parse(call.prompt); const soap = input.approved_soap[0];
      return { output: { sentences: [{ text: '하루 3회 식후 30분 복용하세요.', source_soap_id: soap.id, section: 'p', quote: soap.sections.p }], missing_information: [], review_notes: [] }, totalUsage: {} };
    });
    const prepared = await prepareClinicalTextJob(await request(source.visitId), 'care');
    await generateCareStep(prepared.jobId);
    const after = (await readState()).state; const job = after.jobs.find((v) => v.id === prepared.jobId)!;
    expect((job.result!.evidence as any[])[0].quote).toBe(source.body);
    expect(JSON.stringify(job.result!.text_privacy)).not.toContain(source.patient.display_name);
    expect((job.result!.text_privacy as any).care.redacted_count).toBeGreaterThan(0);
    expect(after.soap_documents.find((v) => v.id === source.originalApproved.id)).toEqual(source.originalApproved);
  });
  it('masks historical briefing sources and retains source/date metadata and evidence', async () => {
    const source = await approvedSource(); const state = (await readState()).state;
    const visitId = state.scenario_inputs.find((v) => v.patient_id === source.patient.id)!.current_visit_id;
    model.generate.mockImplementation(async (call) => {
      expect(call.prompt).not.toContain(source.patient.display_name); expect(call.prompt).not.toContain('010-1234-5678');
      const input = JSON.parse(call.prompt); const soap = input.previous_approved_visits.find((v: any) => v.visit_id === source.visitId);
      expect(soap.visit_date).toContain('2026-');
      return { output: { points: [{ text: '과거 하루 3회 식후 30분 복용을 안내함.', source_soap_id: soap.id, section: 'p', quote: soap.sections.p }], missing_information: [] }, totalUsage: {} };
    });
    const prepared = await prepareClinicalTextJob(await request(visitId), 'briefing');
    await generateBriefingStep(prepared.jobId);
    const after = (await readState()).state; const job = after.jobs.find((v) => v.id === prepared.jobId)!;
    expect((job.result!.points as any[])[0].quote).toBe(source.body);
    expect((job.result!.text_privacy as any).briefing.checked).toBe(true);
    expect(identitiesForVisit(after, visitId)[0].value).toBe(source.patient.display_name);
  });
});
