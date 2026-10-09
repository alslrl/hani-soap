import { randomUUID } from 'node:crypto';
import { start } from 'workflow/api';
import { analyzeClinicalWorkflow } from '../../../workflows/clinical-analysis';
import { readState, updateState } from '@/lib/server/store';
import { assertAiCapacity } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { TEXT_PRIVACY_VERSION } from '@/lib/privacy/text';
import { AI_MODELS, getApiKey } from './config';
import { analysisHash } from './clinical-analysis';
import { runClinicalAnalysis, failClinicalAnalysis } from './clinical-analysis-runner';
export const CLINICAL_ANALYSIS_VERSION = 'clinical-analysis-v1';
export async function prepareClinicalAnalysis(visitId: string, transcriptId?: string, sessionId?: string) {
  getApiKey();
  const { state, version } = await readState();
  const visit = state.visits.find(item => item.id === visitId && item.clinic_id === state.clinic.id);
  if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '분석할 방문을 찾을 수 없습니다.');
  const latest = state.transcripts.filter(item => item.visit_id === visitId).sort((a,b) => b.revision-a.revision)[0];
  if (!latest) throw new AppError(400, 'TRANSCRIPT_REQUIRED', '저장된 전사가 필요합니다.');
  if (transcriptId && latest.id !== transcriptId) throw new AppError(409, 'ANALYSIS_STALE', '최신 전사로 다시 분석해 주세요.');
  const inputHash = analysisHash([visitId, latest.id, latest.revision, latest.segments, AI_MODELS.analysis, TEXT_PRIVACY_VERSION, CLINICAL_ANALYSIS_VERSION]);
  const existing = state.jobs.find(item => item.kind === 'analysis' && item.result?.task === 'clinical_analysis' && item.input_hash === inputHash && item.status !== 'failed');
  if (existing) return { jobId: existing.id, reused: true };
  if (sessionId) await assertAiCapacity(sessionId);
  let jobId: string = randomUUID();
  let reused = false;
  await updateState(next => {
    if (next.transcripts.some(item => item.visit_id === visitId && item.revision > latest.revision)) throw new AppError(409, 'ANALYSIS_STALE', '최신 전사로 다시 분석해 주세요.');
    const prior = next.jobs.find(item => item.input_hash === inputHash && item.result?.task === 'clinical_analysis' && item.status !== 'failed');
    if (prior) { jobId = prior.id; reused = true; return; }
    const now = new Date().toISOString();
    next.jobs.push({ id: jobId, clinic_id: next.clinic.id, visit_id: visitId, kind: 'analysis', status: 'queued', stage: 'clinical_analysis_queued', created_at: now, updated_at: now, input_hash: inputHash, input_version: version, ...(sessionId ? { session_id: sessionId } : {}), result: { task: 'clinical_analysis', patientId: visit.patient_id, transcriptId: latest.id, input_transcript_revision: latest.revision, stale_input: false, reviewed_signals: [] } });
  }, { sessionId });
  return { jobId, reused };
}
export async function dispatchClinicalAnalysis(jobId: string) {
  if (!process.env.VERCEL && process.env.HANI_SYNC_AI === '1') { await runClinicalAnalysis(jobId); return 'local_synchronous' as const; }
  const run = await start(analyzeClinicalWorkflow, [jobId]);
  await updateState(state => { const job = state.jobs.find(item => item.id === jobId)!; job.run_id = run.runId; job.updated_at = new Date().toISOString(); });
  return 'workflow' as const;
}
/** Safe automatic hook. Failure belongs to analysis and cannot fail SOAP/transcription. */
export async function ensureClinicalAnalysis(visitId: string, transcriptId?: string, sessionId?: string): Promise<{ jobId?: string; reused?: boolean; execution?: 'workflow' | 'local_synchronous'; error?: string }> {
  let jobId: string | undefined;
  try {
    const prepared = await prepareClinicalAnalysis(visitId, transcriptId, sessionId); jobId = prepared.jobId;
    if (prepared.reused) return prepared;
    const execution = await dispatchClinicalAnalysis(jobId);
    return { ...prepared, execution };
  } catch (error) {
    if (jobId) await failClinicalAnalysis(jobId, error).catch(() => {});
    return { ...(jobId ? { jobId } : {}), error: error instanceof AppError ? error.message : '진료 분석을 시작하지 못했습니다. 기존 기록은 보존됩니다.' };
  }
}
