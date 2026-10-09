import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ActionRequest, AppState, StateEnvelope } from '../types';
import { dataDirectory, storageMode, capabilities, FIXED_CLINIC_ID } from './config';
import { getSupabase, databaseError } from './supabase';
import { readJson, withFileLock, writeJson } from './file-lock';
import { AppError, invariant } from './errors';
import { validateState } from './validation';
import { applyAction } from './actions';

type Snapshot = { state: AppState; version: number };
export type MutationOptions = { expectedVersion?: number; sessionId?: string };
export async function initialState(): Promise<AppState> {
  const data = JSON.parse(await readFile(path.join(process.cwd(), 'data/demo/patients.seed.json'), 'utf8'));
  return { ...data, annotations: [], recordings: [], jobs: [], audioSessions: [], live_events: [], liveProcedureEvents: [] };
}
function envelope(snapshot: Snapshot): StateEnvelope {
  return { ...snapshot, storage: storageMode(), capabilities: capabilities() };
}
async function localSnapshot(): Promise<Snapshot> {
  return await readJson<Snapshot>(path.join(dataDirectory(), 'state.json')) || { state: await initialState(), version: 1 };
}
export async function readState(): Promise<StateEnvelope> {
  if (storageMode() === 'local') return envelope(await localSnapshot());
  const { data, error } = await getSupabase().from('demo_state').select('state,version').eq('clinic_id', FIXED_CLINIC_ID).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new AppError(503, 'SEED_REQUIRED', '데모 데이터를 먼저 초기화해 주세요.');
  return envelope(data as Snapshot);
}
function preserveVersions(before: AppState, after: AppState) {
  for (const previous of before.transcripts) {
    const next = after.transcripts.find((v) => v.id === previous.id);
    invariant(next && JSON.stringify(previous) === JSON.stringify(next), '전사 원문과 기존 버전은 수정할 수 없습니다. 새 버전을 저장해 주세요.', 'IMMUTABLE_SOURCE');
  }
  for (const previous of before.soap_documents.filter((v) => v.status === 'approved')) {
    const next = after.soap_documents.find((v) => v.id === previous.id);
    invariant(next && JSON.stringify(previous) === JSON.stringify(next), '승인 기록은 수정할 수 없습니다. 새 버전을 저장해 주세요.', 'IMMUTABLE_SOURCE');
  }
  for (const previous of before.care_messages.filter((v) => v.approved_body !== null)) {
    const next = after.care_messages.find((v) => v.id === previous.id);
    invariant(next && previous.approved_body === next.approved_body && previous.approved_at === next.approved_at, '승인된 문안은 보존해야 합니다. 새 초안을 작성해 주세요.', 'IMMUTABLE_SOURCE');
  }
}
export async function updateState(updater: (state: AppState) => void | AppState | Promise<void | AppState>, options: MutationOptions = {}): Promise<StateEnvelope> {
  async function updated(snapshot: Snapshot) {
    if (options.expectedVersion !== undefined && options.expectedVersion !== snapshot.version) throw new AppError(409, 'VERSION_CONFLICT', '다른 화면에서 변경되었습니다. 최신 상태를 확인해 주세요.');
    let state = structuredClone(snapshot.state);
    const returned = await updater(state);
    if (returned) state = returned;
    // Both names are read by the live/audio and iPad consumers.
    state.liveProcedureEvents = state.live_events;
    preserveVersions(snapshot.state, state);
    validateState(state);
    return { state, version: snapshot.version + 1 };
  }
  if (storageMode() === 'local') {
    const file = path.join(dataDirectory(), 'state.json');
    return withFileLock(file, async () => {
      const current = await localSnapshot();
      const next = await updated(current);
      await writeJson(path.join(dataDirectory(), 'revisions', `${current.version}.json`), current);
      await writeJson(file, next);
      return envelope(next);
    });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readState();
    const next = await updated(current);
    const { data, error } = await getSupabase().rpc('hani_commit_state', { p_clinic_id: FIXED_CLINIC_ID, p_expected_version: current.version, p_state: next.state });
    if (!error) return envelope({ state: next.state, version: Number(data) });
    if (error.message.includes('VERSION_CONFLICT') && options.expectedVersion === undefined && attempt < 2) continue;
    databaseError(error);
  }
  throw new AppError(409, 'VERSION_CONFLICT', '다른 화면에서 변경되었습니다. 다시 시도해 주세요.');
}
export async function mutateState(action: ActionRequest, options: MutationOptions = {}) {
  invariant(typeof action.type === 'string' && action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload), '작업 요청 형식을 확인해 주세요.');
  return updateState((state) => applyAction(state, action, options.sessionId), { ...options, expectedVersion: action.expectedVersion ?? options.expectedVersion });
}

/** Browser envelopes omit server-only upload capabilities and session ownership keys. */
export function publicEnvelope(value: StateEnvelope): StateEnvelope {
  const result = structuredClone(value);
  for (const recording of result.state.recordings) { delete recording.upload_token_hash; delete recording.upload_expires_at; }
  for (const session of result.state.audioSessions) { delete session.owner_session_id; }
  for (const job of result.state.jobs) { delete job.session_id; }
  return result;
}
