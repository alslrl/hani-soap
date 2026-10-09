import { assertSameOrigin, requireSession } from '@/lib/server/auth';
import { sendKakaoSelf } from '@/lib/server/kakao';
import { errorResponse, jsonResponse, readBody } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    assertSameOrigin(request); await requireSession(request);
    const { messageId } = await context.params; const body = await readBody(request, 120_000);
    return jsonResponse(await sendKakaoSelf(messageId, body.approvedBody, body.retry === true));
  } catch (error) { return errorResponse(error); }
}
