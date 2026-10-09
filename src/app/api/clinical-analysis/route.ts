import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readState } from '@/lib/server/store';
import { readBody, jsonResponse, errorResponse } from '@/lib/server/http';
import { AiConfigurationError } from '@/lib/ai/config';
import { prepareClinicalAnalysis, dispatchClinicalAnalysis } from '@/lib/ai/clinical-analysis-jobs';
import { failClinicalAnalysis } from '@/lib/ai/clinical-analysis-runner';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    await requireSession(request);
    const visitId = new URL(request.url).searchParams.get('visitId');
    const { state } = await readState();
    if (!state.visits.some(visit => visit.id === visitId && visit.clinic_id === state.clinic.id)) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
    return jsonResponse({ jobs: state.jobs.filter(job => job.visit_id === visitId && job.result?.task === 'clinical_analysis').map(({ session_id: _session, ...job }) => job) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    const session = await requireSession(request); assertSameOrigin(request);
    const body = await readBody(request, 8000);
    if (typeof body.visitId !== 'string' || typeof body.patientId !== 'string' || typeof body.transcriptId !== 'string' || !Number.isInteger(body.expectedTranscriptRevision)) throw new AppError(400, 'ANALYSIS_INPUT_REQUIRED', '같은 환자·방문의 최신 전사를 선택해 주세요.');
    const { state } = await readState();
    const visit = state.visits.find(item => item.id === body.visitId && item.patient_id === body.patientId);
    const transcript = state.transcripts.find(item => item.id === body.transcriptId && item.visit_id === visit?.id);
    if (!visit || !transcript) throw new AppError(404, 'ANALYSIS_INPUT_NOT_FOUND', '같은 환자·방문의 전사를 선택해 주세요.');
    if (transcript.revision !== body.expectedTranscriptRevision) throw new AppError(409, 'ANALYSIS_STALE', '전사 버전이 변경되었습니다. 최신 전사로 다시 분석해 주세요.');
    const prepared = await prepareClinicalAnalysis(visit.id, transcript.id, session.id); jobId = prepared.jobId;
    if (prepared.reused) return jsonResponse(prepared);
    const execution = await dispatchClinicalAnalysis(jobId);
    return jsonResponse({ ...prepared, execution }, execution === 'workflow' ? 202 : 201);
  } catch (error) {
    if (jobId) await failClinicalAnalysis(jobId, error).catch(() => {});
    return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error);
  }
}
