import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/lib/types';
const mock = vi.hoisted(() => ({ state: {} as AppState, start: vi.fn(), provider: vi.fn(), capacity: vi.fn() }));
vi.mock('@/lib/server/store', () => ({ readState: async () => ({ state: mock.state, version:1 }),updateState: async (fn: (state: AppState)=>void) => fn(mock.state) }));
vi.mock('@/lib/server/auth', () => ({ assertAiCapacity: mock.capacity }));
vi.mock('workflow/api', () => ({ start: mock.start }));
vi.mock('./clinical-analysis-provider', () => ({ analyzeClinicalTranscript: mock.provider }));
import { ensureClinicalAnalysis, prepareClinicalAnalysis } from './clinical-analysis-jobs';
import { runClinicalAnalysis } from './clinical-analysis-runner';
let previous: NodeJS.ProcessEnv;
beforeEach(() => {
  previous = { ...process.env }; process.env.OPENAI_API_KEY='synthetic-never-sent'; process.env.HANI_SYNC_AI='1'; delete process.env.VERCEL;
  mock.provider.mockReset();mock.start.mockReset();mock.capacity.mockReset();
  mock.state={clinic:{id:'clinic'},patients:[{id:'patient',display_name:'김서연',guardian:null}],visits:[{id:'visit',clinic_id:'clinic',patient_id:'patient'}],transcripts:[{id:'transcript',clinic_id:'clinic',visit_id:'visit',revision:1,segments:[{id:'s',ordinal:1,speaker:'patient',text:'현재 통증은 0점이에요.'}]}],jobs:[],followup_answers:[],observations:[],soap_documents:[{id:'approved',status:'approved'}]} as unknown as AppState;
});
afterEach(() => { process.env = previous; });
describe('independent, durable clinical analysis job lifecycle', () => {
  it('runs once locally, reuses the source job and preserves unrelated approved SOAP', async () => {
    mock.provider.mockResolvedValue({candidates:[],missing_questions:[],discarded_count:0,usage:{totalTokens:1}});
    const first=await ensureClinicalAnalysis('visit','transcript','session'); const repeated=await ensureClinicalAnalysis('visit','transcript','session');
    expect(first.execution).toBe('local_synchronous'); expect(repeated.reused).toBe(true); expect(mock.provider).toHaveBeenCalledTimes(1); expect(mock.state.soap_documents).toEqual([{id:'approved',status:'approved'}]);
  });
  it('dispatches Vercel work durably with only opaque job IDs', async () => {
    process.env.VERCEL='1'; mock.start.mockResolvedValue({runId:'run'});
    const result=await ensureClinicalAnalysis('visit','transcript','session');
    expect(result.execution).toBe('workflow'); expect(mock.provider).not.toHaveBeenCalled(); expect(mock.start.mock.calls[0][1]).toEqual([result.jobId]); expect(mock.state.jobs[0].run_id).toBe('run');
  });
  it('returns nonfatal capacity/model errors and never changes transcription or SOAP', async () => {
    mock.capacity.mockRejectedValueOnce(new Error('capacity'));
    expect((await ensureClinicalAnalysis('visit','transcript','session')).error).toBeTruthy(); expect(mock.state.jobs).toEqual([]);
    mock.provider.mockRejectedValue(new Error('model offline'));
    const before=structuredClone(mock.state.transcripts);
    const result=await ensureClinicalAnalysis('visit','transcript'); expect(result.error).toBeTruthy(); expect(mock.state.jobs[0].status).toBe('failed'); expect(mock.state.transcripts).toEqual(before); expect(mock.state.soap_documents[0].status).toBe('approved');
  });
  it('marks results stale if a new transcript arrives during generation', async () => {
    const prepared=await prepareClinicalAnalysis('visit','transcript');
    mock.provider.mockImplementation(async () => { mock.state.transcripts.push({...mock.state.transcripts[0],id:'new',revision:2}); return {candidates:[],missing_questions:[],discarded_count:0}; });
    await runClinicalAnalysis(prepared.jobId); expect(mock.state.jobs[0].result?.stale_input).toBe(true); expect(mock.state.jobs[0].result?.transcriptId).toBe('transcript');
  });
});
