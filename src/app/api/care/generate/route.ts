import { start } from 'workflow/api';
import { generateCareWorkflow } from '../../../../../workflows/care';
import { prepareClinicalTextJob, generateCareStep, patchClinicalTextJob, failClinicalTextJob } from '@/lib/ai/care-generation';
import { AiConfigurationError } from '@/lib/ai/config';
import { AppError } from '@/lib/server/errors';
import { errorResponse, jsonResponse } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    const prepared = await prepareClinicalTextJob(request, 'care');
    jobId = prepared.jobId;
    if (prepared.reused) return jsonResponse({ jobId, reused: true });
    if (!process.env.VERCEL && process.env.HANI_SYNC_AI === '1') {
      const messageId = await generateCareStep(jobId);
      return jsonResponse({ jobId, messageId, execution: 'local_synchronous' }, 201);
    }
    const run = await start(generateCareWorkflow, [jobId]);
    await patchClinicalTextJob(jobId, { run_id: run.runId });
    return jsonResponse({ jobId, runId: run.runId, execution: 'workflow' }, 202);
  } catch (error) {
    if (jobId) await failClinicalTextJob(jobId, error).catch(() => {});
    return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error);
  }
}
