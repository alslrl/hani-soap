import { AppError } from './errors';

export const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
export function jsonResponse(value: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(noStoreHeaders);
  if (extraHeaders) new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return Response.json(value, { status, headers });
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError) return jsonResponse({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) }, error.status);
  console.error('[hani request]', error instanceof Error ? error.name : 'unknown');
  return jsonResponse({ error: '요청을 처리하지 못했습니다. 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
}
export async function readBody(request: Request, limit = 1_500_000): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 크기를 줄여 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'INVALID_JSON', '요청 내용을 확인해 주세요.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 크기를 줄여 주세요.'); }
    chunks.push(value);
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new AppError(400, 'INVALID_JSON', 'JSON 요청 형식을 확인해 주세요.'); }
}
