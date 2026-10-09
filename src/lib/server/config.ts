import path from 'node:path';
import { AppError } from './errors';

export const FIXED_CLINIC_ID = '6c8ad2ac-7ed0-5688-9784-cd287f2a7b51';
export function storageMode(): 'local' | 'supabase' {
  if (process.env.HANI_STORAGE_MODE === 'local') {
    if (process.env.VERCEL) throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Vercel 배포에서는 로컬 저장소를 사용할 수 없습니다.');
    return 'local';
  }
  const cloud = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  if (process.env.VERCEL && !cloud) {
    throw new AppError(503, 'STORAGE_NOT_CONFIGURED', '배포 환경에 Supabase 서버 연결을 설정해 주세요.');
  }
  return cloud ? 'supabase' : 'local';
}
export function dataDirectory() {
  return process.env.HANI_DATA_DIR || path.join(process.cwd(), '.hani-data');
}
export function capabilities() {
  return { ai: Boolean(process.env.OPENAI_API_KEY), live: Boolean(process.env.OPENAI_API_KEY) };
}
