import path from 'node:path';
import { storageMode, dataDirectory, FIXED_CLINIC_ID } from './config';
import { readJson, writeJson, withFileLock } from './file-lock';
import { getSupabase, databaseError } from './supabase';
import { AppError } from './errors';
import type { CareMessage } from '../types';

export type KakaoConnection = {
  id: string; account_id: string; tokens: string; expires_at: number; refresh_expires_at: number;
  connected_at: string; refresh_lock_until: number;
};
export type KakaoDelivery = {
  id: string; message_id: string; approved_hash: string; connection_id: string;
  status: 'pending' | 'sent' | 'failed' | 'unknown'; attempted_at: string; finished_at: string | null;
  provider_code: number | null; response_token_hash: string; response_expires_at: number;
  stage: CareMessage['stage'];
};
export type KakaoPrivateState = {
  connection: KakaoConnection | null;
  oauth: { hash: string; session_id: string; expires_at: number }[];
  deliveries: KakaoDelivery[];
};
const empty = (): KakaoPrivateState => ({ connection: null, oauth: [], deliveries: [] });
type Row = { version: number; payload: KakaoPrivateState };
const file = () => path.join(dataDirectory(), 'kakao-private.json');
export async function readKakaoPrivate(): Promise<KakaoPrivateState> {
  if (storageMode() === 'local') return (await readJson<Row>(file()))?.payload ?? empty();
  const { data, error } = await getSupabase().from('kakao_private_state').select('version,payload').eq('clinic_id', FIXED_CLINIC_ID).maybeSingle();
  if (error) databaseError(error);
  return data?.payload ?? empty();
}
/** A version comparison serializes claims across Vercel instances; no network work in the updater. */
export async function changeKakaoPrivate<T>(update: (state: KakaoPrivateState) => T): Promise<T> {
  if (storageMode() === 'local') return withFileLock(file(), async () => {
    const row = await readJson<Row>(file()) ?? { version: 0, payload: empty() };
    const result = update(row.payload);
    await writeJson(file(), { version: row.version + 1, payload: row.payload });
    return result;
  });
  const db = getSupabase();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await db.from('kakao_private_state').select('version,payload').eq('clinic_id', FIXED_CLINIC_ID).maybeSingle();
    if (error) databaseError(error);
    const row = (data as Row | null) ?? { version: 0, payload: empty() };
    const result = update(row.payload);
    if (!data) {
      const created = await db.from('kakao_private_state').insert({ clinic_id: FIXED_CLINIC_ID, version: 1, payload: row.payload });
      if (!created.error) return result;
      if (created.error.code === '23505') continue;
      databaseError(created.error);
    } else {
      const changed = await db.from('kakao_private_state').update({ version: row.version + 1, payload: row.payload, updated_at: new Date().toISOString() }).eq('clinic_id', FIXED_CLINIC_ID).eq('version', row.version).select('version');
      if (changed.error) databaseError(changed.error);
      if (changed.data?.length) return result;
    }
  }
  throw new AppError(409, 'KAKAO_BUSY', '카카오 연결을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
}
