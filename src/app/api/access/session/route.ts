import { requireSession } from '@/lib/server/auth';
import { errorResponse, jsonResponse } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const session = await requireSession(request); return jsonResponse({ authenticated: true, expires_at: session.expires_at }); }
  catch (error) { return errorResponse(error); }
}
