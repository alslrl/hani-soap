// Explicitly preload only in an isolated local QA server. Never a production provider setting.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
if (process.env.HANI_STORAGE_MODE !== 'local' || !process.env.HANI_DATA_DIR || process.env.VERCEL) throw new Error('Kakao fixture requires isolated local storage');
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://kauth.kakao.com/oauth/token') return Response.json({ access_token: 'qa-access', refresh_token: 'qa-refresh', expires_in: 3600, refresh_token_expires_in: 86400 });
  if (url === 'https://kapi.kakao.com/v1/user/access_token_info') return Response.json({ id: 10234567, app_id: 1602111 });
  if (url === 'https://kapi.kakao.com/v2/user/scopes') return Response.json({ scopes: [{ id: 'talk_message', consented: true }] });
  if (url === 'https://kapi.kakao.com/v2/api/talk/memo/default/send') {
    const file = path.join(process.env.HANI_DATA_DIR, 'provider-preview.json');
    const previous = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({ count: 0 }));
    const template = JSON.parse(new URLSearchParams(String(init?.body)).get('template_object'));
    await writeFile(file, JSON.stringify({ count: previous.count + 1, template }));
    return Response.json({ result_code: 0 });
  }
  return original(input, init);
};
