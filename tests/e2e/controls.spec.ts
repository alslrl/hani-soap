import { test, expect } from '@playwright/test';
import { localDemo, readState, scenario } from './helpers';

test('app microphone menu supports keyboard, dismissal, selection and consistent disclosures', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: async () => [
      { deviceId: 'qa-built-in', kind: 'audioinput', label: '내장 마이크', groupId: 'qa' },
      { deviceId: 'qa-usb', kind: 'audioinput', label: 'USB 마이크', groupId: 'qa' },
    ] });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new Error('This UI test must not acquire a microphone'); } });
  });
  const initial = await localDemo(page);
  await page.goto(`/clinic/visits/${scenario(initial, 'A').current_visit_id}`);
  const microphone = page.getByRole('combobox', { name: '입력 마이크' });
  await microphone.focus();
  await microphone.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '기본 마이크', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'USB 마이크', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(microphone).toHaveText('USB 마이크');
  await expect(microphone).toHaveAttribute('data-value', 'qa-usb');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await microphone.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(microphone).toBeFocused();
  await expect(microphone).toHaveText('USB 마이크');
  await microphone.click();
  if (process.env.HANI_VISUAL_OUTPUT_DIR) await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/controls-microphone-menu.png`, fullPage: false });
  // Modal select content hides background landmarks from the accessibility tree.
  const backgroundName = await page.getByText(initial.state.patients[0].display_name, { exact: true }).first().boundingBox();
  await page.mouse.click(backgroundName!.x + backgroundName!.width / 2, backgroundName!.y + backgroundName!.height / 2);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const summary = page.locator('summary').filter({ hasText: '초진 사례 검수 자료 미리보기' });
  await expect(summary).toBeVisible();
  const before = await summary.evaluate(element => ({ before: getComputedStyle(element, '::before').content, after: getComputedStyle(element, '::after').maskImage, transform: getComputedStyle(element, '::after').transform }));
  expect(before.before).toBe('none'); expect(before.after).toContain('svg');
  await summary.click();
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  expect(await summary.evaluate(element => getComputedStyle(element, '::after').transform)).not.toBe(before.transform);
  await summary.click();
  expect((await readState(page.request)).version).toBe(initial.version);
});

test('touch menu stays in the iPad viewport and Escape dismisses the menu before its sheet', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL, viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const initial = await localDemo(page);
  await page.goto(`/tablet/visits/${scenario(initial, 'B').current_visit_id}`);
  await page.getByRole('button', { name: '부위 직접 선택', exact: true }).tap();
  const position = await page.getByTestId('treatment-canvas').evaluate(element => {
    const point = new DOMPoint(550, 440).matrixTransform((element as SVGSVGElement).getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.touchscreen.tap(position.x, position.y);
  const sheet = page.getByRole('dialog', { name: '부위별 위치 선택' });
  const side = sheet.getByRole('combobox', { name: '환자 기준 좌우' });
  await side.tap();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(10); expect(bounds!.y).toBeGreaterThanOrEqual(10);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(824); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1184);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0); await expect(sheet).toBeVisible(); await expect(side).toBeFocused();
  await side.tap();
  await page.getByRole('option', { name: '우측', exact: true }).tap();
  await expect(side).toHaveAttribute('data-value', 'right');
  await expect.poll(() => side.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  if (process.env.HANI_VISUAL_OUTPUT_DIR) await page.screenshot({ path: `${process.env.HANI_VISUAL_OUTPUT_DIR}/controls-ipad-sheet.png`, fullPage: false });
  expect((await readState(page.request)).version).toBe(initial.version);
  await context.close();
});
