import { assertSameOrigin, requireSession } from '@/lib/server/auth';
import { kakaoStatus, disconnectKakao } from '@/lib/server/kakao';
import { errorResponse, jsonResponse } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { await requireSession(request); return jsonResponse(await kakaoStatus()); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); await requireSession(request); await disconnectKakao(); return jsonResponse({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
