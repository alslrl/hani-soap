import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { AppError, invariant } from './errors';
import { dataDirectory, storageMode } from './config';
import { getSupabase, databaseError } from './supabase';
import { readJson, withFileLock, writeJson } from './file-lock';

export const SESSION_COOKIE = 'hani_demo_session';
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
export type DemoSession = { id: string; token_hash: string; expires_at: string; pin_version: string; created_at: string };
type SecurityStore = { sessions: DemoSession[]; failures: { ip_hash: string; at: number }[]; aiAttempts: { session_id: string; at: number }[] };
const emptySecurity = (): SecurityStore => ({ sessions: [], failures: [], aiAttempts: [] });
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function hashPin(pin: string, salt = randomBytes(16).toString('hex')) {
  invariant(/^\d{4}$/.test(pin), 'PIN은 숫자 4자리입니다.');
  return `scrypt$${salt}$${scryptSync(pin, salt, 32).toString('hex')}`;
}
function pinConfiguration() {
  const encoded = process.env.DEMO_PIN_HASH;
  if (!encoded && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
    throw new AppError(503, 'PIN_NOT_CONFIGURED', '서버의 데모 PIN 설정이 필요합니다.');
  }
  return encoded || hashPin(process.env.DEMO_DEV_PIN || '1234', 'hani-local-development-only');
}
export function verifyPin(pin: unknown) {
  const configured = pinConfiguration();
  const [, salt, expectedHex, extra] = configured.split('$');
  if (!configured.startsWith('scrypt$') || !salt || !/^[a-f0-9]{64}$/i.test(expectedHex || '') || extra !== undefined) {
    throw new AppError(503, 'PIN_NOT_CONFIGURED', '서버 PIN 해시 형식을 확인해 주세요.');
  }
  const candidate = typeof pin === 'string' && /^\d{4}$/.test(pin) ? pin : 'invalid';
  return timingSafeEqual(scryptSync(candidate, salt, 32), Buffer.from(expectedHex, 'hex'));
}
function pinVersion() { return sha256(pinConfiguration()); }
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = new Set<string>();
  if (process.env.APP_ORIGIN) allowed.add(new URL(process.env.APP_ORIGIN).origin);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) allowed.add(new URL(`https://${host}`).origin);
  }
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    // Next.js may normalize request.url to 0.0.0.0 when listening on all interfaces.
    // The original Host remains the address used by the browser; allow loopback only.
    const host = request.headers.get('host') || new URL(request.url).host;
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) allowed.add(`${new URL(request.url).protocol}//${host}`);
  }
  if (!origin || !allowed.has(origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(403, 'ORIGIN_REJECTED', '이 화면에서 시작한 요청만 허용됩니다.');
  }
}

function cookieToken(request: Request) {
  for (const entry of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...value] = entry.trim().split('=');
    if (key === SESSION_COOKIE) return value.join('=');
  }
  return '';
}
async function security<T>(run: (store: SecurityStore) => T | Promise<T>): Promise<T> {
  const file = path.join(dataDirectory(), 'security.json');
  return withFileLock(file, async () => {
    const data = await readJson<SecurityStore>(file) || emptySecurity();
    const result = await run(data);
    await writeJson(file, data);
    return result;
  });
}
export async function unlock(request: Request, pin: unknown) {
  assertSameOrigin(request);
  const valid = verifyPin(pin);
  // The hash is sufficient for the shared attempt key; raw client IP is not stored.
  const ip = process.env.VERCEL ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'local';
  const ipHash = sha256(ip || 'unknown');
  let allowed: boolean;
  if (storageMode() === 'supabase') {
    const { data, error } = await getSupabase().rpc('hani_check_access_attempt', { p_ip_hash: ipHash, p_success: valid });
    if (error) databaseError(error);
    allowed = data === true;
  } else {
    allowed = await security((data) => {
      const now = Date.now();
      data.failures = data.failures.filter((v) => now - v.at < 60 * 60 * 1000);
      if (data.failures.length >= 50 || data.failures.filter((v) => v.ip_hash === ipHash && now - v.at < 15 * 60 * 1000).length >= 5) return false;
      if (!valid) data.failures.push({ ip_hash: ipHash, at: now });
      return true;
    });
  }
  if (!allowed) throw new AppError(429, 'PIN_RATE_LIMIT', '입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.');
  if (!valid) throw new AppError(401, 'PIN_INVALID', 'PIN이 일치하지 않습니다.');
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const session: DemoSession = { id: randomUUID(), token_hash: sha256(token), pin_version: pinVersion(), expires_at: new Date(now + SESSION_LIFETIME).toISOString(), created_at: new Date(now).toISOString() };
  if (storageMode() === 'supabase') {
    const { error } = await getSupabase().from('demo_sessions').insert(session);
    if (error) databaseError(error);
  } else {
    await security((data) => { data.sessions = data.sessions.filter((v) => Date.parse(v.expires_at) > now); data.sessions.push(session); });
  }
  return { token, session };
}
export async function requireSession(request: Request): Promise<DemoSession> {
  const token = cookieToken(request);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(401, 'AUTH_REQUIRED', 'PIN을 입력해 주세요.');
  const hash = sha256(token);
  let session: DemoSession | undefined;
  if (storageMode() === 'supabase') {
    const { data, error } = await getSupabase().from('demo_sessions').select('*').eq('token_hash', hash).maybeSingle();
    if (error) databaseError(error);
    session = data as DemoSession | undefined;
  } else {
    const data = await readJson<SecurityStore>(path.join(dataDirectory(), 'security.json'));
    session = data?.sessions.find((v) => v.token_hash === hash);
  }
  if (!session || Date.parse(session.expires_at) <= Date.now() || session.pin_version !== pinVersion()) {
    throw new AppError(401, 'AUTH_REQUIRED', '세션이 만료되었습니다. PIN을 다시 입력해 주세요.');
  }
  return session;
}
export async function revokeSession(request: Request) {
  assertSameOrigin(request);
  const token = cookieToken(request);
  if (!token) return;
  const hash = sha256(token);
  if (storageMode() === 'supabase') {
    const { error } = await getSupabase().from('demo_sessions').delete().eq('token_hash', hash);
    if (error) databaseError(error);
  } else { await security((data) => { data.sessions = data.sessions.filter((v) => v.token_hash !== hash); }); }
}
export function sessionCookie(token: string, clear = false) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_LIFETIME / 1000}${secure ? '; Secure' : ''}`;
}
export async function assertAiCapacity(sessionId: string) {
  let allowed: boolean;
  if (storageMode() === 'supabase') {
    const { data, error } = await getSupabase().rpc('hani_check_ai_rate', { p_session_id: sessionId });
    if (error) databaseError(error);
    allowed = data === true;
  } else {
    allowed = await security((data) => {
      const now = Date.now();
      data.aiAttempts = data.aiAttempts.filter((v) => now - v.at < 60_000);
      if (data.aiAttempts.filter((v) => v.session_id === sessionId).length >= 5) return false;
      data.aiAttempts.push({ session_id: sessionId, at: now });
      return true;
    });
  }
  if (!allowed) throw new AppError(429, 'AI_RATE_LIMIT', '작업 요청이 많습니다. 1분 뒤 다시 시도해 주세요.');
}
