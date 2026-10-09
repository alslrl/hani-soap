import { test, expect } from '@playwright/test';
import { chooseSelect, localDemo, readState } from './helpers';

// Opt in only against a disposable local store populated by the live dual-ASR check.
test('live dual transcript sources survive a real browser role review', async ({ page }) => {
  test.skip(process.env.HANI_DUAL_LIVE_E2E !== '1', 'Requires isolated live-ASR fixture');
  expect(process.env.HANI_DATA_DIR).toMatch(/\/hani-dual-live-[^/]+$/);
  const before = await localDemo(page);
  const job = [...before.state.jobs].reverse().find(item => item.result?.transcription_pipeline === 'dual-asr-v1');
  expect(job).toBeTruthy();
  const raw = before.state.transcripts.find(item => item.id === job!.result?.transcriptId)!;
  const sourceIds = [job!.result?.diarizedTranscriptId, job!.result?.contentTranscriptId];
  const sources = before.state.transcripts.filter(item => sourceIds.includes(item.id));
  expect(sources).toHaveLength(2);
  expect(raw.segments).toHaveLength(8);
  expect(raw.text).toContain('김서연');
  expect(raw.text).toContain('발을 높여');
  const approved = before.state.soap_documents.filter(item => item.status === 'approved');
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  let soapBody: { transcriptId: string; kind: string } | undefined;
  // The actual models were exercised when preparing this store. Review POST and
  // state reads remain real; avoid another paid generation after this UI check.
  await page.route(/\/api\/jobs(?:\?|$)/, route => {
    if (route.request().method() !== 'POST') return route.continue();
    soapBody = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: 'browser-verified-soap-request' } });
  });
  await page.goto(`/clinic/visits/${raw.visit_id}`);
  await page.getByText('전사 원문과 용어 제안 검토', { exact: true }).click();
  await page.getByRole('button', { name: /^화자 확인/ }).click();
  await expect(page.getByRole('combobox', { name: '화자 A 그룹 역할' })).toHaveAttribute('data-value', 'patient');
  await expect(page.getByRole('combobox', { name: '화자 B 그룹 역할' })).toHaveAttribute('data-value', 'clinician');
  const comparisons = page.getByText('두 전사의 표현 비교', { exact: true });
  expect(await comparisons.count()).toBeGreaterThan(0);
  await comparisons.first().click();
  await expect(page.getByText(/^화자 구분용:/).first()).toBeVisible();
  await expect(page.getByText(/^현재 본문:/).first()).toBeVisible();
  await page.getByText('보존된 두 전사 결과', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '화자·시간 구분용 전사', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '본문 전사', exact: true })).toBeVisible();
  await chooseSelect(page, page.getByRole('combobox', { name: '화자 A 그룹 역할' }), 'guardian');
  await expect(page.getByRole('combobox', { name: '구간 1 화자 역할' })).toHaveAttribute('data-value', 'guardian');
  if (process.env.HANI_VISUAL_OUTPUT_DIR) await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/dual-transcription-local.png`, fullPage: true });
  const saved = page.waitForResponse(response => response.url().endsWith('/api/jobs/review') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '전사 검토 저장 · SOAP 다시 생성', exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  const { transcriptId } = await response.json();
  await expect.poll(() => soapBody).toEqual(expect.objectContaining({ transcriptId, kind: 'soap' }));
  const after = await readState(page.request);
  const reviewed = after.state.transcripts.find(item => item.id === transcriptId)!;
  expect(reviewed.text).toBe(raw.text);
  expect(reviewed.segments[0].speaker).toBe('guardian');
  expect(reviewed.segments[0].source_segment_ids).toEqual(raw.segments[0].source_segment_ids);
  expect(after.state.transcripts.filter(item => sourceIds.includes(item.id))).toEqual(sources);
  expect(after.state.transcripts.find(item => item.id === raw.id)).toEqual(raw);
  expect(after.state.soap_documents.filter(item => item.status === 'approved')).toEqual(approved);
  expect(browserErrors).toEqual([]);
});
