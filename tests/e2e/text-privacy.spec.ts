import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AiTextPrivacy } from '../../src/lib/privacy/text';

test.describe.serial('text privacy display and upload boundary', () => {
  let visitId: string;
  test.beforeEach(async ({ page }) => {
    const directory = process.env.HANI_DATA_DIR;
    if (!directory || !path.basename(directory).startsWith('hani-privacy-browser-')) throw new Error('Run only against the dedicated local privacy QA store.');
    await page.goto('/access');
    const response = await page.request.post('/api/access/unlock', { data: { pin: '1234' }, headers: { origin: new URL(page.url()).origin } });
    expect(response.ok()).toBeTruthy();
    const envelope = await (await page.request.get('/api/state')).json();
    visitId = envelope.state.scenario_inputs[0].current_visit_id;
  });
  test('shows the actual scope and count while keeping original text reviewable', async ({ page }) => {
    const envelope = await (await page.request.get('/api/state')).json();
    const patient = envelope.state.patients.find((item: any) => item.id === envelope.state.visits.find((v: any) => v.id === visitId).patient_id);
    const raw = `${patient.display_name}님은 통증 NRS 8점이며 연락처는 010-1234-5678입니다.`;
    const privacy = new AiTextPrivacy([{ value: patient.display_name, kind: 'patient_name' }]); privacy.mask(raw);
    const transcriptId = randomUUID(); const now = new Date().toISOString();
    envelope.state.transcripts.push({ id: transcriptId, clinic_id: envelope.state.clinic.id, visit_id: visitId, revision: Math.max(0, ...envelope.state.transcripts.filter((item: any) => item.visit_id === visitId).map((item: any) => item.revision)) + 1, status: 'raw', source_asset_key: 'manual_seed', text: raw, segments: [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: raw, start_ms: 0, end_ms: 1000 }], origin: 'manual_demo' });
    envelope.state.jobs.push({ id: randomUUID(), clinic_id: envelope.state.clinic.id, visit_id: visitId, kind: 'transcription', status: 'waiting_review', stage: 'review_needed', input_hash: 'privacy-ui-fixture', created_at: now, updated_at: now, result: { mode: 'local_privacy_fixture', transcriptId, text_privacy: { soap: privacy.summary() } } });
    await writeFile(path.join(process.env.HANI_DATA_DIR!, 'state.json'), JSON.stringify({ version: envelope.version + 1, state: envelope.state }), { mode: 0o600 });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/clinic/visits/${visitId}`);
    await expect(page.getByTestId('text-privacy-notice')).toContainText('식별정보 2곳 가림');
    await expect(page.getByText('음성 원본·실시간 음성은 가림 없이 OpenAI로 전송됩니다.', { exact: false })).toBeVisible();
    const review = page.locator('details').filter({ has: page.getByText('전사 원문과 용어 제안 검토', { exact: false }) });
    await review.locator(':scope > summary').click();
    await expect(page.getByText(raw, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: process.env.PRIVACY_SCREENSHOT || 'test-results/text-privacy.png', fullPage: true });
    expect(errors).toEqual([]);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'AI 전송용 텍스트 1차 가림' })).toBeVisible();
    await expect(page.getByText('완전 익명화나 무보관을 보장하지 않습니다.', { exact: false })).toBeVisible();
  });
  test('browser request and persisted recording filename both exclude the selected filename', async ({ page }) => {
    await page.route('**/api/jobs', async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '외부 모델 호출 없는 로컬 파일명 검사' }) }));
    await page.goto(`/clinic/visits/${visitId}`);
    const registration = page.waitForRequest((request) => request.url().endsWith('/api/audio/uploads') && request.method() === 'POST');
    const completion = page.waitForResponse((response) => response.url().endsWith('/api/audio/uploads/complete'));
    await page.locator('input[type=file]').setInputFiles({ name: '김서연-01012345678.wav', mimeType: 'audio/wav', buffer: Buffer.from('synthetic-audio-file') });
    const posted = (await registration).postDataJSON();
    expect(posted.filename).toMatch(/^audio-[a-f\d-]{36}\.wav$/);
    expect(posted.filename).not.toContain('김서연'); expect((await completion).ok()).toBeTruthy();
    const envelope = await (await page.request.get('/api/state')).json();
    const recording = envelope.state.recordings.at(-1);
    expect(recording.filename).toBe(`audio-${recording.id}.wav`);
    const stored = JSON.parse(await readFile(path.join(process.env.HANI_DATA_DIR!, 'state.json'), 'utf8'));
    expect(stored.state.recordings.at(-1).filename).toBe(recording.filename);
  });
});
