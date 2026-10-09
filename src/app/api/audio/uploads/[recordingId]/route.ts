import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { errorResponse, jsonResponse } from '@/lib/server/http';
import { readState } from '@/lib/server/store';
import { storageMode } from '@/lib/server/config';
import { hashToken, saveLocalAudio } from '@/lib/audio/storage';

export const runtime = 'nodejs';
export async function PUT(request: Request, context: { params: Promise<{ recordingId: string }> }) {
  try {
    await requireSession(request);
    assertSameOrigin(request);
    if (storageMode() !== 'local') throw new AppError(400, 'DIRECT_UPLOAD_REQUIRED', '발급받은 비공개 저장소 주소로 업로드해 주세요.');
    const { recordingId } = await context.params;
    const { state } = await readState();
    const recording = state.recordings.find((item) => item.id === recordingId && item.clinic_id === state.clinic.id);
    const token = new URL(request.url).searchParams.get('token');
    if (!recording || !token || hashToken(token) !== recording.upload_token_hash || Date.parse(recording.upload_expires_at || '') < Date.now()) throw new AppError(403, 'UPLOAD_EXPIRED', '파일 업로드 권한이 만료되었습니다. 다시 등록해 주세요.');
    if (recording.status !== 'uploading') throw new AppError(409, 'UPLOAD_FINISHED', '이미 업로드를 완료한 파일입니다.');
    await saveLocalAudio(recording, request);
    return jsonResponse({ uploaded: true });
  } catch (error) { return errorResponse(error); }
}
