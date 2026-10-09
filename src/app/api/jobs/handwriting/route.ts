import { createHash, randomUUID } from 'node:crypto';
import { requireSession, assertSameOrigin, assertAiCapacity } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { readState, updateState } from '@/lib/server/store';
import { AI_MODELS, getApiKey, AiConfigurationError } from '@/lib/ai/config';
import { extractHandwriting } from '@/lib/ai/provider';
import { failJob } from '@/lib/ai/pipeline';

export const maxDuration = 180;
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let id: string | undefined;
  try {
    const session = await requireSession(request); assertSameOrigin(request); getApiKey();
    const { annotationId, revision, image } = await readBody(request, 2_800_000);
    if (typeof image !== 'string' || !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(image) || image.length > 2_700_000) throw new AppError(400, 'INVALID_MEMO_IMAGE', '2MB 이하의 메모 전용 이미지를 보내 주세요.');
    const { state, version } = await readState();
    const annotation = state.annotations.find((item) => item.id === annotationId && item.clinic_id === state.clinic.id);
    if (!annotation || annotation.revision !== revision) throw new AppError(409, 'ANNOTATION_VERSION_CONFLICT', '최신 메모를 저장한 뒤 다시 요청해 주세요.');
    await assertAiCapacity(session.id);
    id = randomUUID();
    const inputHash = createHash('sha256').update(`${annotationId}:${revision}:${image}`).digest('hex');
    await updateState((next) => {
      next.jobs.push({ id: id!, clinic_id: next.clinic.id, visit_id: annotation.visit_id, kind: 'handwriting', status: 'running', stage: 'handwriting', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), input_hash: inputHash, input_version: version, session_id: session.id, result: { annotationId, revision, mode: 'actual_ai', model: AI_MODELS.soap } });
    });
    const result = await extractHandwriting(image);
    let stale = false;
    await updateState((next) => {
      const current = next.annotations.find((item) => item.id === annotationId)!;
      stale = current.revision !== revision;
      if (!stale) { current.extracted_text = result.text; current.extraction_reviewed = false; }
      const job = next.jobs.find((item) => item.id === id)!;
      job.result = { ...job.result, ...result, stale_input: stale };
      job.status = 'waiting_review'; job.stage = stale ? 'stale_input' : 'review_needed'; job.updated_at = new Date().toISOString();
    });
    return jsonResponse({ jobId: id, ...result, stale, annotationId, revision });
  } catch (error) {
    if (id) await failJob(id, error).catch(() => {});
    return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error);
  }
}
