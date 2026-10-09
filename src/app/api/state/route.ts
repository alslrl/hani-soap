import { requireSession } from '@/lib/server/auth';
import { readState, publicEnvelope } from '@/lib/server/store';
import { errorResponse, jsonResponse } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { await requireSession(request); return jsonResponse(publicEnvelope(await readState())); }
  catch (error) { return errorResponse(error); }
}
