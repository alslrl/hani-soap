import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
const exec = promisify(execFile);

/** Only an in-memory recording and validated numeric time range enter ffmpeg. */
export async function cropAudio(audio: Blob, startMs: number, endMs: number): Promise<Blob> {
  if (!ffmpegPath || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs - startMs > 30_000) throw new Error('AUDIO_CROP_RANGE');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hani-audio-crop-'));
  try {
    const input = path.join(directory, 'input'), output = path.join(directory, 'clip.wav');
    await writeFile(input, Buffer.from(await audio.arrayBuffer()), { mode: 0o600 });
    await exec(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-ss', String(startMs / 1000), '-t', String((endMs - startMs) / 1000), '-map_metadata', '-1', '-af', 'loudnorm=I=-20:TP=-2:LRA=11', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output], { timeout: 20_000, maxBuffer: 128_000 });
    return new Blob([await readFile(output)], { type: 'audio/wav' });
  } catch { throw new Error('AUDIO_CROP_FAILED'); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

export async function normalizeAudio(audio: Blob): Promise<Blob> {
  if (!ffmpegPath) throw new Error('AUDIO_NORMALIZATION_UNAVAILABLE');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hani-audio-normalize-'));
  try {
    const input = path.join(directory, 'input'), output = path.join(directory, 'audio.flac');
    await writeFile(input, Buffer.from(await audio.arrayBuffer()), { mode: 0o600 });
    await exec(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-map_metadata', '-1', '-vn', '-af', 'loudnorm=I=-20:TP=-2:LRA=11', '-ac', '1', '-ar', '16000', '-c:a', 'flac', output], { timeout: 40_000, maxBuffer: 128_000 });
    const bytes = await readFile(output);
    if (bytes.length > 25_000_000) throw new Error('TOO_LARGE');
    return new Blob([bytes], { type: 'audio/flac' });
  } catch { throw new Error('AUDIO_NORMALIZATION_FAILED'); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
