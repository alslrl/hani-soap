import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { applyAction } from '@/lib/server/actions';
import { updateState, publicEnvelope } from '@/lib/server/store';
import { readBody, jsonResponse, errorResponse } from '@/lib/server/http';
import { prepareTranscriptAnswerDraftSave, applyTranscriptAnswerDraftSources } from '@/lib/ai/clinical-analysis-draft-sources';
import type { TranscriptAnswerDraft, TranscriptAnswerDraftBinding } from '@/lib/ai/clinical-analysis-drafts';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request); assertSameOrigin(request);
    const body = await readBody(request,150_000);
    if (typeof body.visitId !== 'string' || typeof body.patientId !== 'string' || !Array.isArray(body.answers) || body.answers.length > 100 || !Array.isArray(body.transcriptDrafts) || body.transcriptDrafts.some(binding => !binding || typeof binding !== 'object') || body.expectedVersion !== undefined && !Number.isInteger(body.expectedVersion)) throw new AppError(400,'INVALID_TRANSCRIPT_DRAFT','저장할 답변과 전사 초안을 확인해 주세요.');
    const result = await updateState(state => {
      const visit = state.visits.find(visit => visit.id === body.visitId && visit.patient_id === body.patientId && visit.clinic_id === state.clinic.id);
      if (!visit) throw new AppError(404,'VISIT_NOT_FOUND','같은 환자·방문의 답변을 선택해 주세요.');
      const prepared = prepareTranscriptAnswerDraftSave(state,visit.id,body.answers as TranscriptAnswerDraft[],body.transcriptDrafts as TranscriptAnswerDraftBinding[]);
      applyAction(state,{type:'followup.save',payload:{visitId:visit.id,answers:body.answers}},session.id);
      applyTranscriptAnswerDraftSources(state,visit.id,prepared,session.id);
    },{sessionId:session.id,...(typeof body.expectedVersion === 'number' ? {expectedVersion:body.expectedVersion} : {})});
    return jsonResponse(publicEnvelope(result));
  } catch(error) { return errorResponse(error); }
}
