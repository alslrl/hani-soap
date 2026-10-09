import { test, expect } from '@playwright/test';
import { localDemo, scenario } from './helpers';
import type { Transcript, RuntimeJob } from '../../src/lib/types';

test('inferred group roles, bulk updates and individual overrides flow into a new SOAP revision', async ({ page }) => {
  const envelope = await localDemo(page);
  const { current_visit_id: visitId } = scenario(envelope, 'A');
  const transcript: Transcript = { id: 'synthetic-raw', clinic_id: envelope.state.clinic.id, visit_id: visitId, revision: 90, status: 'raw', source_asset_key: 'manual_seed', origin: 'manual_demo', text: '어디가 아프세요?\n아이가 아파요.\n어제도 아팠어요.', speaker_roles: { A: { role: 'clinician', source: 'inferred' }, B: { role: 'guardian', source: 'inferred' } }, segments: ['어디가 아프세요?', '아이가 아파요.', '어제도 아팠어요.'].map((text, i) => ({ id: `synthetic-${i}`, source_segment_id: `synthetic-${i}`, ordinal: i + 1, raw_speaker: i ? 'B' : 'A', speaker: i ? 'guardian' : 'clinician', text, start_ms: i * 1000, end_ms: (i + 1) * 1000 })) };
  const job: RuntimeJob = { id: 'synthetic-job', clinic_id: transcript.clinic_id, visit_id: visitId, kind: 'transcription', status: 'waiting_review', stage: 'review_needed', input_hash: 'synthetic', created_at: '2026-10-09T01:00:00Z', updated_at: '2026-10-09T01:00:00Z', result: { transcriptId: transcript.id, corrections: [] } };
  envelope.state.transcripts.push(transcript);
  await page.route('**/api/state', route => route.fulfill({ json: envelope }));
  await page.route('**/api/audio/config', route => route.fulfill({ json: { configured: true } }));
  let reviewBody: any, soapBody: any;
  await page.route('**/api/jobs/review', route => { reviewBody = route.request().postDataJSON(); return route.fulfill({ json: { transcriptId: 'synthetic-reviewed' } }); });
  await page.route(/\/api\/jobs(?:\?|$)/, route => {
    if (route.request().method() === 'POST') { soapBody = route.request().postDataJSON(); return route.fulfill({ json: { jobId: 'synthetic-soap' } }); }
    return route.fulfill({ json: { jobs: [job], transcripts: [transcript], recordings: [] } });
  });
  await page.goto(`/clinic/visits/${visitId}`);
  await page.getByText('전사 원문과 용어 제안 검토', { exact: true }).click();
  const tab = page.getByRole('button', { name: /^화자 확인/ });
  if (await tab.count()) await tab.click();
  await expect(page.locator('strong').filter({ hasText: /^의료진 · A$/ }).first()).toBeVisible();
  await expect(page.getByLabel('화자 B 그룹 역할')).toHaveValue('guardian');
  await expect(page.getByLabel('구간 2 화자 역할')).toHaveValue('guardian');
  await page.getByLabel('화자 B 그룹 역할').selectOption('patient');
  await expect(page.getByLabel('구간 2 화자 역할')).toHaveValue('patient');
  await expect(page.getByLabel('구간 3 화자 역할')).toHaveValue('patient');
  await page.getByLabel('구간 2 화자 역할').selectOption('guardian');
  await page.getByLabel('화자 B 그룹 역할').selectOption('unknown');
  await expect(page.getByLabel('구간 2 화자 역할')).toHaveValue('guardian');
  await expect(page.getByLabel('구간 3 화자 역할')).toHaveValue('unknown');
  await page.getByRole('button', { name: '그룹 역할로 되돌리기', exact: true }).click();
  await expect(page.getByLabel('구간 2 화자 역할')).toHaveValue('unknown');
  await page.getByLabel('구간 2 화자 역할').selectOption('guardian');
  if (process.env.HANI_VISUAL_OUTPUT_DIR) await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/speaker-roles.png`, fullPage: true });
  await page.getByRole('button', { name: '전사 검토 저장 · SOAP 다시 생성', exact: true }).click();
  await expect.poll(() => reviewBody).toMatchObject({ speakerGroups: { B: 'unknown' }, speakers: { 'synthetic-1': 'guardian' }, expectedTranscriptRevision: 90 });
  await expect.poll(() => soapBody).toMatchObject({ transcriptId: 'synthetic-reviewed', kind: 'soap' });
});
