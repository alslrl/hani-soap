import { FatalError } from 'workflow';
import { runClinicalAnalysis, failClinicalAnalysis } from '@/lib/ai/clinical-analysis-runner';
async function analyze(jobId: string) { 'use step'; await runClinicalAnalysis(jobId); }
async function failed(jobId: string) { 'use step'; await failClinicalAnalysis(jobId, new Error('ANALYSIS_FAILED')); }
/** Patient text remains in steps; only the opaque job ID crosses the workflow. */
export async function analyzeClinicalWorkflow(jobId: string) {
  'use workflow';
  try { await analyze(jobId); }
  catch { await failed(jobId); throw new FatalError('진료 분석을 완료하지 못했습니다. 기존 기록은 보존됩니다.'); }
}
