import { FatalError, RetryableError } from 'workflow';
import { transcribeStep, correctionStep, soapStep, failJob } from '@/lib/ai/pipeline';
import { AppError } from '@/lib/server/errors';

async function transcribe(jobId: string) {
  'use step';
  try { await transcribeStep(jobId); }
  catch (error) {
    if (error instanceof AppError && error.code === 'TRANSCRIPTION_RETRYABLE') throw new RetryableError('전사 서비스 일시 오류', { retryAfter: '10s' });
    throw new FatalError(error instanceof AppError ? error.message : '음성 전사를 완료하지 못했습니다.');
  }
}
async function correct(jobId: string) {
  'use step';
  await correctionStep(jobId);
}
async function draftSoap(jobId: string) {
  'use step';
  await soapStep(jobId);
}
async function failed(jobId: string, message: string) {
  'use step';
  await failJob(jobId, new Error(message));
}
/** Only opaque job IDs cross the orchestration boundary. */
export async function processAudioWorkflow(jobId: string) {
  'use workflow';
  try {
    await transcribe(jobId);
    await correct(jobId);
    await draftSoap(jobId);
  } catch (error) {
    await failed(jobId, error instanceof Error ? error.message : 'AI 처리 실패');
    throw error;
  }
}
