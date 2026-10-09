import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { getApiKey, AiConfigurationError } from '@/lib/ai/config';
import { runSavedHandwritingExtraction } from '@/lib/ai/handwriting';

export const maxDuration = 180;
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request); assertSameOrigin(request); getApiKey();
    const { annotationId, revision, image } = await readBody(request, 2_800_000);
    if (typeof annotationId !== 'string' || !Number.isInteger(revision) || Number(revision) < 1 || typeof image !== 'string' || !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(image) || image.length > 2_700_000) throw new AppError(400, 'INVALID_MEMO_IMAGE', '저장된 필기와 2MB 이하의 메모 전용 이미지를 보내 주세요.');
    const result=await runSavedHandwritingExtraction({annotationId,revision:revision as number,image,sessionId:session.id});
    return jsonResponse(result,result.pending?202:200);
  } catch (error) {
    return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error);
  }
}
