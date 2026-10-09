import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from './errors';

export function kakaoConfiguration() {
  const clientId = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  const key = process.env.KAKAO_TOKEN_ENCRYPTION_KEY;
  const origin = process.env.APP_ORIGIN;
  if (!clientId || !clientSecret || !key || !/^[a-f0-9]{64}$/i.test(key) || !origin) {
    throw new AppError(503, 'KAKAO_NOT_CONFIGURED', '카카오 서버 설정이 필요합니다.');
  }
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new AppError(503, 'KAKAO_NOT_CONFIGURED', '카카오 배포 주소를 확인해 주세요.');
  return { clientId, clientSecret, key: Buffer.from(key, 'hex'), origin: url.origin, redirectUri: `${url.origin}/api/auth/kakao/callback` };
}
export function encryptKakaoTokens(tokens: { access_token: string; refresh_token: string }) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kakaoConfiguration().key, nonce);
  cipher.setAAD(Buffer.from('hani-kakao-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decryptKakaoTokens(value: string): { access_token: string; refresh_token: string } {
  try {
    const data = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', kakaoConfiguration().key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from('hani-kakao-v1')); cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
  } catch { throw new AppError(503, 'KAKAO_TOKEN_INVALID', '카카오에 다시 연결해 주세요.'); }
}
export class KakaoProviderError extends Error {
  constructor(public uncertain: boolean, public providerCode: number | null = null) { super('Kakao request failed'); }
}
export async function kakaoRequest(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new KakaoProviderError(response.status >= 500, typeof body?.code === 'number' ? body.code : null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new KakaoProviderError(true);
    return body;
  } catch (error) {
    if (error instanceof KakaoProviderError) throw error;
    throw new KakaoProviderError(true);
  }
}
export async function tokenRequest(values: Record<string, string>) {
  const config = kakaoConfiguration();
  const data = await kakaoRequest('https://kauth.kakao.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }),
  });
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || data.expires_in <= 0) throw new KakaoProviderError(true);
  return data as { access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number; scope?: string };
}
