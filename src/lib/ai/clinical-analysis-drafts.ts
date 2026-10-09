import type { AppState, FollowupAnswer, Observation, RuntimeJob } from '@/lib/types';
import type { AnalysisCandidate, AnswerCandidate, MeasurementCandidate } from './clinical-analysis';
export type TranscriptAnswerDraftBinding = { jobId: string; candidateId: string; item_key: FollowupAnswer['item_key']; subitem_key: string; transcriptId: string; transcriptRevision: number; expectedTarget: string };
export type TranscriptAnswerDraft = Pick<FollowupAnswer, 'item_key' | 'subitem_key' | 'answer_text' | 'change' | 'confirmation_status' | 'applicability'>;
export type NrsProposalMatch = Pick<Observation, 'metric_key' | 'instrument' | 'body_region' | 'laterality' | 'activity_key' | 'measurement_context'>;
export type NrsPanelTarget = Omit<NrsProposalMatch, 'instrument'> & { inputId: string };
export const transcriptAnswerKey = (item: string, subitem: string) => `${item}:${subitem}`;
/** Fixed property order survives JSONB ordering without crypto in a client bundle. */
export function transcriptDraftTargetSignature(answer?: FollowupAnswer) {
  return JSON.stringify(answer ? [answer.id, answer.answer_text, answer.change, answer.confirmation_status, answer.applicability, answer.review_status, answer.source_refs.map(ref => [ref.kind, ref.source_id, ref.quote, ref.origin])] : null);
}
export function latestTranscriptAnalysis(state: AppState, visitId: string) {
  const visit = state.visits.find(visit => visit.id === visitId && visit.clinic_id === state.clinic.id);
  const transcript = state.transcripts.filter(item => item.visit_id === visitId).sort((a,b) => b.revision-a.revision)[0];
  if (!visit || !transcript) return undefined;
  const job = state.jobs.filter(job => job.clinic_id === state.clinic.id && job.visit_id === visitId && job.kind === 'analysis' && job.result?.task === 'clinical_analysis' && job.result?.patientId === visit.patient_id && job.result?.transcriptId === transcript.id && job.result?.input_transcript_revision === transcript.revision && job.result?.stale_input !== true && ['waiting_review','completed'].includes(job.status) && Array.isArray(job.result?.candidates)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
  return job ? { job, transcript, patientId: visit.patient_id } : undefined;
}
function quoteBound(candidate: AnalysisCandidate, context: NonNullable<ReturnType<typeof latestTranscriptAnalysis>>) {
  return candidate.source_refs.length > 0 && candidate.source_refs.every(ref => ref.kind === 'provided_transcript' && typeof ref.quote === 'string' && ref.quote.trim() && context.transcript.segments.some(segment => segment.id === ref.source_id && segment.text.includes(ref.quote!)));
}
export function getTranscriptAnswerProposals(state: AppState, visitId: string) {
  const context = latestTranscriptAnalysis(state,visitId);
  if (!context) return [];
  return (context.job.result!.candidates as AnalysisCandidate[]).filter((candidate): candidate is AnswerCandidate => candidate.kind === 'answer' && candidate.status === 'pending' && quoteBound(candidate,context)).map(candidate => ({ candidate, jobId: context.job.id, transcriptId: context.transcript.id, transcriptRevision: context.transcript.revision, patientId: context.patientId }));
}
const normalizeRegion = (value: string | null) => value && ['ankle','발목','우측 발목','오른쪽 발목','우측발목','오른쪽발목','right_ankle'].includes(value.trim()) ? 'ankle' : value;
export function matchesTranscriptNrsCandidate(candidate: AnalysisCandidate, match: NrsProposalMatch): candidate is MeasurementCandidate {
  return match.metric_key === 'pain_intensity' && match.instrument === 'NRS' && candidate.kind === 'measurement' && candidate.instrument === 'NRS' && candidate.temporal === 'current' && candidate.unit === 'score' && Number.isInteger(candidate.value) && candidate.value >= 0 && candidate.value <= 10 && candidate.body_region !== null && normalizeRegion(candidate.body_region) === normalizeRegion(match.body_region) && candidate.laterality === match.laterality && candidate.activity_key === match.activity_key && candidate.measurement_context === match.measurement_context;
}
/** Exact condition only: no vague site, other activity, past value or guardian frequency. */
export function getTranscriptNrsProposal(state: AppState, visitId: string, match: NrsProposalMatch): { jobId: string; candidate: MeasurementCandidate; transcriptRevision: number; patientId: string } | undefined {
  const context = latestTranscriptAnalysis(state,visitId);
  if (!context || state.observations.some(observation => observation.visit_id === visitId && observation.metric_key === match.metric_key && observation.instrument === match.instrument && normalizeRegion(observation.body_region) === normalizeRegion(match.body_region) && observation.laterality === match.laterality && observation.activity_key === match.activity_key && observation.measurement_context === match.measurement_context)) return undefined;
  const candidate = (context.job.result!.candidates as AnalysisCandidate[]).find((candidate): candidate is MeasurementCandidate => candidate.status === 'pending' && matchesTranscriptNrsCandidate(candidate,match) && quoteBound(candidate,context));
  return candidate ? { jobId: context.job.id, candidate, transcriptRevision: context.transcript.revision, patientId: context.patientId } : undefined;
}

export function prefillTranscriptAnswerDrafts<T extends TranscriptAnswerDraft>(state: AppState, visitId: string, drafts: Record<string,T>, dirty = false) {
  if (dirty) return { drafts, bindings: {} as Record<string,TranscriptAnswerDraftBinding>, hasUnsavedAiDrafts: false };
  const next = { ...drafts }, bindings: Record<string,TranscriptAnswerDraftBinding> = {};
  let hasUnsavedAiDrafts = false;
  for (const proposal of getTranscriptAnswerProposals(state,visitId)) {
    const candidate = proposal.candidate, key = transcriptAnswerKey(candidate.item_key,candidate.subitem_key), draft = next[key];
    if (!draft) continue;
    const stored = state.followup_answers.find(answer => answer.visit_id === visitId && answer.item_key === candidate.item_key && answer.subitem_key === candidate.subitem_key);
    const recoverStoredDraft = stored?.review_status === 'draft' && stored.confirmation_status !== 'confirmed' && candidate.source_refs.every(ref => stored.source_refs.some(source => source.kind === 'provided_transcript' && source.source_id === ref.source_id && source.quote === ref.quote));
    const protectedStored = Boolean(stored && (stored.answer_text?.trim() || stored.confirmation_status === 'confirmed' || stored.applicability !== 'unknown'));
    if (protectedStored && !recoverStoredDraft || draft.answer_text?.trim() && !recoverStoredDraft || draft.confirmation_status === 'confirmed') continue;
    bindings[key] = { jobId: proposal.jobId, candidateId: candidate.id, item_key: candidate.item_key, subitem_key: candidate.subitem_key, transcriptId: proposal.transcriptId, transcriptRevision: proposal.transcriptRevision, expectedTarget: transcriptDraftTargetSignature(stored) };
    if (!recoverStoredDraft) { next[key] = { ...draft, answer_text: candidate.text, change: candidate.change, confirmation_status: 'not_confirmed' }; hasUnsavedAiDrafts = true; }
  }
  return { drafts: next, bindings, hasUnsavedAiDrafts };
}
export function transcriptDraftAnalysisSignature(state: AppState, visitId: string) {
  const context = latestTranscriptAnalysis(state,visitId);
  return context ? JSON.stringify([context.job.id,context.transcript.id,context.transcript.revision,(context.job.result!.candidates as AnalysisCandidate[]).filter(candidate => candidate.kind === 'answer').map(candidate => [candidate.id,candidate.status,candidate.text])]) : '';
}
