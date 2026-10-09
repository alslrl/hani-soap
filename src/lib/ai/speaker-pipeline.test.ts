import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDiarizedTranscript } from './transcribe';
const mocks = vi.hoisted(() => ({ state: {} as any, infer: vi.fn(), soap: vi.fn(), transcribe: vi.fn(), content: vi.fn() }));
vi.mock('@/lib/server/store', () => ({ readState: async () => ({ state: mocks.state }), updateState: async (fn: any) => fn(mocks.state) }));
vi.mock('./clinical-analysis-jobs', () => ({ ensureClinicalAnalysis: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/audio/storage', () => ({ readAudio: async () => new Blob(['fake']) }));
vi.mock('./transcribe', async importOriginal => ({ ...await importOriginal(), transcribeAudio: mocks.transcribe, transcribeContentAudio: mocks.content }));
vi.mock('./provider', () => ({ inferSpeakerRoles: mocks.infer, generateSoap: mocks.soap, proposeCorrections: vi.fn() }));
import { transcribeStep, soapStep } from './pipeline';
beforeEach(() => {
  mocks.infer.mockReset(); mocks.soap.mockReset(); mocks.transcribe.mockReset(); mocks.content.mockReset();
  mocks.state = { clinic: { id: 'clinic' }, transcripts: [], jobs: [{ id: 'job', visit_id: 'visit', recording_id: 'file', result: {} }], recordings: [{ id: 'file', visit_id: 'visit', filename: 'fake.wav' }], visits: [{ id: 'visit', patient_id: 'patient' }], patients: [{ id: 'patient', display_name: '김서연', guardian: null }], soap_documents: [{ id: 'approved', status: 'approved', sections: { s: 'original' } }] };
  mocks.transcribe.mockResolvedValue(normalizeDiarizedTranscript({ segments: [{ speaker: 'B', text: '어디가 아프세요?', start: 0, end: 1.1 }, { speaker: 'A', text: '발목이 아파요.', start: 1.2, end: 2.5 }] }));
  mocks.content.mockResolvedValue({ text: '어디가 아프세요? 발목이 아파요.', model: 'gpt-transcribe' });
});
describe('role inference pipeline and SOAP revision input', () => {
  it('passes inferred roles directly to SOAP without a preliminary confirmation', async () => {
    mocks.infer.mockResolvedValue({ B: { role: 'clinician', source: 'inferred' }, A: { role: 'patient', source: 'inferred' } });
    await transcribeStep('job');
    mocks.soap.mockResolvedValue({ sections: { s: '발목 통증', o: '', a: '', p: '' }, evidence: [], warnings: [], followup_questions: [] });
    await soapStep('job');
    expect(mocks.soap.mock.calls[0][0].map((s: any) => s.speaker)).toEqual(['clinician', 'patient']);
    expect(mocks.state.soap_documents[0]).toEqual({ id: 'approved', status: 'approved', sections: { s: 'original' } });
  });
  it('retains transcription and manual review on inference failure; retry never reinfers a stored human revision', async () => {
    mocks.infer.mockRejectedValue(new Error('provider offline'));
    const rawId = await transcribeStep('job');
    const primary = mocks.state.transcripts.find((item: any) => item.id === rawId);
    expect(primary.segments.every((s: any) => s.speaker === 'unknown')).toBe(true);
    expect(mocks.state.jobs[0].result.speaker_role_note).toContain('실패');
    const reviewed = { ...primary, id: 'reviewed', revision: primary.revision + 1, status: 'reviewed', segments: primary.segments.map((s: any) => ({ ...s, speaker: 'guardian', speaker_override: 'guardian' })) };
    mocks.state.transcripts.push(reviewed);
    mocks.state.jobs[0].result.reviewedTranscriptId = reviewed.id;
    await transcribeStep('job'); expect(mocks.infer).toHaveBeenCalledTimes(1);
    mocks.soap.mockResolvedValue({ sections: { s: '보호자 보고', o: '', a: '', p: '' }, evidence: [], warnings: [], followup_questions: [] });
    await soapStep('job');
    expect(mocks.soap.mock.calls[0][0]).toEqual(reviewed.segments);
    expect(mocks.state.jobs[0].result.input_transcript_id).toBe('reviewed');
    expect(mocks.state.transcripts.find((item: any) => item.id === rawId)).toEqual(primary);
    expect(mocks.state.soap_documents[0].status).toBe('approved');
  });
  it('preserves both provider originals and exact primary content as separate revisions', async () => {
    mocks.infer.mockResolvedValue({});
    const id = await transcribeStep('job'); const result = mocks.state.jobs[0].result;
    expect(mocks.state.transcripts).toHaveLength(3);
    expect(new Set(mocks.state.transcripts.map((item: any) => item.revision)).size).toBe(3);
    const primary = mocks.state.transcripts.find((item: any) => item.id === id);
    expect(primary.text).toBe('어디가 아프세요? 발목이 아파요.');
    expect(primary.segments.map((item: any) => item.text).join('')).toBe(primary.text);
    expect(mocks.state.transcripts.find((item: any) => item.id === result.diarizedTranscriptId).text).toBe('어디가 아프세요?\n발목이 아파요.');
    expect(result.model).toBe('gpt-transcribe'); expect(result.diarization_model).toBe('gpt-4o-transcribe-diarize');
  });
  it('reuses a successful diarization result after content transcription fails', async () => {
    mocks.infer.mockResolvedValue({});
    mocks.content.mockRejectedValueOnce(new Error('content unavailable'));
    await expect(transcribeStep('job')).rejects.toThrow('content unavailable');
    expect(mocks.state.transcripts).toHaveLength(1);
    const original = structuredClone(mocks.state.transcripts[0]);
    await transcribeStep('job');
    expect(mocks.transcribe).toHaveBeenCalledTimes(1); expect(mocks.content).toHaveBeenCalledTimes(2);
    expect(mocks.state.transcripts[0]).toEqual(original);
    expect(mocks.state.transcripts).toHaveLength(3);
  });

});
