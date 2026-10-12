import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateEnvelope } from './types';
const value = (version: number) => ({ version, state: { synthetic: true }, capabilities: {}, storage: 'local' }) as unknown as StateEnvelope;
let doc: EventTarget & { hidden: boolean };
let win: EventTarget & { location: { pathname: string; assign: ReturnType<typeof vi.fn> } };
let cleanups: (() => void)[];
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); cleanups = [];
  doc = Object.assign(new EventTarget(), { hidden: false });
  win = Object.assign(new EventTarget(), { location: { pathname: '/synthetic', assign: vi.fn() } });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
});
afterEach(() => { cleanups.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
describe('shared visible state polling', () => {
  it('deduplicates subscribers and concurrent refreshes, uses version, stops with last subscriber', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(value(1))).mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetcher);
    const { appStateStore: store, refreshState } = await import('./client-state');
    cleanups.push(store.subscribe(vi.fn()), store.subscribe(vi.fn()));
    await refreshState(); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers).toEqual({ 'If-None-Match': '"state-1"' });
    expect(store.getSnapshot().data?.version).toBe(1);
    cleanups.pop()!(); await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(3);
    cleanups.pop()!(); await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not poll hidden tabs and refreshes immediately on visible', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(value(2))); vi.stubGlobal('fetch', fetcher);
    const { appStateStore: store } = await import('./client-state');
    doc.hidden = true; cleanups.push(store.subscribe(vi.fn()));
    await vi.advanceTimersByTimeAsync(10000); expect(fetcher).not.toHaveBeenCalled();
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); await drain(); expect(fetcher).toHaveBeenCalledTimes(1);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10000); expect(fetcher).toHaveBeenCalledTimes(1);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); await drain(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retries failed polls and preserves monotonic mutation publishing during a stale read', async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('synthetic offline')).mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; })).mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetcher);
    const { appStateStore: store, publishState, refreshState } = await import('./client-state');
    cleanups.push(store.subscribe(vi.fn())); await drain(); expect(store.getSnapshot().error).toBe('synthetic offline');
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2);
    publishState(value(9)); const pending = refreshState(); resolve(Response.json(value(8)));
    expect((await pending)?.version).toBe(9); expect(store.getSnapshot().data?.version).toBe(9);
    await vi.advanceTimersByTimeAsync(1000); expect(store.getSnapshot().error).toBeNull();
  });
  it('discovers remote audio jobs and completions through the existing shared state envelope', async () => {
    const jobEnvelope = (version: number, status: string) => ({ ...value(version), state: {
      jobs: [{ id: 'synthetic-job', visit_id: 'synthetic-visit', kind: 'transcription', status }],
      recordings: [], transcripts: status === 'completed' ? [{ id: 'synthetic-transcript', visit_id: 'synthetic-visit' }] : [],
    } }) as unknown as StateEnvelope;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(value(1)))
      .mockResolvedValueOnce(Response.json(jobEnvelope(2, 'queued')))
      .mockResolvedValueOnce(Response.json(jobEnvelope(3, 'completed')));
    vi.stubGlobal('fetch', fetcher);
    const { appStateStore: store, refreshState } = await import('./client-state');
    cleanups.push(store.subscribe(vi.fn())); await refreshState();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getSnapshot().data?.state.jobs[0].status).toBe('queued');
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getSnapshot().data?.state.jobs[0].status).toBe('completed');
    expect(store.getSnapshot().data?.state.transcripts[0].id).toBe('synthetic-transcript');
    expect(fetcher.mock.calls.every(([url]) => url === '/api/state')).toBe(true);
  });
  it('auth failures redirect without publishing unauthorized state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'denied' }, { status: 401 })));
    const { appStateStore: store, refreshState } = await import('./client-state'); cleanups.push(store.subscribe(vi.fn()));
    await refreshState(); expect(win.location.assign).toHaveBeenCalledWith('/access?next=%2Fsynthetic'); expect(store.getSnapshot().data).toBeNull();
  });
  it('visibility return during an in-flight read triggers a fresh follow-up read', async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; })).mockResolvedValue(Response.json(value(2)));
    vi.stubGlobal('fetch', fetcher); const { appStateStore: store, refreshState } = await import('./client-state');
    cleanups.push(store.subscribe(vi.fn())); const pending = refreshState();
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    resolve(Response.json(value(1))); await pending; await drain(); expect(fetcher).toHaveBeenCalledTimes(2); expect(store.getSnapshot().data?.version).toBe(2);
  });
});
