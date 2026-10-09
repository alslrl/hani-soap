import { test, expect } from '@playwright/test';
import { action, localDemo, readState, scenario } from './helpers';

test('pain shortcut preserves answers and unsaved scores; answer save cannot replay a stale NRS', async ({ page }) => {
  const initial = await localDemo(page);
  const { current_visit_id: visitId } = scenario(initial, 'A');
  const measure = { visitId, metric_key: 'pain_intensity', instrument: 'NRS', body_region: 'ankle', laterality: 'right', measurement_context: 'current_pain' };
  await action(page.request, 'observation.save', { ...measure, value: 0 });
  await page.goto(`/clinic/visits/${visitId}`);
  await expect(page.locator('#today-nrs')).toHaveValue('0');
  await page.getByRole('tab', { name: '재진 질문', exact: true }).click();
  const followup = page.getByRole('region', { name: '재진 확인 질문' });
  await followup.getByRole('navigation', { name: '재진 질문 항목' }).getByRole('button').filter({ hasText: '통증' }).click();
  const answer = '수기로 확인한 답변을 이동해도 보존합니다.';
  await followup.locator('textarea').first().fill(answer);
  await expect(followup.getByText('오늘 통증 NRS: 0/10', { exact: false })).toBeVisible();
  await expect(followup.locator('input[type="number"]')).toHaveCount(0);
  const beforeJump = await readState(page.request);
  await followup.getByRole('button', { name: '통증 NRS 입력으로 이동', exact: true }).click();
  await expect(page.locator('#today-nrs')).toBeFocused();
  await expect(followup.locator('textarea').first()).toHaveValue(answer);
  expect((await readState(page.request)).version).toBe(beforeJump.version);

  await page.locator('#today-nrs').fill('3');
  // A background update must not overwrite the clinician's unsaved input.
  await action(page.request, 'observation.save', { ...measure, value: 4 });
  await expect(followup.getByText('오늘 통증 NRS: 4/10', { exact: false })).toBeVisible();
  await expect(page.locator('#today-nrs')).toHaveValue('3');
  await page.locator('.hs-nrs-panel').first().getByRole('button', { name: '저장', exact: true }).click();
  const currentValue = async () => (await readState(page.request)).state.observations.filter((item) => item.visit_id === visitId && item.instrument === 'NRS' && item.body_region === 'ankle' && item.laterality === 'right').sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0]?.value;
  await expect.poll(currentValue).toBe(3);
  await followup.getByRole('button', { name: '오늘 답변 저장', exact: true }).click();
  await expect(followup.getByText('오늘 확인한 답변을 저장했습니다.', {exact:true})).toBeVisible();
  expect(await currentValue()).toBe(3);

  // When the score is untouched, a newly stored value is reflected in its input.
  await action(page.request, 'observation.save', { ...measure, value: 2 });
  await expect(page.locator('#today-nrs')).toHaveValue('2');
  if (process.env.HANI_VISUAL_OUTPUT_DIR) {
    await followup.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/followup-nrs-navigation.png`, fullPage: true });
  }

  const { current_visit_id: childVisitId } = scenario(initial, 'B');
  await page.goto(`/clinic/visits/${childVisitId}`);
  await page.getByRole('tab', { name: '재진 질문', exact: true }).click();
  await page.getByRole('navigation', { name: '재진 질문 항목' }).getByRole('button').filter({ hasText: '통증' }).click();
  await expect(page.getByRole('button', { name: '통증 NRS 입력으로 이동' })).toHaveCount(0);
});
