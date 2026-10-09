"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StateEnvelope } from "@/lib/types";

let shared: StateEnvelope | null = null;
const listeners = new Set<(value: StateEnvelope) => void>();
let request: Promise<StateEnvelope> | null = null;

async function checked(response: Response): Promise<StateEnvelope> {
  if (response.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname;
    window.location.assign(`/access?next=${encodeURIComponent(next)}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || body.message || "요청을 처리하지 못했어요.");
  return body;
}
function publish(value: StateEnvelope) {
  if (shared && value.version < shared.version) return;
  shared = value;
  listeners.forEach((listener) => listener(value));
}
async function fetchState() {
  if (!request) request = fetch("/api/state", { cache: "no-store" }).then(checked).then((value) => { publish(value); return value; }).finally(() => { request = null; });
  return request;
}

export function useAppState() {
  const [data, setData] = useState<StateEnvelope | null>(shared);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!shared);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try { const value = await fetchState(); if (mounted.current) setError(null); return value; }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "연결을 확인해 주세요."); return null; }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    listeners.add(setData);
    void refresh();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (active) timer = setTimeout(poll, document.hidden ? 10000 : 1000); };
    timer = setTimeout(poll, 1000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { active = false; mounted.current = false; listeners.delete(setData); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [refresh]);
  const act = useCallback(async (type: string, payload: Record<string, unknown>): Promise<StateEnvelope> => {
    try {
      const value = await checked(await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, payload, expectedVersion: shared?.version }) }));
      publish(value); setError(null); return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장하지 못했어요.";
      setError(message);
      void refresh();
      throw err;
    }
  }, [refresh]);
  return { data, error, loading, refresh, act };
}
