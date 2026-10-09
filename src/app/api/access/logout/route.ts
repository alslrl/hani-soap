import { revokeSession, sessionCookie } from '@/lib/server/auth';
import { errorResponse, jsonResponse } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { await revokeSession(request); return jsonResponse({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', true) }); }
  catch (error) { return errorResponse(error); }
}
