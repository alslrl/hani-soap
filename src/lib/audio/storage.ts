import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeRecording } from '@/lib/types';
import { dataDirectory, storageMode } from '@/lib/server/config';
import { AppError } from '@/lib/server/errors';
import { getSupabase } from '@/lib/server/supabase';

export const MAX_AUDIO_BYTES = 25_000_000;
export const audioBucket = () => process.env.HANI_RECORDINGS_BUCKET || 'hani-recordings';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const localPath = (id: string) => {
  if (!/^[a-f\d-]{36}$/i.test(id)) throw new AppError(400, 'INVALID_RECORDING', '녹음 ID를 확인해 주세요.');
  return path.join(dataDirectory(), 'audio', id);
};

export function validateAudioFile(filename: string, mime: string, bytes: number) {
  if (bytes < 1 || !Number.isSafeInteger(bytes) || bytes > MAX_AUDIO_BYTES) throw new AppError(413, 'AUDIO_SIZE_LIMIT', '1바이트 이상 25MB 이하의 음성 파일을 선택해 주세요.');
  if (!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(filename)) throw new AppError(400, 'AUDIO_FORMAT_UNSUPPORTED', 'MP3, MP4, M4A, WAV, WEBM 음성을 선택해 주세요.');
  if (!/^(audio\/(mpeg|mp3|mp4|m4a|x-m4a|wav|wave|x-wav|webm)|video\/(mp4|webm)|application\/octet-stream)(;.*)?$/i.test(mime)) throw new AppError(400, 'AUDIO_FORMAT_UNSUPPORTED', '지원하지 않는 음성 형식입니다.');
}

export async function uploadCapability(recording: RuntimeRecording, token: string) {
  if (storageMode() === 'supabase') {
    const { data, error } = await getSupabase().storage.from(audioBucket()).createSignedUploadUrl(recording.object_path, { upsert: false });
    if (error || !data) throw new AppError(503, 'UPLOAD_UNAVAILABLE', '비공개 음성 저장소의 업로드 권한을 생성하지 못했습니다.');
    return { uploadUrl: data.signedUrl, uploadHeaders: { 'x-upsert': 'false' } };
  }
  return { uploadUrl: `/api/audio/uploads/${recording.id}?token=${encodeURIComponent(token)}` };
}

export async function saveLocalAudio(recording: RuntimeRecording, request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'AUDIO_EMPTY', '음성 파일이 비어 있습니다.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > Math.min(MAX_AUDIO_BYTES, recording.size_bytes)) { await reader.cancel(); throw new AppError(413, 'AUDIO_SIZE_LIMIT', '등록한 파일 크기와 실제 업로드가 일치하지 않습니다.'); }
    chunks.push(value);
  }
  if (bytes !== recording.size_bytes) throw new AppError(400, 'AUDIO_SIZE_MISMATCH', '파일 업로드가 완료되지 않았습니다. 다시 시도해 주세요.');
  await mkdir(path.dirname(localPath(recording.id)), { recursive: true });
  await writeFile(localPath(recording.id), Buffer.concat(chunks), { flag: 'wx', mode: 0o600 }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
    const existing = await stat(localPath(recording.id));
    if (existing.size !== bytes) throw new AppError(409, 'AUDIO_ALREADY_EXISTS', '다른 음성 파일이 이미 저장되어 있습니다.');
  });
}

export async function readAudio(recording: RuntimeRecording): Promise<Blob> {
  if (storageMode() === 'supabase') {
    const { data, error } = await getSupabase().storage.from(audioBucket()).download(recording.object_path);
    if (error || !data) throw new AppError(404, 'AUDIO_NOT_FOUND', '저장된 음성을 읽을 수 없습니다.');
    if (data.size !== recording.size_bytes || data.size > MAX_AUDIO_BYTES) throw new AppError(400, 'AUDIO_SIZE_MISMATCH', '저장된 음성 크기가 등록한 값과 일치하지 않습니다.');
    return data;
  }
  const info = await stat(localPath(recording.id)).catch(() => null);
  if (!info) throw new AppError(404, 'AUDIO_NOT_FOUND', '저장된 음성을 읽을 수 없습니다.');
  if (info.size !== recording.size_bytes || info.size > MAX_AUDIO_BYTES) throw new AppError(400, 'AUDIO_SIZE_MISMATCH', '저장된 음성 크기가 등록한 값과 일치하지 않습니다.');
  return new Blob([await readFile(localPath(recording.id))], { type: recording.mime_type });
}
