"use client";

import { useCallback, useState, useSyncExternalStore } from 'react';
import type { StateEnvelope } from '@/lib/types';
import { appStateStore, checkedState, publishState, refreshState } from './client-state';

export function useAppState() {
  const { data, error, loading } = useSyncExternalStore(appStateStore.subscribe, appStateStore.getSnapshot, appStateStore.getServerSnapshot);
  const [actionError, setActionError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const value = await refreshState();
    if (value) setActionError(null);
    return value;
  }, []);
  const act = useCallback(async (type: string, payload: Record<string, unknown>): Promise<StateEnvelope> => {
    try {
      const value = await checkedState(await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload, expectedVersion: appStateStore.getSnapshot().data?.version }) }));
      publishState(value); setActionError(null); return value;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '저장하지 못했어요.');
      void refresh(); throw err;
    }
  }, [refresh]);
  return { data, error: actionError || error, loading, refresh, act };
}
