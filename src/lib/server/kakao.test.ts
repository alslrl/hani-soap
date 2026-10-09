import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { beginKakaoConnection, finishKakaoConnection, kakaoStatus, sendKakaoSelf, responseReceipt, submitKakaoResponse, KAKAO_OAUTH_COOKIE } from './kakao';
import { changeKakaoPrivate, readKakaoPrivate } from './kakao-store';
import { encryptKakaoTokens, decryptKakaoTokens } from './kakao-provider';
import { readState, mutateState, publicEnvelope } from './store';
import { unlock, revokeSession, SESSION_COOKIE } from './auth';
import { kakaoPreview } from '../kakao';
import { AppError } from './errors';
import { POST as connectRoute } from '../../app/api/integrations/kakao/connect/route';
import { POST as sendRoute } from '../../app/api/care-messages/[messageId]/send-self/route';

let previous: NodeJS.ProcessEnv, originalFetch: typeof fetch, directory: string;
let sends: Record<string, unknown>[];
let sendFailure: 'none' | 'reject' | 'timeout' | 'malformed';
let refreshes: number;
beforeEach(async () => {
  previous = { ...process.env }; originalFetch = globalThis.fetch;
  directory = await mkdtemp(path.join(os.tmpdir(), 'hani-kakao-test-'));
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL', 'DEMO_PIN_HASH']) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: 'test', HANI_STORAGE_MODE: 'local', HANI_DATA_DIR: directory, APP_ORIGIN: 'http://localhost:3000', KAKAO_CLIENT_ID: 'test-client', KAKAO_CLIENT_SECRET: 'test-secret', KAKAO_TOKEN_ENCRYPTION_KEY: '12'.repeat(32), KAKAO_APP_ID: '1602111' });
  sends = []; sendFailure = 'none'; refreshes = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/oauth/token')) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('grant_type') === 'refresh_token') { refreshes++; return Response.json({ access_token: 'fresh-access', expires_in: 3600 }); }
      return Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600, refresh_token_expires_in: 86400 });
    }
    if (url.endsWith('/access_token_info')) return Response.json({ id: 10234567, app_id: 1602111 });
    if (url.endsWith('/user/scopes')) return Response.json({ scopes: [{ id: 'talk_message', agreed: true }] });
    assert.equal(url, 'https://kapi.kakao.com/v2/api/talk/memo/default/send');
    sends.push(JSON.parse(new URLSearchParams(String(init?.body)).get('template_object')!));
    if (sendFailure === 'timeout') throw new Error('network lost after submission');
    if (sendFailure === 'reject') return Response.json({ code: -402, msg: 'do not expose provider text' }, { status: 403 });
    if (sendFailure === 'malformed') return Response.json({ unexpected: true });
    await new Promise((resolve) => setTimeout(resolve, 15));
    return Response.json({ result_code: 0 });
  };
});
afterEach(async () => { process.env = previous; globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); });
const req = (cookie = '') => new Request('http://localhost:3000/api/access/unlock', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie } });
const hasCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
async function connected() {
  const session = await unlock(req(), '1234');
  const start = await beginKakaoConnection(session.session.id);
  const state = new URL(start.url).searchParams.get('state')!;
  const callback = new Request(`http://localhost:3000/api/auth/kakao/callback?code=one-use&state=${state}`, { headers: { cookie: `${KAKAO_OAUTH_COOKIE}=${state}` } });
  await finishKakaoConnection(callback);
  return { session, callback };
}
async function message(body = '가상 환자 안내: 확인한 생활 관리 계획입니다.') {
  const initial = await readState(); const visitId = initial.state.visits[0].id;
  const draft = await mutateState({ type: 'care.save', payload: { visitId, draft_body: body, stage: 'visit_summary' } });
  const current = draft.state.care_messages.at(-1)!;
  await mutateState({ type: 'care.approve', payload: { messageId: current.id } });
  return { id: current.id, body };
}
const tokenFromSend = () => new URL((sends[0].link as { web_url: string }).web_url).pathname.split('/').at(-1)!;

