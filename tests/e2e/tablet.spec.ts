import { expect, test } from "@playwright/test";
import { localDemo, readState, scenario } from "./helpers";

test("check gestures open regional candidates and each treatment keeps an independent layer", async ({ page, context }) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  const initial = await localDemo(page);
  const { current_visit_id: visitId } = scenario(initial, "B");
  await page.goto(`/tablet/visits/${visitId}`);
  const canvas = page.getByTestId("treatment-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("tab", { name: /^침/ })).toHaveAttribute("aria-selected", "true");

  // Convert body coordinates through the real SVG transform; this remains valid
  // when the canvas is letterboxed, resized or surrounded by iPad controls.
  const points = await canvas.evaluate((svg) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!;
    return [[430, 875], [446, 894], [481, 843]].map(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  });
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
  await page.mouse.move(points[2].x, points[2].y, { steps: 14 });
  await page.mouse.up();
  const picker = page.getByRole("dialog", { name: "부위별 위치 선택" });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel("선택 부위")).toHaveValue("ankle");
  await expect(picker.getByLabel("환자 기준 좌우")).toHaveValue("right");
  await picker.getByRole("checkbox", { name: /구허.*GB40/ }).check();
  await picker.getByRole("button", { name: /이 부위 추가/ }).click();
  const locations = page.locator(".tablet-selected-locations");
  await expect(locations).toContainText("GB40");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some((item) => item.visit_id === visitId && item.modality === "acupuncture" && item.technique === "standard_acupuncture" && item.status === "suggested" && item.acupoints.some((point) => point.code === "GB40"))).toBe(true);

  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(locations).not.toContainText("GB40");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(0);
  await page.getByRole("button", { name: "목록에서 선택", exact: true }).click();
  await picker.getByRole("checkbox", { name: /신맥.*BL62/ }).check();
  await picker.getByRole("button", { name: /이 부위 추가/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some((item) => item.visit_id === visitId && item.modality === "pharmacopuncture" && item.status === "suggested" && item.acupoints.some((point) => point.code === "BL62"))).toBe(true);
  await page.getByRole("tab", { name: /^침/ }).click();
  await expect(locations).toContainText("GB40");
  await expect(locations).not.toContainText("BL62");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);

  await page.reload();
  await expect(locations).toContainText("GB40");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);
  await page.getByRole("button", { name: "오늘 시행 확인", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some((item) => item.visit_id === visitId && item.modality === "acupuncture" && item.technique === "standard_acupuncture" && item.status === "confirmed" && item.acupoints.some((point) => point.code === "GB40"))).toBe(true);
  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(locations).toContainText("BL62");
  await expect(locations).not.toContainText("GB40");

  const pc = await context.newPage();
  await pc.goto(`/clinic/visits/${visitId}`);
  const procedure = pc.locator(".hs-treatment-row").filter({ hasText: "구허" });
  await expect(procedure).toContainText("시행 확인");
  const pharmacopuncture = pc.locator(".hs-treatment-row").filter({ hasText: "신맥" });
  await expect(pharmacopuncture).toContainText("약침");
  await expect(pharmacopuncture).toContainText("확인 전");
  await pc.close();
});
