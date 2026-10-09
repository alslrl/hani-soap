import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareClinicalTextJob, validateClinicalEvidence } from './care-generation';
import { readState, mutateState } from '@/lib/server/store';
import { unlock, SESSION_COOKIE } from '@/lib/server/auth';

const source = { id: 'source-1', visit_id: 'visit-1', revision: 1, approved_at: '2026-10-02T00:49:00Z', sections: { s: '통증 NRS 8.', o: '', a: '', p: '하루 3회 식후 30분 복용을 안내했다. 다음 방문에 경과를 확인할 계획이다.' } };
const sentence = { text: '하루 3회, 식후 30분에 복용해 주세요.', source_soap_id: source.id, section: 'p' as const, quote: '하루 3회 식후 30분 복용을 안내했다.' };

describe('clinical sentence grounding', () => {
  it('accepts a sentence with an exact approved-plan quote and its original numbers', () => expect(validateClinicalEvidence([sentence], [source], 'care')).toEqual([sentence]));
  it('rejects an invented source ID', () => expect(() => validateClinicalEvidence([{ ...sentence, source_soap_id: 'invented' }], [source], 'care')).toThrow('근거'));
  it('rejects a changed quote', () => expect(() => validateClinicalEvidence([{ ...sentence, quote: '하루 4회' }], [source], 'care')).toThrow('근거'));
  it('rejects a new dosage number even with a valid quote', () => expect(() => validateClinicalEvidence([{ ...sentence, text: '하루 4회 복용하세요.' }], [source], 'care')).toThrow('수치'));
  it('keeps patient instructions grounded in P rather than converting symptoms into instructions', () => expect(() => validateClinicalEvidence([{ ...sentence, section: 's', quote: source.sections.s, text: '통증 NRS 8.' }], [source], 'care')).toThrow('계획'));
  it('allows a past-record briefing to cite S with its original value', () => expect(validateClinicalEvidence([{ ...sentence, section: 's', quote: source.sections.s, text: '이전 기록에서 통증 NRS 8을 보고했다.' }], [source], 'briefing')).toHaveLength(1));
});

describe('generation source selection and request gate without model calls', () => {
  let previous: NodeJS.ProcessEnv;
  let directory: string;
  beforeEach(async () => {
    previous = { ...process.env };
    directory = await mkdtemp(path.join(os.tmpdir(), 'hani-care-test-'));
    Object.assign(process.env, { NODE_ENV: 'test', HANI_STORAGE_MODE: 'local', HANI_DATA_DIR: directory, APP_ORIGIN: 'http://localhost:3000', DEMO_DEV_PIN: '1234', OPENAI_API_KEY: 'test-only-no-provider-call' });
    delete process.env.VERCEL; delete process.env.DEMO_PIN_HASH;
  });
  afterEach(async () => { process.env = previous; await rm(directory, { recursive: true, force: true }); });
  const headers = { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' };
  async function request(visitId: string, origin = headers.origin) {
    const { token } = await unlock(new Request('http://localhost:3000/api/access/unlock', { method: 'POST', headers }), '1234');
    return new Request('http://localhost:3000/api/care/generate', { method: 'POST', headers: { ...headers, origin, cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify({ visitId }) });
  }
  it('requires a valid PIN session before creating an AI job', async () => {
    await expect(prepareClinicalTextJob(new Request('http://localhost:3000/api/care/generate', { method: 'POST', headers, body: '{}' }), 'care')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect((await readState()).state.jobs).toHaveLength(0);
  });
  it('rejects an unexpected Origin before creating an AI job', async () => {
    const visitId = (await readState()).state.scenario_inputs[0].current_visit_id;
    await expect(prepareClinicalTextJob(await request(visitId, 'https://untrusted.example'), 'briefing')).rejects.toMatchObject({ code: 'ORIGIN_REJECTED' });
    expect((await readState()).state.jobs).toHaveLength(0);
  });
  it('does not generate care from an unapproved current visit', async () => {
    const visitId = (await readState()).state.scenario_inputs[0].current_visit_id;
    await expect(prepareClinicalTextJob(await request(visitId), 'care')).rejects.toMatchObject({ code: 'APPROVED_SOURCE_REQUIRED' });
  });
  it('briefing includes only earlier approved records and excludes current and other-patient records', async () => {
    const before = await readState();
    const scenario = before.state.scenario_inputs[0];
    await mutateState({ type: 'soap.save', payload: { visitId: scenario.current_visit_id, sections: { s: '오늘 새 증상', o: '', a: '', p: '오늘 새 계획' } } });
    const prepared = await prepareClinicalTextJob(await request(scenario.current_visit_id), 'briefing');
    const after = await readState();
    const job = after.state.jobs.find((item) => item.id === prepared.jobId)!;
    const ids = job.result!.source_soap_ids as string[];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => {
      const soap = after.state.soap_documents.find((item) => item.id === id)!;
      const visit = after.state.visits.find((item) => item.id === soap.visit_id)!;
      return soap.status === 'approved' && visit.patient_id === scenario.patient_id && visit.id !== scenario.current_visit_id;
    })).toBe(true);
  });
  it('reuses an identical job without another attempt or provider call', async () => {
    const state = (await readState()).state;
    const source = state.soap_documents.find((item) => item.status === 'approved')!;
    const one = await prepareClinicalTextJob(await request(source.visit_id), 'care');
    const two = await prepareClinicalTextJob(await request(source.visit_id), 'care');
    expect(two).toEqual({ jobId: one.jobId, reused: true });
    expect((await readState()).state.jobs).toHaveLength(1);
  });
});
