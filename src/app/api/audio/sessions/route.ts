import { randomUUID } from 'node:crypto';
import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { updateState } from '@/lib/server/store';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const { visitId, action, audioSessionId } = await readBody(request, 8000);
    if (typeof visitId !== 'string') throw new AppError(400, 'VISIT_REQUIRED', '방문을 선택해 주세요.');
    let id = typeof audioSessionId === 'string' ? audioSessionId : randomUUID();
    await updateState((state) => {
      const visit = state.visits.find((item) => item.id === visitId && item.clinic_id === state.clinic.id);
      if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
      if (action === 'stop') {
        const audio = state.audioSessions.find((item) => item.id === audioSessionId && item.visit_id === visitId);
        if (!audio || audio.owner_session_id !== session.id) throw new AppError(403, 'AUDIO_SESSION_MISMATCH', '이 수음 세션을 종료할 권한이 없습니다.');
        audio.status = 'stopped'; audio.stopped_at = new Date().toISOString(); id = audio.id;
      } else {
        const existing = state.audioSessions.find((item) => item.visit_id === visitId && item.status === 'recording' && Date.now() - Date.parse(item.started_at) < 8 * 3600_000);
        if (existing) throw new AppError(409, 'RECORDING_ALREADY_ACTIVE', '이 방문에서 이미 PC 녹음이 진행 중입니다.');
        state.audioSessions.push({ id, clinic_id: state.clinic.id, visit_id: visitId, status: 'recording', started_at: new Date().toISOString(), owner_session_id: session.id, live_text: '', live_item_ids: [], live_turns: [] });
        if (visit.workflow_status === 'waiting') { visit.workflow_status = 'in_progress'; visit.started_at = new Date().toISOString(); }
      }
    }, { sessionId: session.id });
    return jsonResponse({ audioSessionId: id, status: action === 'stop' ? 'stopped' : 'recording' });
  } catch (error) { return errorResponse(error); }
}
