import { AppError } from '@/lib/server/errors';
import { analysisHash, type AnalysisCandidate, type AnswerCandidate } from './clinical-analysis';
import { latestTranscriptAnalysis, transcriptAnswerKey, transcriptDraftTargetSignature, type TranscriptAnswerDraft, type TranscriptAnswerDraftBinding } from './clinical-analysis-drafts';
import type { AppState, SourceRef } from '@/lib/types';
export type PreparedTranscriptDraftSave = { binding: TranscriptAnswerDraftBinding; candidate: AnswerCandidate; answer: TranscriptAnswerDraft }[];
/** Validate BEFORE followup.save so a concurrent doctor entry cannot be overwritten. */
export function prepareTranscriptAnswerDraftSave(state: AppState, visitId: string, answers: TranscriptAnswerDraft[], bindings: TranscriptAnswerDraftBinding[]): PreparedTranscriptDraftSave {
  if (!Array.isArray(answers) || answers.some(answer => !answer || typeof answer !== 'object') || new Set(answers.map(answer => transcriptAnswerKey(answer.item_key,answer.subitem_key))).size !== answers.length) throw new AppError(400,'INVALID_TRANSCRIPT_DRAFT','중복되지 않은 질문 답변을 확인해 주세요.');
  if (!Array.isArray(bindings) || bindings.length > 40 || new Set(bindings.map(binding => transcriptAnswerKey(binding.item_key,binding.subitem_key))).size !== bindings.length) throw new AppError(400,'INVALID_TRANSCRIPT_DRAFT','전사 초안 연결을 확인해 주세요.');
  if (!bindings.length) return [];
  const context = latestTranscriptAnalysis(state,visitId);
  if (!context) throw new AppError(409,'ANALYSIS_STALE','최신 전사로 다시 분석해 주세요.');
  return bindings.map(binding => {
    if (binding.jobId !== context.job.id || binding.transcriptId !== context.transcript.id || binding.transcriptRevision !== context.transcript.revision) throw new AppError(409,'ANALYSIS_STALE','전사 초안보다 새 전사가 있습니다. 최신 내용을 확인해 주세요.');
    const candidate = (context.job.result!.candidates as AnalysisCandidate[]).find((candidate): candidate is AnswerCandidate => candidate.id === binding.candidateId && candidate.kind === 'answer' && candidate.status === 'pending' && candidate.item_key === binding.item_key && candidate.subitem_key === binding.subitem_key);
    const answer = answers.find(answer => answer.item_key === binding.item_key && answer.subitem_key === binding.subitem_key);
    if (!candidate || !answer || !candidate.source_refs.length || candidate.source_refs.some(ref => ref.kind !== 'provided_transcript' || !context.transcript.segments.some(segment => segment.id === ref.source_id && typeof ref.quote === 'string' && ref.quote.trim() && segment.text.includes(ref.quote)))) throw new AppError(400,'INVALID_TRANSCRIPT_DRAFT','전사 후보의 원래 인용 근거를 확인해 주세요.');
    const stored = state.followup_answers.find(answer => answer.visit_id === visitId && answer.item_key === binding.item_key && answer.subitem_key === binding.subitem_key);
    if (transcriptDraftTargetSignature(stored) !== binding.expectedTarget) throw new AppError(409,'ANALYSIS_DRAFT_CONFLICT','전사 초안을 채운 뒤 의료진 기록이 변경되었습니다. 저장된 답변을 확인해 주세요.');
    const recoverStoredDraft = stored?.review_status === 'draft' && stored.confirmation_status !== 'confirmed' && candidate.source_refs.every(ref => stored.source_refs.some(source => source.kind === 'provided_transcript' && source.source_id === ref.source_id && source.quote === ref.quote));
    if (stored && (stored.answer_text?.trim() || stored.confirmation_status === 'confirmed' || stored.applicability !== 'unknown') && !recoverStoredDraft) throw new AppError(409,'ANALYSIS_DRAFT_CONFLICT','기존 의료진 답변을 AI 초안으로 덮어쓸 수 없습니다. 현재 기록을 직접 검토해 주세요.');
    return { binding, candidate, answer };
  });
}
/** Apply AFTER followup.save in the same updateState transaction. */
export function applyTranscriptAnswerDraftSources(state: AppState, visitId: string, prepared: PreparedTranscriptDraftSave, reviewerId: string, now = new Date().toISOString()) {
  for (const {binding,candidate,answer} of prepared) {
    const saved = state.followup_answers.find(saved => saved.visit_id === visitId && saved.item_key === binding.item_key && saved.subitem_key === binding.subitem_key);
    if (!saved) throw new AppError(400,'INVALID_TRANSCRIPT_DRAFT','저장된 답변을 찾을 수 없습니다.');
    const text = saved.answer_text ?? '', edited = text !== candidate.text;
    const manual: SourceRef = { kind:'manual',source_id:reviewerId,quote:text || '전사 기반 초안을 비웠습니다.',origin:'manual_demo' };
    saved.source_refs = [...candidate.source_refs, ...(edited ? [manual] : [])];
    const confirmed = answer.confirmation_status === 'confirmed' && Boolean(text.trim());
    if (!text.trim()) saved.confirmation_status = 'not_confirmed';
    saved.review_status = confirmed ? 'reviewed' : 'draft';
    if (confirmed) {
      Object.assign(candidate,{status:'confirmed',reviewed_at:now,reviewed_by:reviewerId,review_hash:analysisHash(['confirm',edited ? text : null,null]),saved_ids:[saved.id],...(edited ? {manual_review:{text,source_ref:manual}} : {})});
      const job = state.jobs.find(job => job.id === binding.jobId)!;
      job.updated_at = now;
      if ((job.result!.candidates as AnalysisCandidate[]).every(candidate => candidate.status !== 'pending')) { job.status='completed';job.stage='clinical_analysis_completed'; }
    }
  }
}
