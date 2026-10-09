import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors';

export async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
}
/** Filesystem lock also serializes separate local Next.js/test worker processes. */
export async function withFileLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const until = Date.now() + 10_000;
  for (;;) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A crashed process cannot keep the development store locked forever.
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 60_000) await rm(lock, { recursive: true, force: true });
      if (Date.now() > until) throw new AppError(503, 'STORE_BUSY', '저장 중입니다. 잠시 후 다시 시도해 주세요.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try { return await run(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}
