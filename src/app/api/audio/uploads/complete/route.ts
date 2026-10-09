import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { readState, updateState } from '@/lib/server/store';
import { readAudio } from '@/lib/audio/storage';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const { recordingId } = await readBody(request, 4000);
    const { state } = await readState();
    const recording = state.recordings.find((item) => item.id === recordingId && item.clinic_id === state.clinic.id);
    if (!recording) throw new AppError(404, 'RECORDING_NOT_FOUND', '음성 파일을 찾을 수 없습니다.');
    await readAudio(recording);
    await updateState((next) => {
      const current = next.recordings.find((item) => item.id === recording.id)!;
      if (current.status === 'uploading') current.status = 'uploaded';
      delete current.upload_token_hash;
      delete current.upload_expires_at;
    }, { sessionId: session.id });
    return jsonResponse({ recordingId, status: 'uploaded' });
  } catch (error) { return errorResponse(error); }
}
