import { assertSameOrigin } from '@/lib/server/auth';
import { responseReceipt, submitKakaoResponse } from '@/lib/server/kakao';
import { errorResponse, jsonResponse, readBody } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try { const { body, options } = await responseReceipt((await context.params).token); return jsonResponse({ body, options }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request); const input = await readBody(request, 1024);
    return jsonResponse(await submitKakaoResponse((await context.params).token, input.option, input.detail));
  } catch (error) { return errorResponse(error); }
}
