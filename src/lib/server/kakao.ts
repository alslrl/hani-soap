import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sha256, requireOAuthSession } from './auth';
import { AppError, invariant } from './errors';
import { readState, updateState } from './store';
import { changeKakaoPrivate, readKakaoPrivate, type KakaoDelivery } from './kakao-store';
import { decryptKakaoTokens, encryptKakaoTokens, kakaoConfiguration, kakaoRequest, KakaoProviderError, tokenRequest } from './kakao-provider';
import { kakaoPreview, KAKAO_RESPONSE_LABELS, responseOptions } from '../kakao';
import type { CareMessage, CareResponse } from '../types';

export const KAKAO_OAUTH_COOKIE = 'hani_kakao_oauth';
const cookie = (value: string, clear = false) => `${KAKAO_OAUTH_COOKIE}=${value}; Path=/api/auth/kakao/callback; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`;
export const clearKakaoCookie = () => cookie('', true);
export async function beginKakaoConnection(sessionId: string) {
  const config = kakaoConfiguration();
  const token = randomBytes(32).toString('base64url');
  await changeKakaoPrivate((state) => {
    state.oauth = state.oauth.filter((v) => v.expires_at > Date.now()).slice(-20);
    state.oauth.push({ hash: sha256(token), session_id: sessionId, expires_at: Date.now() + 600_000 });
  });
  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'talk_message', state: token }).toString();
  return { url: url.toString(), cookie: cookie(token) };
}
export async function finishKakaoConnection(request: Request) {
  const url = new URL(request.url);
  const stateToken = url.searchParams.get('state') ?? '';
  const savedToken = (request.headers.get('cookie') ?? '').split(';').map((v) => v.trim()).find((v) => v.startsWith(`${KAKAO_OAUTH_COOKIE}=`))?.slice(KAKAO_OAUTH_COOKIE.length + 1) ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(stateToken) || !/^[A-Za-z0-9_-]{43}$/.test(savedToken) || !timingSafeEqual(Buffer.from(stateToken), Buffer.from(savedToken))) throw new AppError(403, 'KAKAO_STATE_INVALID', '카카오 연결을 다시 시작해 주세요.');
  const sessionId = await changeKakaoPrivate((state) => {
    const attempt = state.oauth.find((v) => v.hash === sha256(stateToken) && v.expires_at > Date.now());
    if (!attempt) throw new AppError(403, 'KAKAO_STATE_INVALID', '카카오 연결 시간이 만료되었거나 이미 처리되었습니다.');
    state.oauth = state.oauth.filter((v) => v !== attempt);
    return attempt.session_id;
  });
  await requireOAuthSession(sessionId);
  if (url.searchParams.has('error')) throw new AppError(400, 'KAKAO_CONSENT_CANCELLED', '카카오 연결을 취소했습니다.');
  const code = url.searchParams.get('code');
  invariant(code && code.length <= 2048, '카카오 인가 코드를 확인해 주세요.');
  try {
    const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: kakaoConfiguration().redirectUri });
    if (!tokens.refresh_token || !tokens.refresh_token_expires_in) throw new KakaoProviderError(true);
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const info = await kakaoRequest('https://kapi.kakao.com/v1/user/access_token_info', { headers });
    const scopes = await kakaoRequest('https://kapi.kakao.com/v2/user/scopes', { headers });
    if (!Array.isArray(scopes.scopes) || !scopes.scopes.some((v) => v.id === 'talk_message' && v.consented === true)) throw new AppError(403, 'KAKAO_SCOPE_REQUIRED', '카카오톡 메시지 전송 동의가 필요합니다.');
    if (typeof info.id !== 'number' || process.env.KAKAO_APP_ID && String(info.app_id) !== process.env.KAKAO_APP_ID) throw new AppError(403, 'KAKAO_APP_MISMATCH', '카카오 앱 연결 정보를 확인해 주세요.');
    await changeKakaoPrivate((state) => {
      state.connection = { id: randomUUID(), account_id: String(info.id), tokens: encryptKakaoTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token! }), expires_at: Date.now() + tokens.expires_in * 1000, refresh_expires_at: Date.now() + tokens.refresh_token_expires_in! * 1000, connected_at: new Date().toISOString(), refresh_lock_until: 0 };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'KAKAO_CONNECT_FAILED', '카카오 인증을 완료하지 못했습니다. 앱 설정을 확인하고 다시 연결해 주세요.');
  }
}
export async function kakaoStatus() {
  let configured = true;
  try { kakaoConfiguration(); } catch { configured = false; }
  if (!configured) return { configured: false, connected: false, accountLabel: null, connectedAt: null };
  const connection = (await readKakaoPrivate()).connection;
  return { configured, connected: Boolean(connection && connection.refresh_expires_at > Date.now()), accountLabel: connection ? `본인 계정 · …${connection.account_id.slice(-4)}` : null, connectedAt: connection?.connected_at ?? null };
}
export async function disconnectKakao() { await changeKakaoPrivate((state) => { state.connection = null; }); }

