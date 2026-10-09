import { AI_MODELS, getApiKey, AiConfigurationError } from '@/lib/ai/config';
import { requireSession, assertSameOrigin, assertAiCapacity } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { readState } from '@/lib/server/store';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const { visitId, audioSessionId, sdp } = await readBody(request, 100_000);
    if (typeof sdp !== 'string' || !sdp.startsWith('v=0')) throw new AppError(400, 'INVALID_SDP', '실시간 연결 정보를 확인해 주세요.');
    const { state } = await readState();
    const audio = state.audioSessions.find((item) => item.id === audioSessionId && item.visit_id === visitId && item.clinic_id === state.clinic.id);
    if (!audio || audio.owner_session_id !== session.id || audio.status !== 'recording') throw new AppError(403, 'AUDIO_SESSION_MISMATCH', '수음 중인 PC만 실시간 전사를 시작할 수 있습니다.');
    await assertAiCapacity(session.id);
    // Dedicated transcription credentials bind type/model. The main API key never leaves this route.
    const tokenResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { Authorization: `Bearer ${getApiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 600 }, session: { type: 'transcription', audio: { input: { transcription: { model: AI_MODELS.live, languages: ['ko'], keywords: ['침', '도침', '약침', '뜸', '부항', '추나'], delay: 'low' }, turn_detection: null } } } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) throw new AppError(503, 'LIVE_SESSION_REJECTED', `실시간 모델 ${AI_MODELS.live} 세션을 생성하지 못했습니다 (HTTP ${tokenResponse.status}). 전체 녹음은 계속됩니다.`);
    const token = await tokenResponse.json() as { value?: string };
    if (!token.value) throw new AppError(503, 'LIVE_SESSION_REJECTED', '실시간 세션 자격을 받지 못했습니다.');
    const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' }, body: sdp, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new AppError(503, 'LIVE_CONNECTION_REJECTED', `실시간 음성 연결을 완료하지 못했습니다 (HTTP ${response.status}). 전체 녹음은 계속됩니다.`);
    return jsonResponse({ sdp: await response.text(), model: AI_MODELS.live });
  } catch (error) { return errorResponse(error instanceof AiConfigurationError ? new AppError(503, error.code, error.message) : error); }
}
