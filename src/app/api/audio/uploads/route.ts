import { randomBytes, randomUUID } from 'node:crypto';
import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, jsonResponse, errorResponse } from '@/lib/server/http';
import { updateState } from '@/lib/server/store';
import { hashToken, uploadCapability, validateAudioFile } from '@/lib/audio/storage';
import type { RuntimeRecording } from '@/lib/types';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const body = await readBody(request, 12_000);
    const { visitId, filename, mimeType, sizeBytes, audioSessionId, durationMs } = body;
    if (typeof visitId !== 'string' || typeof filename !== 'string' || typeof mimeType !== 'string' || typeof sizeBytes !== 'number') throw new AppError(400, 'INVALID_UPLOAD', '방문과 파일 정보를 확인해 주세요.');
    validateAudioFile(filename, mimeType, sizeBytes);
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    let recording!: RuntimeRecording;
    await updateState((state) => {
      const visit = state.visits.find((item) => item.id === visitId && item.clinic_id === state.clinic.id);
      if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
      if (audioSessionId) {
        const audio = state.audioSessions.find((item) => item.id === audioSessionId && item.visit_id === visitId);
        if (!audio || audio.owner_session_id !== session.id) throw new AppError(403, 'AUDIO_SESSION_MISMATCH', '이 수음 세션의 파일을 저장할 권한이 없습니다.');
      }
      recording = { id, clinic_id: state.clinic.id, visit_id: visitId, audio_session_id: typeof audioSessionId === 'string' ? audioSessionId : null, source: audioSessionId ? 'microphone' : 'upload', filename: filename.slice(0, 200), mime_type: mimeType, size_bytes: sizeBytes, object_path: `${state.clinic.id}/${visitId}/${id}`, created_at: new Date().toISOString(), status: 'uploading', duration_ms: typeof durationMs === 'number' ? Math.max(0, durationMs) : null, upload_token_hash: hashToken(token), upload_expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
      state.recordings.push(recording);
    }, { sessionId: session.id });
    const capability = await uploadCapability(recording, token);
    return jsonResponse({ recordingId: id, ...capability }, 201);
  } catch (error) { return errorResponse(error); }
}
