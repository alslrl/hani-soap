import { FatalError, RetryableError } from 'workflow';
import { transcribeStep, correctionStep, soapStep, failJob } from '@/lib/ai/pipeline';
import { encodeAudioFailure } from '@/lib/audio/processing-error';
import { AppError } from '@/lib/server/errors';

async function transcribe(jobId: string) {
  'use step';
  try { await transcribeStep(jobId); }
  catch (error) {
    if (error instanceof AppError && error.code === 'TRANSCRIPTION_RETRYABLE') throw new RetryableError(encodeAudioFailure(error,'transcribing'), { retryAfter: '10s' });
    throw new FatalError(encodeAudioFailure(error,'transcribing'));
  }
}
async function correct(jobId: string) {
  'use step';
  try { await correctionStep(jobId); } catch(error) { throw new Error(encodeAudioFailure(error,'dictionary_correction')); }
}
async function draftSoap(jobId: string) {
  'use step';
  try { await soapStep(jobId); } catch(error) { throw new Error(encodeAudioFailure(error,'soap_draft')); }
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
