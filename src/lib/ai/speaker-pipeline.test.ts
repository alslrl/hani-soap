import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDiarizedTranscript } from './transcribe';
const mocks = vi.hoisted(() => ({ state: {} as any, infer: vi.fn(), soap: vi.fn(), transcribe: vi.fn() }));
vi.mock('@/lib/server/store', () => ({ readState: async () => ({ state: mocks.state }), updateState: async (fn: any) => fn(mocks.state) }));
vi.mock('@/lib/audio/storage', () => ({ readAudio: async () => new Blob(['fake']) }));
vi.mock('./transcribe', async importOriginal => ({ ...await importOriginal(), transcribeAudio: mocks.transcribe }));
vi.mock('./provider', () => ({ inferSpeakerRoles: mocks.infer, generateSoap: mocks.soap, proposeCorrections: vi.fn() }));
import { transcribeStep, soapStep } from './pipeline';
beforeEach(() => {
  mocks.infer.mockReset(); mocks.soap.mockReset(); mocks.transcribe.mockReset();
  mocks.state = { clinic: { id: 'clinic' }, transcripts: [], jobs: [{ id: 'job', visit_id: 'visit', recording_id: 'file', result: {} }], recordings: [{ id: 'file', visit_id: 'visit', filename: 'fake.wav' }], visits: [{ id: 'visit' }], soap_documents: [{ id: 'approved', status: 'approved', sections: { s: 'original' } }] };
  mocks.transcribe.mockResolvedValue(normalizeDiarizedTranscript({ segments: [{ speaker: 'B', text: '어디가 아프세요?' }, { speaker: 'A', text: '발목이 아파요.' }] }));
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
    expect(mocks.state.transcripts[0].segments.every((s: any) => s.speaker === 'unknown')).toBe(true);
    expect(mocks.state.jobs[0].result.speaker_role_note).toContain('실패');
    const reviewed = { ...mocks.state.transcripts[0], id: 'reviewed', revision: 2, status: 'reviewed', segments: mocks.state.transcripts[0].segments.map((s: any) => ({ ...s, speaker: 'guardian', speaker_override: 'guardian' })) };
    mocks.state.transcripts.push(reviewed);
    mocks.state.jobs[0].result.reviewedTranscriptId = reviewed.id;
    await transcribeStep('job'); expect(mocks.infer).toHaveBeenCalledTimes(1);
    mocks.soap.mockResolvedValue({ sections: { s: '보호자 보고', o: '', a: '', p: '' }, evidence: [], warnings: [], followup_questions: [] });
    await soapStep('job');
    expect(mocks.soap.mock.calls[0][0]).toEqual(reviewed.segments);
    expect(mocks.state.jobs[0].result.input_transcript_id).toBe('reviewed');
    expect(mocks.state.transcripts[0].id).toBe(rawId);
    expect(mocks.state.soap_documents[0].status).toBe('approved');
  });
});
