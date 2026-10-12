import type { StateEnvelope } from './types';

// Keep the established PC/iPad sync cadence, but share one tiny version poll.
const POLL_MS = 1000;
let shared: StateEnvelope | null = null;
const listeners = new Set<() => void>();
let request: Promise<StateEnvelope | null> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let refreshOnVisible = false;
let error: string | null = null;
let loading = true;
type ClientSnapshot = { data: StateEnvelope | null; error: string | null; loading: boolean };
let snapshot: ClientSnapshot = { data: shared, error, loading };
function notify() {
  snapshot = { data: shared, error, loading };
  listeners.forEach(listener => listener());
}
export function publishState(value: StateEnvelope) {
  if (shared && value.version < shared.version) return;
  shared = value;
  error = null;
  loading = false;
  notify();
}
export async function checkedState(response: Response): Promise<StateEnvelope> {
  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/access?next=${encodeURIComponent(window.location.pathname)}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || body.message || '요청을 처리하지 못했어요.');
  return body;
}
function schedule() {
  clearTimeout(timer);
  if (running && !document.hidden) timer = setTimeout(() => { void refreshState(); }, POLL_MS);
}
export function refreshState(): Promise<StateEnvelope | null> {
  if (request) return request;
  // Explicit refreshes after mutations remain allowed even if the tab is hidden.
  const headers: HeadersInit = shared ? { 'If-None-Match': `"state-${shared.version}"` } : {};
  request = fetch('/api/state', { cache: 'no-store', headers })
    .then(async response => {
      if (response.status === 304) { error = null; loading = false; notify(); return shared; }
      const value = await checkedState(response);
      publishState(value);
      return shared; // Never return a stale envelope after a concurrent mutation.
    })
    .catch(failure => {
      error = failure instanceof Error ? failure.message : '연결을 확인해 주세요.';
      loading = false; notify(); return null;
    })
    .finally(() => {
      request = null;
      if (refreshOnVisible && running && !document.hidden) {
        refreshOnVisible = false; void refreshState();
      } else schedule();
    });
  return request;
}
function onVisibility() {
  clearTimeout(timer);
  if (!document.hidden) {
    // If a request started before hiding, follow it with a fresh visibility read.
    if (request) refreshOnVisible = true;
    else void refreshState();
  }
}
export const appStateStore = {
  getSnapshot: () => snapshot,
  getServerSnapshot: () => serverSnapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (!running) {
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('online', onVisibility);
      if (!document.hidden) void refreshState();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        running = false; refreshOnVisible = false; clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onVisibility);
      }
    };
  },
};
const serverSnapshot: ClientSnapshot = { data: null, error: null, loading: true };
