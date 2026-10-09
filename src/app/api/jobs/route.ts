import { createHash, randomUUID } from 'node:crypto';
import { start } from 'workflow/api';
import { processAudioWorkflow } from '../../../../workflows/process-audio';
import { AI_MODELS, getApiKey, AiConfigurationError } from '@/lib/ai/config';
import { requireSession, assertSameOrigin, assertAiCapacity } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { readState, updateState } from '@/lib/server/store';
import { patchJob, failJob, transcribeStep, correctionStep, soapStep } from '@/lib/ai/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    await requireSession(request);
    const visitId = new URL(request.url).searchParams.get('visitId');
    const { state } = await readState();
    return jsonResponse({ jobs: state.jobs.filter((item) => item.visit_id === visitId).map(({ session_id: _session, ...job }) => job), transcripts: state.transcripts.filter((item) => item.visit_id === visitId), recordings: state.recordings.filter((item) => item.visit_id === visitId).map(({ upload_token_hash: _token, upload_expires_at: _expires, ...recording }) => recording) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    getApiKey();
    const { visitId, recordingId, kind, transcriptId } = await readBody(request, 8000);
    const { state, version } = await readState();
    const visit = state.visits.find((item) => item.id === visitId && item.clinic_id === state.clinic.id);
    if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
    const recording = state.recordings.find((item) => item.id === recordingId && item.visit_id === visit.id);
    const transcript = state.transcripts.find((item) => item.id === transcriptId && item.visit_id === visit.id);
    const soapOnly = kind === 'soap';
    if (soapOnly ? !transcript : !recording || !['uploaded', 'completed', 'failed'].includes(recording.status)) throw new AppError(400, 'JOB_INPUT_REQUIRED', soapOnly ? '검토할 전사를 먼저 저장해 주세요.' : '음성 파일 업로드를 먼저 완료해 주세요.');
    const inputHash = createHash('sha256').update(JSON.stringify({ visitId, kind: soapOnly ? 'soap' : 'transcription', recordingId: recording?.id, transcriptId: transcript?.id, models: AI_MODELS })).digest('hex');
    const existing = state.jobs.find((item) => item.input_hash === inputHash && item.status !== 'failed');
    if (existing) return jsonResponse({ jobId: existing.id, reused: true }, 200);
    await assertAiCapacity(session.id);
    const candidateId = randomUUID();
    const partialResult = !soapOnly ? [...state.jobs].reverse().find((item) => item.recording_id === recording?.id && item.status === 'failed' && item.result?.transcriptId)?.result : undefined;
    let reused = false;
    await updateState((next) => {
      const prior = next.jobs.find((item) => item.input_hash === inputHash && item.status !== 'failed');
      if (prior) { jobId = prior.id; reused = true; return; }
      jobId = candidateId;
      next.jobs.push({ id: candidateId, clinic_id: next.clinic.id, visit_id: visit.id, recording_id: recording?.id ?? null, kind: soapOnly ? 'soap' : 'transcription', status: 'queued', stage: 'queued', input_hash: inputHash, input_version: version, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), session_id: session.id, result: { ...partialResult, mode: 'actual_ai', ...(transcript ? { transcriptId: transcript.id, reviewedTranscriptId: transcript.id } : {}) } });
      const file = next.recordings.find((item) => item.id === recording?.id);
      if (file) file.status = 'processing';
      const currentVisit = next.visits.find((item) => item.id === visit.id)!;
      if (currentVisit.workflow_status === 'waiting') { currentVisit.workflow_status = 'in_progress'; currentVisit.started_at = new Date().toISOString(); }
    }, { sessionId: session.id });
    if (reused) return jsonResponse({ jobId, reused: true }, 200);
    if (!process.env.VERCEL && process.env.HANI_SYNC_AI === '1') {
      // Explicit development mode: finishes in this request, never detached from server lifetime.
      if (!soapOnly) { await transcribeStep(jobId!); await correctionStep(jobId!); }
      await soapStep(jobId!);
      return jsonResponse({ jobId, execution: 'local_synchronous' }, 201);
    }
    const run = await start(processAudioWorkflow, [jobId!]);
    await patchJob(jobId!, { run_id: run.runId });
    return jsonResponse({ jobId, runId: run.runId, execution: 'workflow' }, 202);
  } catch (error) {
    if (jobId) await failJob(jobId, error).catch(() => {});
    return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error);
  }
}
