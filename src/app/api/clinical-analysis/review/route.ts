import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { updateState } from '@/lib/server/store';
import { readBody, jsonResponse, errorResponse } from '@/lib/server/http';
import { reviewClinicalCandidate, type AnalysisReviewInput } from '@/lib/ai/clinical-analysis-review';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request); assertSameOrigin(request);
    const body = await readBody(request, 20_000);
    if (['jobId','candidateId','visitId','patientId'].some(key => typeof body[key] !== 'string') || !Number.isInteger(body.expectedTranscriptRevision) || !['confirm','reject'].includes(String(body.decision)) || body.allowOverwrite !== undefined && typeof body.allowOverwrite !== 'boolean' || body.expectedTargetHash !== undefined && typeof body.expectedTargetHash !== 'string' || body.edit !== undefined && (!body.edit || typeof body.edit !== 'object' || Array.isArray(body.edit))) throw new AppError(400, 'INVALID_ANALYSIS_REVIEW', '검토할 후보와 전사 버전을 확인해 주세요.');
    let result: unknown;
    await updateState(state => { result = reviewClinicalCandidate(state, body as AnalysisReviewInput, session.id); }, { sessionId: session.id });
    return jsonResponse({ saved: true, ...result as object });
  } catch (error) { return errorResponse(error); }
}
