import { requireSession } from '@/lib/server/auth';
import { jsonResponse, errorResponse } from '@/lib/server/http';
import { aiConfiguration } from '@/lib/ai/config';
export async function GET(request: Request) {
  try { await requireSession(request); return jsonResponse(aiConfiguration()); }
  catch (error) { return errorResponse(error); }
}
