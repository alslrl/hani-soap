import { requireSession } from '@/lib/server/auth';
import { readState, readStateIfChanged, publicEnvelope } from '@/lib/server/store';
import { errorResponse, jsonResponse, noStoreHeaders } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireSession(request);
    // Vercel may weaken the response ETag when applying compression.
    const match = /^(?:W\/)?"state-(\d+)"$/.exec(request.headers.get('if-none-match') || '');
    const knownVersion = match ? Number(match[1]) : undefined;
    const value = knownVersion !== undefined && Number.isSafeInteger(knownVersion)
      ? await readStateIfChanged(knownVersion) : await readState();
    if (!value) return new Response(null, { status: 304, headers: { ...noStoreHeaders, ETag: request.headers.get('if-none-match')! } });
    return jsonResponse(publicEnvelope(value), 200, { ETag: '"state-' + value.version + '"' });
  } catch (error) { return errorResponse(error); }
}
