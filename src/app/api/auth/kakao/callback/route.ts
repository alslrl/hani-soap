import { clearKakaoCookie, finishKakaoConnection } from '@/lib/server/kakao';
import { noStoreHeaders } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let result = 'connected';
  try { await finishKakaoConnection(request); }
  catch (error) { result = error instanceof AppError ? error.code : 'KAKAO_CONNECT_FAILED'; }
  const next = `/settings?kakao=${encodeURIComponent(result)}`;
  // A same-origin navigation from this document restores the Strict PIN cookie.
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>카카오 연결</title><p>카카오 연결 결과를 확인합니다.</p><a href="${next}">설정으로 돌아가기</a><script>location.replace(${JSON.stringify(next)})</script></html>`, {
    headers: { ...noStoreHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearKakaoCookie(), 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
  });
}
