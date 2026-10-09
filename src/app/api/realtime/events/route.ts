import { createHash } from 'node:crypto';
import { detectProcedures } from '@/lib/ai/procedure-detector';
import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { updateState } from '@/lib/server/store';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const { visitId, audioSessionId, itemId, ordinal, text } = await readBody(request, 32_000);
    if (typeof text !== 'string' || text.length > 8000 || typeof itemId !== 'string' || itemId.length > 200 || !Number.isInteger(ordinal) || Number(ordinal) < 0) throw new AppError(400, 'INVALID_LIVE_TURN', '확정된 전사 구간을 확인해 주세요.');
    let count = 0;
    await updateState((state) => {
      const audio = state.audioSessions.find((item) => item.id === audioSessionId && item.visit_id === visitId && item.clinic_id === state.clinic.id);
      if (!audio || audio.owner_session_id !== session.id || (audio.status !== 'recording' && Date.now() - Date.parse(audio.stopped_at || '') > 30_000)) throw new AppError(403, 'AUDIO_SESSION_MISMATCH', '이 수음 세션의 전사를 저장할 권한이 없습니다.');
      if (audio.live_item_ids?.includes(itemId)) return;
      (audio.live_item_ids ??= []).push(itemId);
      (audio.live_turns ??= []).push({ item_id: itemId, ordinal: Number(ordinal), text });
      audio.live_text = audio.live_turns.sort((a, b) => a.ordinal - b.ordinal).map((turn) => turn.text).join('\n');
      for (const candidate of detectProcedures(text)) {
        const hash = createHash('sha256').update(`${audio.id}:${itemId}:${candidate.start}:${candidate.keyword}`).digest('hex');
        const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        if (state.live_events.some((item) => item.id === id)) continue;
        state.live_events.push({ id, clinic_id: state.clinic.id, visit_id: audio.visit_id, audio_session_id: audio.id, text: candidate.text, modality: candidate.modality, technique: candidate.technique, context: candidate.context, status: 'suggested', created_at: new Date().toISOString() });
        count++;
      }
    }, { sessionId: session.id });
    return jsonResponse({ saved: true, candidates: count });
  } catch (error) { return errorResponse(error); }
}
