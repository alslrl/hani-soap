import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ mode: 'supabase', selects: [] as string[], version: 7, local: { state: { synthetic: true }, version: 3 }, denied: false, dbError: false }));
vi.mock('./server/config', () => ({ storageMode: () => mocks.mode, capabilities: () => ({}), FIXED_CLINIC_ID: 'synthetic', dataDirectory: () => '/synthetic' }));
vi.mock('./server/file-lock', () => ({ readJson: async () => mocks.local, withFileLock: vi.fn(), writeJson: vi.fn() }));
vi.mock('./server/actions', () => ({ applyAction: vi.fn() }));
vi.mock('./server/validation', () => ({ validateState: vi.fn() }));
vi.mock('./server/supabase', () => ({
  getSupabase: () => ({ from: () => ({ select: (columns: string) => {
    mocks.selects.push(columns);
    return { eq: () => ({ maybeSingle: async () => ({ data: columns === 'version' ? { version: mocks.version } : { version: mocks.version, state: { recordings: [], audioSessions: [], jobs: [], synthetic: true } }, error: mocks.dbError ? { message: 'synthetic failure' } : null }) }) };
  } }) }), databaseError: () => { throw new Error('synthetic database failure'); },
}));
vi.mock('./server/auth', () => ({ requireSession: async () => {
  if (mocks.denied) { const { AppError } = await import('./server/errors'); throw new AppError(401, 'AUTH_REQUIRED', 'synthetic denial'); }
} }));
import { readStateIfChanged } from './server/store';
import { GET } from '../app/api/state/route';
const req = (version?: string) => new Request('https://example.test/api/state', { headers: version ? { 'If-None-Match': version } : {} });
beforeEach(() => { mocks.mode = 'supabase'; mocks.selects = []; mocks.version = 7; mocks.denied = false; mocks.dbError = false; });
describe('conditional state egress', () => {
  it('unchanged only selects version and returns bodyless private 304', async () => {
    const response = await GET(req('"state-7"'));
    expect(response.status).toBe(304); expect(await response.text()).toBe('');
    expect(mocks.selects).toEqual(['version']); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
  });
  it('changed fetches full state and preserves the envelope', async () => {
    const response = await GET(req('"state-6"'));
    expect(response.status).toBe(200); expect(mocks.selects).toEqual(['version', 'state,version']);
    expect(await response.json()).toMatchObject({ version: 7, state: { synthetic: true }, storage: 'supabase', capabilities: {} });
    expect(response.headers.get('etag')).toBe('"state-7"');
  });
  it('no validator or malformed validator still gets a full envelope', async () => {
    await GET(req()); await GET(req('bogus')); expect(mocks.selects).toEqual(['state,version', 'state,version']);
  });
  it('local mode returns 200 because the full state was read', async () => {
    mocks.mode = 'local'; mocks.local = { state: { recordings: [], audioSessions: [], jobs: [], synthetic: true } as any, version: 3 };
    const response = await GET(req('"state-3"')); expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(3); expect(mocks.selects).toEqual([]);
  });
  it('auth is required before any version or full read', async () => {
    mocks.denied = true; expect((await GET(req('"state-7"'))).status).toBe(401); expect(mocks.selects).toEqual([]);
  });
  it('database failures do not become an unchanged response', async () => {
    mocks.dbError = true; await expect(readStateIfChanged(7)).rejects.toThrow('synthetic database failure');
  });
});
