import { FatalError } from 'workflow';
import { generateCareStep, generateBriefingStep, failClinicalTextJob } from '@/lib/ai/care-generation';
import { AppError } from '@/lib/server/errors';

async function draftCare(jobId: string) {
  'use step';
  try { return await generateCareStep(jobId); }
  catch (error) { throw new FatalError(error instanceof AppError ? error.message : 'AI 안내 초안을 만들지 못했습니다.'); }
}
async function draftBriefing(jobId: string) {
  'use step';
  try { return await generateBriefingStep(jobId); }
  catch (error) { throw new FatalError(error instanceof AppError ? error.message : '과거 승인 기록 요약을 만들지 못했습니다.'); }
}
async function failed(jobId: string, message: string) {
  'use step';
  await failClinicalTextJob(jobId, new AppError(502, 'AI_GENERATION_FAILED', message));
}
/** Only the opaque job ID crosses the durable orchestration boundary. */
export async function generateCareWorkflow(jobId: string) {
  'use workflow';
  try { return await draftCare(jobId); }
  catch (error) { await failed(jobId, error instanceof Error ? error.message : '안내 생성 실패'); throw error; }
}
export async function generateBriefingWorkflow(jobId: string) {
  'use workflow';
  try { return await draftBriefing(jobId); }
  catch (error) { await failed(jobId, error instanceof Error ? error.message : '과거 요약 실패'); throw error; }
}
