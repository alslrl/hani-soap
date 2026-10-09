import { unlock, sessionCookie } from '@/lib/server/auth';
import { errorResponse, jsonResponse, readBody } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { const { pin } = await readBody(request, 1024); const { token, session } = await unlock(request, pin); return jsonResponse({ ok: true, expires_at: session.expires_at }, 200, { 'Set-Cookie': sessionCookie(token) }); }
  catch (error) { return errorResponse(error); }
}
