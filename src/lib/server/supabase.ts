import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errors';

let client: SupabaseClient | undefined;
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Supabase 서버 연결이 설정되지 않았습니다.');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}
export function databaseError(error: { message?: string; code?: string } | null): never {
  if (error?.message?.includes('AI_CONCURRENCY_LIMIT')) throw new AppError(429, 'AI_CONCURRENCY_LIMIT', '처리 중인 작업이 있습니다. 완료 후 다시 시도해 주세요.');
  if (error?.message?.includes('VERSION_CONFLICT')) throw new AppError(409, 'VERSION_CONFLICT', '다른 화면에서 변경되었습니다. 최신 상태를 확인해 주세요.');
  console.error('[hani database]', error?.code || 'unknown');
  throw new AppError(503, 'DATABASE_UNAVAILABLE', '저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
