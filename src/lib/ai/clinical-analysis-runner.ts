import { readState, updateState } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';
import { AiTextPrivacy, identitiesForVisit, privacyAudit } from '@/lib/privacy/text';
import { analyzeClinicalTranscript } from './clinical-analysis-provider';
import { AI_MODELS } from './config';

export async function failClinicalAnalysis(jobId: string, error: unknown) {
  await updateState(state => {
    const job = state.jobs.find(item => item.id === jobId && item.result?.task === 'clinical_analysis');
    if (!job) return;
    job.status = 'failed'; job.stage = 'clinical_analysis_failed'; job.updated_at = new Date().toISOString();
    job.error = error instanceof AppError ? error.message : '진료 분석을 완료하지 못했습니다. 기존 전사와 SOAP는 보존됩니다. 다시 분석하거나 직접 기록해 주세요.';
  });
}
export async function runClinicalAnalysis(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find(item => item.id === jobId && item.result?.task === 'clinical_analysis');
  if (!job) throw new AppError(404, 'ANALYSIS_NOT_FOUND', '분석 작업을 찾을 수 없습니다.');
  if (Array.isArray(job.result?.candidates)) return;
  const transcript = state.transcripts.find(item => item.id === job.result?.transcriptId && item.visit_id === job.visit_id);
  const latest = state.transcripts.filter(item => item.visit_id === job.visit_id).sort((a,b) => b.revision-a.revision)[0];
  if (!transcript || latest?.id !== transcript.id || transcript.revision !== job.result?.input_transcript_revision) throw new AppError(409, 'ANALYSIS_STALE', '새 전사로 다시 분석해 주세요.');
  await updateState(next => { const current = next.jobs.find(item => item.id === jobId)!; current.status = 'running'; current.stage = 'clinical_analysis'; current.updated_at = new Date().toISOString(); });
  const privacy = new AiTextPrivacy(identitiesForVisit(state, job.visit_id));
  let output: Awaited<ReturnType<typeof analyzeClinicalTranscript>>;
  try { output = await analyzeClinicalTranscript(transcript, privacy); }
  catch (error) {
    await updateState(next => { const current = next.jobs.find(item => item.id === jobId)!; current.result = { ...current.result, text_privacy: privacyAudit(current.result?.text_privacy, 'clinical_analysis', privacy) }; });
    throw error;
  }
  await updateState(next => {
    const current = next.jobs.find(item => item.id === jobId)!;
    if (Array.isArray(current.result?.candidates)) return;
    const stale = next.transcripts.some(item => item.visit_id === job.visit_id && item.revision > transcript.revision);
    current.result = { ...current.result, ...output, reviewed_signals: [], stale_input: stale, analysis_model: AI_MODELS.analysis, text_privacy: privacyAudit(current.result?.text_privacy, 'clinical_analysis', privacy) };
    current.status = 'waiting_review'; current.stage = stale ? 'clinical_analysis_stale' : 'clinical_analysis_review'; current.updated_at = new Date().toISOString();
  });
}