async function accessToken() {
  const original = (await readKakaoPrivate()).connection;
  if (!original || original.refresh_expires_at <= Date.now()) throw new AppError(409, 'KAKAO_NOT_CONNECTED', '설정에서 카카오에 연결해 주세요.');
  if (original.expires_at > Date.now() + 60_000) return { token: decryptKakaoTokens(original.tokens).access_token, connectionId: original.id };
  const claimed = await changeKakaoPrivate((state) => {
    const current = state.connection;
    if (!current || current.id !== original.id) throw new AppError(409, 'KAKAO_NOT_CONNECTED', '카카오 연결이 변경되었습니다. 다시 확인해 주세요.');
    if (current.expires_at > Date.now() + 60_000) return null;
    if (current.refresh_lock_until > Date.now()) throw new AppError(409, 'KAKAO_BUSY', '카카오 연결을 갱신 중입니다. 잠시 후 다시 시도해 주세요.');
    current.refresh_lock_until = Date.now() + 30_000;
    return structuredClone(current);
  });
  if (!claimed) return accessToken();
  try {
    const previous = decryptKakaoTokens(claimed.tokens);
    const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: previous.refresh_token });
    await changeKakaoPrivate((state) => {
      if (state.connection?.id !== claimed.id) throw new AppError(409, 'KAKAO_NOT_CONNECTED', '카카오 연결이 변경되었습니다.');
      state.connection.tokens = encryptKakaoTokens({ access_token: fresh.access_token, refresh_token: fresh.refresh_token ?? previous.refresh_token });
      state.connection.expires_at = Date.now() + fresh.expires_in * 1000;
      if (fresh.refresh_token && fresh.refresh_token_expires_in) state.connection.refresh_expires_at = Date.now() + fresh.refresh_token_expires_in * 1000;
      state.connection.refresh_lock_until = 0;
    });
    return { token: fresh.access_token, connectionId: claimed.id };
  } catch (error) {
    await changeKakaoPrivate((state) => { if (state.connection?.id === claimed.id) state.connection.refresh_lock_until = 0; });
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'KAKAO_REFRESH_FAILED', '카카오 연결을 갱신하지 못했습니다. 설정에서 다시 연결해 주세요.');
  }
}
function approvedMessage(message: CareMessage | undefined, expectedBody: unknown): asserts message is CareMessage & { approved_body: string } {
  if (!message) throw new AppError(404, 'NOT_FOUND', '안내문을 찾을 수 없습니다.');
  if (!message.approved_body || !message.approved_at || message.status === 'draft') throw new AppError(409, 'CARE_APPROVAL_REQUIRED', '안내문을 검토하고 승인해 주세요.');
  if (typeof expectedBody !== 'string' || expectedBody !== message.approved_body) throw new AppError(409, 'CARE_APPROVAL_CHANGED', '승인 문안이 변경되었습니다. 최신 문안을 확인해 주세요.');
}
async function reflectDelivery(delivery: KakaoDelivery) {
  if (delivery.status === 'pending') return;
  const current = (await readState()).state.care_messages.find((v) => v.id === delivery.message_id);
  if (!current || !current.approved_body || sha256(current.approved_body) !== delivery.approved_hash) throw new AppError(409, 'CARE_APPROVAL_CHANGED', '발송 문안과 기록이 일치하지 않습니다.');
  if (current.status === delivery.status && current.delivery_mode === 'kakao_self') return;
  await updateState((state) => {
    const message = state.care_messages.find((v) => v.id === delivery.message_id)!;
    invariant(message.approved_body && sha256(message.approved_body) === delivery.approved_hash, '승인 문안을 확인해 주세요.');
    message.status = delivery.status as CareMessage['status']; message.delivery_mode = 'kakao_self';
    message.delivered_at = delivery.status === 'sent' ? delivery.finished_at : null;
  });
}
export async function sendKakaoSelf(messageId: string, expectedBody: unknown, retry = false) {
  const message = (await readState()).state.care_messages.find((v) => v.id === messageId);
  approvedMessage(message, expectedBody);
  const hash = sha256(message.approved_body);
  const previous = (await readKakaoPrivate()).deliveries.find((v) => v.message_id === messageId && v.approved_hash === hash);
  if (previous && !(previous.status === 'failed' && retry)) {
    if (previous.status === 'pending' && Date.now() - Date.parse(previous.attempted_at) > 90_000) {
      await changeKakaoPrivate((state) => { const row = state.deliveries.find((v) => v.id === previous.id)!; if (row.status === 'pending') { row.status = 'unknown'; row.finished_at = new Date().toISOString(); } });
      previous.status = 'unknown';
    }
    await reflectDelivery(previous);
    return { status: previous.status, duplicate: true };
  }
  if (message.status !== 'approved' && !(message.status === 'failed' && message.delivery_mode === 'kakao_self' && retry)) throw new AppError(409, 'CARE_APPROVAL_REQUIRED', '새 안내문을 승인한 뒤 발송해 주세요.');
  const access = await accessToken();
  const responseToken = randomBytes(32).toString('base64url');
  const delivery = await changeKakaoPrivate((state) => {
    if (state.connection?.id !== access.connectionId) throw new AppError(409, 'KAKAO_NOT_CONNECTED', '카카오 연결이 변경되었습니다.');
    const row = state.deliveries.find((v) => v.message_id === messageId && v.approved_hash === hash);
    if (row && !(row.status === 'failed' && retry)) return null;
    const next: KakaoDelivery = { id: row?.id ?? randomUUID(), message_id: messageId, approved_hash: hash, connection_id: access.connectionId, status: 'pending', attempted_at: new Date().toISOString(), finished_at: null, provider_code: null, response_token_hash: sha256(responseToken), response_expires_at: Date.now() + 7 * 86400_000, stage: message.stage };
    if (row) state.deliveries[state.deliveries.indexOf(row)] = next; else state.deliveries.push(next);
    return next;
  });
  if (!delivery) return { status: 'pending' as const, duplicate: true };
  const base = `${kakaoConfiguration().origin}/care/respond/${responseToken}`;
  const link = (url: string) => ({ web_url: url, mobile_web_url: url });
  const options = responseOptions(message.stage);
  const buttonOptions = message.stage === 'week1' ? ['improving', 'discomfort'] as const : options.slice(0, 2);
  const buttons = message.stage === 'visit_summary'
    ? [{ title: '전체 안내 보기', link: link(base) }, { title: KAKAO_RESPONSE_LABELS.discomfort, link: link(`${base}?option=discomfort`) }]
    : buttonOptions.map((option) => ({ title: KAKAO_RESPONSE_LABELS[option], link: link(`${base}?option=${option}`) }));
  try {
    const result = await kakaoRequest('https://kapi.kakao.com/v2/api/talk/memo/default/send', { method: 'POST', headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: new URLSearchParams({ template_object: JSON.stringify({ object_type: 'text', text: kakaoPreview(message.approved_body), link: link(base), buttons }) }) });
    if (result.result_code !== 0) throw new KakaoProviderError(true, typeof result.result_code === 'number' ? result.result_code : null);
    delivery.status = 'sent'; delivery.provider_code = 0;
  } catch (error) {
    delivery.status = error instanceof KakaoProviderError && !error.uncertain ? 'failed' : 'unknown';
    delivery.provider_code = error instanceof KakaoProviderError ? error.providerCode : null;
  }
  delivery.finished_at = new Date().toISOString();
  await changeKakaoPrivate((state) => { const row = state.deliveries.find((v) => v.id === delivery.id); if (row?.status === 'pending') Object.assign(row, delivery); });
  await reflectDelivery(delivery);
  return { status: delivery.status, duplicate: false };
}
export async function responseReceipt(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(404, 'RESPONSE_LINK_INVALID', '안내 링크를 확인해 주세요.');
  const delivery = (await readKakaoPrivate()).deliveries.find((v) => v.response_token_hash === sha256(token) && v.response_expires_at > Date.now() && v.status !== 'failed');
  if (!delivery) throw new AppError(410, 'RESPONSE_LINK_EXPIRED', '안내 링크가 만료되었습니다.');
  const message = (await readState()).state.care_messages.find((v) => v.id === delivery.message_id);
  if (!message?.approved_body || sha256(message.approved_body) !== delivery.approved_hash) throw new AppError(410, 'RESPONSE_LINK_EXPIRED', '안내문을 확인할 수 없습니다.');
  return { delivery, body: message.approved_body, options: responseOptions(message.stage) };
}
export async function submitKakaoResponse(token: string, option: unknown, detail: unknown) {
  const receipt = await responseReceipt(token);
  invariant(receipt.options.includes(option as CareResponse['option']), '허용된 응답을 선택해 주세요.');
  invariant(detail == null || option === 'discomfort' && ['stomach_discomfort', 'difficulty_taking', 'other'].includes(String(detail)), '불편한 점의 상세 응답을 확인해 주세요.');
  const eventKey = `kakao:${receipt.delivery.id}:${option}`;
  await updateState((state) => {
    const message = state.care_messages.find((v) => v.id === receipt.delivery.message_id)!;
    const existing = state.care_responses.find((v) => v.event_key === eventKey);
    if (existing) { if (detail != null) existing.detail = detail as CareResponse['detail']; return; }
    const response: CareResponse = { id: randomUUID(), clinic_id: state.clinic.id, patient_id: message.patient_id, message_id: message.id, option: option as CareResponse['option'], detail: detail as CareResponse['detail'] ?? null, received_at: new Date().toISOString(), source: 'kakao_self_link', event_key: eventKey, origin: 'synthetic_response' };
    state.care_responses.push(response);
    if (option === 'discomfort') state.contact_tasks.push({ id: randomUUID(), clinic_id: state.clinic.id, patient_id: message.patient_id, response_id: response.id, reason: '카카오 본인 발송 데모 응답: 불편한 점 있어요. 현재 상태를 확인해 주세요.', status: 'open', resolution_note: null, closed_by: null, closed_at: null, origin: 'synthetic_response' });
  });
  return { ok: true };
}
