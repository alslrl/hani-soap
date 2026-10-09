import { assertSameOrigin, requireSession } from '@/lib/server/auth';
import { beginKakaoConnection } from '@/lib/server/kakao';
import { errorResponse, jsonResponse } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const session = await requireSession(request);
    const started = await beginKakaoConnection(session.id);
    return jsonResponse({ url: started.url }, 200, { 'Set-Cookie': started.cookie });
  } catch (error) { return errorResponse(error); }
}