test('OAuth uses a bound, expiring, single-use state without weakening the PIN cookie', async () => {
  const { callback } = await connected();
  assert.equal((await kakaoStatus()).connected, true);
  assert.equal((await kakaoStatus()).accountLabel, '본인 계정 · …4567');
  await assert.rejects(finishKakaoConnection(callback), hasCode('KAKAO_STATE_INVALID'));
  const data = await readFile(path.join(directory, 'kakao-private.json'), 'utf8');
  assert.ok(!data.includes('private-access') && !data.includes('private-refresh'));
  assert.ok(!JSON.stringify(publicEnvelope(await readState())).includes('private-access'));
});
test('state mismatch and expired or revoked PIN sessions cannot attach a Kakao account', async () => {
  const session = await unlock(req(), '1234'); const started = await beginKakaoConnection(session.session.id);
  const state = new URL(started.url).searchParams.get('state')!;
  await assert.rejects(finishKakaoConnection(new Request(`http://localhost:3000/api/auth/kakao/callback?code=x&state=${state}`, { headers: { cookie: `${KAKAO_OAUTH_COOKIE}=${'a'.repeat(43)}` } })), hasCode('KAKAO_STATE_INVALID'));
  await revokeSession(req(`${SESSION_COOKIE}=${session.token}`));
  await assert.rejects(finishKakaoConnection(new Request(`http://localhost:3000/api/auth/kakao/callback?code=x&state=${state}`, { headers: { cookie: `${KAKAO_OAUTH_COOKIE}=${state}` } })), hasCode('AUTH_REQUIRED'));
  assert.equal((await kakaoStatus()).connected, false);
});
test('AES-GCM rejects tampered ciphertext and previews obey the 200-character limit', () => {
  const encrypted = encryptKakaoTokens({ access_token: 'test', refresh_token: 'refresh' });
  assert.equal(decryptKakaoTokens(encrypted).access_token, 'test');
  const data = Buffer.from(encrypted, 'base64url'); data[30] ^= 1;
  assert.throws(() => decryptKakaoTokens(data.toString('base64url')), hasCode('KAKAO_TOKEN_INVALID'));
  assert.ok([...kakaoPreview('가나다🙂'.repeat(200))].length <= 200);
});
test('only the exact approved text can be sent, and concurrent requests cause one provider call', async () => {
  await connected(); const approved = await message();
  await assert.rejects(sendKakaoSelf(approved.id, 'different'), hasCode('CARE_APPROVAL_CHANGED'));
  const result = await Promise.all([sendKakaoSelf(approved.id, approved.body), sendKakaoSelf(approved.id, approved.body)]);
  assert.equal(sends.length, 1); assert.ok(result.some((v) => v.status === 'sent'));
  await sendKakaoSelf(approved.id, approved.body);
  assert.equal(sends.length, 1);
  const saved = (await readState()).state.care_messages.find((v) => v.id === approved.id)!;
  assert.equal(saved.delivery_mode, 'kakao_self'); assert.equal(saved.status, 'sent'); assert.equal(saved.approved_body, approved.body);
});
test('timeout or malformed success stays unknown, and even explicit retries cannot duplicate it', async () => {
  await connected(); const approved = await message(); sendFailure = 'timeout';
  assert.equal((await sendKakaoSelf(approved.id, approved.body)).status, 'unknown');
  await sendKakaoSelf(approved.id, approved.body, true); assert.equal(sends.length, 1);
  sendFailure = 'malformed'; const second = await message('second');
  assert.equal((await sendKakaoSelf(second.id, second.body)).status, 'unknown');
  assert.equal((await readState()).state.care_messages.find((v) => v.id === second.id)?.delivered_at, null);
});
test('a definite rejection can be explicitly retried; refresh retains the existing refresh token', async () => {
  await connected(); const approved = await message(); sendFailure = 'reject';
  assert.equal((await sendKakaoSelf(approved.id, approved.body)).status, 'failed');
  await sendKakaoSelf(approved.id, approved.body); assert.equal(sends.length, 1);
  await changeKakaoPrivate((state) => { state.connection!.expires_at = Date.now() - 1; });
  sendFailure = 'none'; assert.equal((await sendKakaoSelf(approved.id, approved.body, true)).status, 'sent');
  assert.equal(refreshes, 1);
  assert.equal(decryptKakaoTokens((await readKakaoPrivate()).connection!.tokens).refresh_token, 'private-refresh');
});
test('GET previews never record a response; POST is bounded and idempotent and creates one contact', async () => {
  await connected(); const approved = await message(); await sendKakaoSelf(approved.id, approved.body);
  const token = tokenFromSend(); const before = await readState();
  assert.equal((await responseReceipt(token)).body, approved.body);
  assert.equal((await readState()).version, before.version);
  await assert.rejects(submitKakaoResponse(token, 'will_book', null), hasCode('INVALID_INPUT'));
  await submitKakaoResponse(token, 'discomfort', null);
  await submitKakaoResponse(token, 'discomfort', 'stomach_discomfort');
  const after = await readState();
  const replies = after.state.care_responses.filter((v) => v.message_id === approved.id && v.source === 'kakao_self_link');
  assert.equal(replies.length, 1); assert.equal(replies[0].detail, 'stomach_discomfort');
  assert.equal(after.state.contact_tasks.filter((v) => v.response_id === replies[0].id).length, 1);
  await changeKakaoPrivate((state) => { state.deliveries[0].response_expires_at = Date.now() - 1; });
  await assert.rejects(responseReceipt(token), hasCode('RESPONSE_LINK_EXPIRED'));
});
test('HTTP connect/send reject missing PIN sessions and cross-origin writes before any provider call', async () => {
  assert.equal((await connectRoute(req())).status, 401);
  const session = await unlock(req(), '1234');
  const request = new Request('http://localhost:3000/api/care-messages/test/send-self', { method: 'POST', headers: { host: 'localhost:3000', origin: 'https://foreign.example', cookie: `${SESSION_COOKIE}=${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBody: 'not sent' }) });
  assert.equal((await sendRoute(request, { params: Promise.resolve({ messageId: 'test' }) })).status, 403);
  assert.equal(sends.length, 0);
});
test('missing message consent leaves the previously connected account intact', async () => {
  await connected(); const before = (await readKakaoPrivate()).connection!.id;
  const session = await unlock(req(), '1234'); const start = await beginKakaoConnection(session.session.id);
  const state = new URL(start.url).searchParams.get('state')!;
  const old = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith('/user/scopes') ? Response.json({ scopes: [{ id: 'talk_message', agreed: false, using: true }] }) : old(input, init);
  await assert.rejects(finishKakaoConnection(new Request(`http://localhost:3000/api/auth/kakao/callback?code=x&state=${state}`, { headers: { cookie: `${KAKAO_OAUTH_COOKIE}=${state}` } })), hasCode('KAKAO_SCOPE_REQUIRED'));
  assert.equal((await readKakaoPrivate()).connection!.id, before);
});
