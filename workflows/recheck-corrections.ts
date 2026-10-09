import { correctionStep, failJob, patchJob } from '@/lib/ai/pipeline';

async function recheck(jobId: string) {
  'use step';
  await correctionStep(jobId);
  await patchJob(jobId, { status: 'waiting_review', stage: 'correction_review_needed' });
}
async function failed(jobId: string) {
  'use step';
  await failJob(jobId, new Error('Terminology recheck failed'));
}
/** Reuses a stored transcript; never transcribes audio or replaces an existing SOAP. */
export async function recheckCorrectionsWorkflow(jobId: string) {
  'use workflow';
  try { await recheck(jobId); }
  catch (error) { await failed(jobId); throw error; }
}
