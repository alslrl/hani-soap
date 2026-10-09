import { test, expect } from '@playwright/test';
import { localDemo, scenario } from './helpers';
import { validateCorrections, type DictionaryTerm } from '../../src/lib/ai/correction';
import type { RuntimeJob, Transcript } from '../../src/lib/types';

test('review steps preserve terminology decisions, speaker roles and edited text', async ({ page }) => {
  const envelope = await localDemo(page);
  const { current_visit_id: visitId } = scenario(envelope, 'A');
  // Synthetic presentation fixture. No provider calls or persisted chart changes.
  const lines = [
    '지난번 방문 이후 오른쪽 발목 통증은 어떤가요? 걷거나 계단을 이용할 때 달라진 점이 있는지 말씀해 주세요.',
    '가만히 있을 때는 괜찮은데 계단을 내려갈 때 아직 불편해요. 오래 걸은 날에는 저녁에 발목이 붓는 느낌도 있어요. 지난번보다 나아졌지만 오래 걷기는 아직 조심하고 있어요.',
    '전사 예시의 보중 익기 탕 표기를 사전 후보와 대조합니다. 실제 처방 여부는 이 화면에서 확정하지 않습니다.',
  ];
  const rawText = lines.join('\n');
  const transcript: Transcript = { id: 'ui-review-transcript', clinic_id: envelope.state.clinic.id, visit_id: visitId, revision: 90, status: 'raw', source_asset_key: 'manual_seed', text: rawText, origin: 'manual_demo', segments: lines.map((text, index) => ({ id: `ui-segment-${index}`, ordinal: index + 1, speaker: 'unknown', text, start_ms: index * 15000, end_ms: (index + 1) * 15000 })) };
  const term: DictionaryTerm = { id: 'ui-dictionary-term', term: '보중익기탕', hanja: '補中益氣湯', kind: 'prescription', source_ids: ['ui-source'], sources: [{ id: 'ui-source', title: '화면 검증용 합성 사전 예시', original: '보중익기탕' }] };
  const start = rawText.indexOf('보중 익기 탕');
  const span = { id: 'ui-span', start, end: start + '보중 익기 탕'.length, original: '보중 익기 탕', candidates: [term] };
  const corrections = validateCorrections(rawText, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: term.id, reason: '띄어쓰기 차이가 있는 사전 후보입니다. 원음을 확인한 뒤 수락 여부를 선택해 주세요.' }]);
  const job: RuntimeJob = { id: 'ui-review-job', clinic_id: envelope.state.clinic.id, visit_id: visitId, kind: 'transcription', status: 'waiting_review', stage: 'correction_review_needed', input_hash: 'ui-only', created_at: '2026-10-09T01:00:00Z', updated_at: '2026-10-09T01:00:00Z', result: { transcriptId: transcript.id, corrections, correction_spans: [span] } };
  envelope.state.transcripts.push(transcript);
  await page.route('**/api/state', route => route.fulfill({ json: envelope }));
  await page.route('**/api/audio/config', route => route.fulfill({ json: { configured: true } }));
  let reviewBody: Record<string, unknown> | undefined;
  let soapBody: Record<string, unknown> | undefined;
  await page.route('**/api/jobs/review', route => { reviewBody = route.request().postDataJSON(); return route.fulfill({ json: { transcriptId: 'ui-reviewed' } }); });
  await page.route(/\/api\/jobs(?:\?|$)/, route => {
    if (route.request().method() === 'POST') { soapBody = route.request().postDataJSON(); return route.fulfill({ json: { jobId: 'ui-soap-job' } }); }
    return route.fulfill({ json: { jobs: [job], recordings: [], transcripts: [transcript] } });
  });
  await page.goto(`/clinic/visits/${visitId}`);
  await page.getByText('전사 원문과 용어 제안 검토', { exact: true }).click();
  await page.getByRole('button', { name: '선택 후보 수락', exact: true }).click();
  await page.getByRole('button', { name: /^화자 확인/ }).click();
  await expect(page.getByText(lines[1], { exact: true }).first()).toBeVisible();
  await page.getByLabel('구간 2 화자 역할').selectOption('patient');
  await page.getByRole('button', { name: '전사 편집', exact: true }).click();
  const editor = page.getByLabel('검토 전사', { exact: true });
  await expect(editor).toHaveValue(rawText.replace('보중 익기 탕', '보중익기탕'));
  const edited = `${rawText.replace('보중 익기 탕', '보중익기탕')}\n의료진 확인 메모 예시.`;
  await editor.fill(edited);
  await page.getByRole('button', { name: /^화자 확인/ }).click();
  await expect(page.getByLabel('구간 2 화자 역할')).toHaveValue('patient');
  await page.getByRole('button', { name: '전사 편집', exact: true }).click();
  await expect(editor).toHaveValue(edited);
  await page.getByText('보존된 전사 원문', { exact: true }).click();
  await expect(page.getByRole('region', { name: '녹음과 음성 처리' }).getByText(lines[2], { exact: true })).toBeVisible();
  await page.getByText('보존된 전사 원문', { exact: true }).click();
  await expect(editor).toHaveCSS('font-size', '15px');
  await expect(editor).toHaveCSS('font-weight', '400');
  if (process.env.HANI_VISUAL_OUTPUT_DIR) {
    await page.getByRole('button', { name: /^화자 확인/ }).click();
    await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/warm-transcript-speakers.png`, fullPage: false, animations: 'disabled' });
    await page.getByRole('button', { name: /^용어 검토/ }).click();
    await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/warm-transcript-terms.png`, fullPage: false, animations: 'disabled' });
  }
  await page.getByRole('button', { name: '전사 검토 저장 · SOAP 다시 생성' }).click();
  await expect.poll(() => reviewBody).toMatchObject({ jobId: job.id, decisions: [{ span_id: span.id, status: 'accepted' }], manualText: edited, speakers: { 'ui-segment-1': 'patient' }, expectedTranscriptRevision: 90 });
  await expect.poll(() => soapBody).toMatchObject({ visitId, transcriptId: 'ui-reviewed', kind: 'soap' });
});
