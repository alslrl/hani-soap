import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { action, localDemo, readState, scenario } from "./helpers";

type Point = [number, number];
const femaleVersion = "body-map-v3-female";
const maleVersion = "body-map-v2";
const portraitBox = "230 0 540 1000";
const check = (x: number, y: number): Point[] => [[x - 16, y - 19], [x, y], [x + 35, y - 51]];
const artPath = (view: "front" | "back", female: boolean) => "/demo/anatomy/body-" + view + (female ? "-v3-female.png" : "-v2.png");
const canvasOf = (page: Page) => page.getByTestId("treatment-canvas");
const pickerOf = (page: Page) => page.getByRole("dialog", { name: "부위별 위치 선택", exact: true });
const recordsOf = (page: Page) => page.getByRole("dialog", { name: "오늘 시술과 선택 후보", exact: true });

async function screenPoints(page: Page, points: Point[]) {
  return canvasOf(page).evaluate((svg, coordinates) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!;
    return coordinates.map(([x, y]) => { const point = new DOMPoint(x, y).matrixTransform(matrix); return { x: point.x, y: point.y }; });
  }, points);
}
async function draw(page: Page, points: Point[]) {
  const pen = page.getByRole("radio", { name: "펜", exact: true });
  if (await pen.isEnabled()) await pen.click();
  const transformed = await screenPoints(page, points);
  await page.mouse.move(transformed[0].x, transformed[0].y);
  await page.mouse.down();
  for (const point of transformed.slice(1)) await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.up();
}
async function directSelection(page: Page, anchor: Point) {
  await page.getByRole("radio", { name: "부위 선택", exact: true }).click();
  const [point] = await screenPoints(page, [anchor]);
  await page.mouse.click(point.x, point.y);
  await expect(pickerOf(page)).toBeVisible();
}
async function markAndSelect(page: Page, x: number, y: number) {
  await draw(page, check(x, y));
  await expect(pickerOf(page)).toHaveCount(0);
  await directSelection(page, [x, y]);
}
async function openRecords(page: Page) {
  await page.locator(".tablet-records-toggle").click();
  await expect(recordsOf(page)).toBeVisible();
  return recordsOf(page);
}
async function closeRecords(page: Page) {
  await recordsOf(page).getByRole("button", { name: "기록 닫기", exact: true }).click();
  await expect(recordsOf(page)).toHaveCount(0);
}
async function dismissToast(page: Page) {
  const close = page.getByRole("button", { name: "알림 닫기", exact: true });
  if (await close.isVisible()) await close.click();
}
async function addPoint(page: Page, label: RegExp) {
  await pickerOf(page).getByRole("checkbox", { name: label }).check();
  await pickerOf(page).getByRole("button", { name: /이 부위 추가/ }).click();
  await expect(pickerOf(page)).toHaveCount(0);
  await dismissToast(page);
}
async function expectRegion(page: Page, side: "left" | "right") {
  await expect(pickerOf(page)).toBeVisible();
  await expect(pickerOf(page).getByRole("combobox", { name: "선택 부위" })).toHaveAttribute("data-value", "ankle");
  await expect(pickerOf(page).getByRole("combobox", { name: "환자 기준 좌우" })).toHaveAttribute("data-value", side);
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = process.env.HANI_VISUAL_OUTPUT_DIR ? join(process.env.HANI_VISUAL_OUTPUT_DIR, name) : testInfo.outputPath(name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}
async function reachable(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  if (!(await control.isDisabled())) await control.click({ trial: true });
}
async function staticArtOnly(page: Page) {
  const errors: string[] = [], models: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\.glb(?:\?|$)/i.test(request.url())) models.push(request.url()); });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  return () => { expect(errors).toHaveLength(0); expect(models).toHaveLength(0); };
}

test("female portrait defaults to its own frame while old ink remains read-only history", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const initial = await localDemo(page);
  expect(initial.capabilities.ai).toBe(false);
  const { current_visit_id: visitId } = scenario(initial, "A");
  expect(initial.state.annotations.filter(row => row.visit_id === visitId)).toHaveLength(0);
  const annotationId = randomUUID();
  const oldPoints = [{ x: 0.43, y: 0.875, t: 1 }, { x: 0.446, y: 0.894, t: 2 }, { x: 0.481, y: 0.843, t: 3 }];
  const seeded = await action(page.request, "annotation.save", { visitId, annotation: {
    id: annotationId, scope: "treatment", modality: "acupuncture", technique: "standard_acupuncture", view: "front",
    coordinate_space: "normalized", coordinate_version: "body-map-v1", canvas_size: { width: 1000, height: 1000 }, revision: 0,
    strokes: [{ id: randomUUID(), points: oldPoints, kind: "check", created_at: new Date().toISOString() }],
  } });
  const oldAnnotation = seeded.state.annotations.find(row => row.id === annotationId)!;
  const noRuntimeErrors = await staticArtOnly(page);
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === artPath("front", true) && response.ok());
  await page.goto("/tablet/visits/" + visitId);
  await loaded;
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("data-coordinate-version", femaleVersion);
  await expect(canvas).toHaveAttribute("viewBox", portraitBox);
  await expect(canvas).toHaveAttribute("data-readonly", "false");
  await expect(canvas.locator("image")).toHaveAttribute("href", artPath("front", true));
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);
  await expect(page.locator(".tablet-inspector")).not.toBeVisible();

  // The old male ankle coordinate is outside the female silhouette.
  await draw(page, check(446, 894));
  await expect(pickerOf(page)).toHaveCount(0);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  await page.getByRole("button", { name: "필기 작업 되돌리기", exact: true }).click();
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);
  await page.getByRole("button", { name: "이전 도해 기록", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await expect(canvas).toHaveAttribute("viewBox", "0 0 1000 1000");
  await expect(canvas).toHaveAttribute("data-readonly", "true");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveAttribute("d", "M430.00,875.00 L446.00,894.00 L481.00,843.00");
  await expect(page.getByTestId("legacy-body-map-notice")).toContainText("읽기 전용");
  await expect(page.getByRole("button", { name: "초안 저장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "필기 작업 되돌리기", exact: true })).toHaveCount(0);
  await draw(page, check(419, 894));
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(1);
  await capture(page, testInfo, "hani-portrait-female-history.png");
  await page.locator(".tablet-toolbar-return").click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", femaleVersion);
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);

  const bodyBeforeSheet = await canvas.boundingBox();
  await markAndSelect(page, 419, 894);
  await expectRegion(page, "right");
  await expect(pickerOf(page)).toHaveAttribute("aria-modal", "true");
  expect(await canvas.boundingBox()).toEqual(bodyBeforeSheet);
  await addPoint(page, /구허.*GB40/);
  let records = await openRecords(page);
  await expect(records.locator(".tablet-selected-locations")).toContainText("GB40");
  await records.getByLabel("시술 메모").fill("여성 도해의 우측 발목 위치와 원본 필기 확인");
  await page.keyboard.press("Escape");
  await expect(recordsOf(page)).toHaveCount(0);
  await expect(page.locator(".tablet-records-toggle")).toBeFocused();
  records = await openRecords(page);
  await expect(records.getByLabel("시술 메모")).toHaveValue("여성 도해의 우측 발목 위치와 원본 필기 확인");
  await records.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.annotations.some(row => row.visit_id === visitId && row.coordinate_version === femaleVersion && row.view === "front" && row.modality === "acupuncture")).toBe(true);
  await closeRecords(page); await dismissToast(page);
  await draw(page, [[480, 400], [500, 400], [520, 400]]);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(2);
  await page.getByRole("button", { name: "필기 작업 되돌리기", exact: true }).click();
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);

  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);
  await markAndSelect(page, 419, 894);
  await expectRegion(page, "right");
  await addPoint(page, /신맥.*BL62/);
  await page.locator(".tablet-toolbar-save").click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(row => row.visit_id === visitId && row.modality === "pharmacopuncture" && row.acupoints.some(point => point.code === "BL62"))).toBe(true);
  await dismissToast(page);
  await page.getByRole("tab", { name: /^침/ }).click();
  const originalInk = await canvas.locator('[data-ink-kind="memo"]').getAttribute("d");
  await page.setViewportSize({ width: 1366, height: 1024 });
  await expect(canvas).toHaveAttribute("viewBox", "0 0 1000 1000");
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveAttribute("d", originalInk!);
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(canvas).toHaveAttribute("viewBox", portraitBox);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveAttribute("d", originalInk!);
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await expect(canvas.locator("image")).toHaveAttribute("href", artPath("back", true));
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);
  await markAndSelect(page, 580, 894);
  await expectRegion(page, "right");
  await addPoint(page, /곤륜.*BL60/);
  records = await openRecords(page);
  await records.getByRole("button", { name: "오늘 시행 확인", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(row => row.visit_id === visitId && row.modality === "acupuncture" && row.technique === "standard_acupuncture" && row.status === "confirmed" && row.acupoints.some(point => point.code === "BL60"))).toBe(true);
  await closeRecords(page); await dismissToast(page);
  await capture(page, testInfo, "hani-portrait-female-back.png");
  await page.reload();
  await expect(canvas).toHaveAttribute("data-coordinate-version", femaleVersion);
  await expect(canvas.locator("image")).toHaveAttribute("href", artPath("front", true));
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveAttribute("d", originalInk!);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  await capture(page, testInfo, "hani-portrait-female-front.png");
  const final = await readState(page.request);
  expect(final.state.annotations.find(row => row.id === annotationId)).toEqual(oldAnnotation);
  const currentFront = final.state.annotations.find(row => row.visit_id === visitId && row.coordinate_version === femaleVersion && row.modality === "acupuncture" && row.view === "front")!;
  expect(currentFront.id).not.toBe(annotationId);
  expect(currentFront.strokes[0].points.some(point => Math.abs(point.x - 0.419) < 0.002 && Math.abs(point.y - 0.894) < 0.002)).toBe(true);
  const pc = await context.newPage();
  await pc.goto("/clinic/visits/" + visitId);
  await expect(pc.locator(".hs-treatment-row").filter({ hasText: "구허" })).toContainText("시행 확인");
  await expect(pc.locator(".hs-treatment-row").filter({ hasText: "신맥" })).toContainText("확인 전");
  await pc.close(); noRuntimeErrors();
});

test("male portrait keeps v2 gestures, zoom coordinates and separate front/back ink", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const initial = await localDemo(page);
  expect(initial.capabilities.ai).toBe(false);
  const { current_visit_id: visitId } = scenario(initial, "B");
  expect(initial.state.annotations.filter(row => row.visit_id === visitId)).toHaveLength(0);
  const noRuntimeErrors = await staticArtOnly(page);
  await page.goto("/tablet/visits/" + visitId);
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("data-coordinate-version", maleVersion);
  await expect(canvas.locator("image")).toHaveAttribute("href", artPath("front", false));
  await expect(canvas).toHaveAttribute("viewBox", portraitBox);
  await markAndSelect(page, 446, 894);
  await expectRegion(page, "right");
  await pickerOf(page).getByRole("button", { name: "이 부위 확대 보기", exact: true }).click();
  await expect(pickerOf(page)).toHaveCount(0);
  expect((await canvas.getAttribute("viewBox"))?.split(" ").slice(-2)).toEqual(["360", "360"]);
  await draw(page, [[480, 800], [500, 800], [520, 800]]);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(2);
  await page.getByRole("button", { name: "전체 인체 보기", exact: true }).click();
  await expect(canvas).toHaveAttribute("viewBox", portraitBox);
  await directSelection(page, [446, 894]);
  await addPoint(page, /구허.*GB40/);
  await page.locator(".tablet-toolbar-save").click();
  await expect.poll(async () => (await readState(page.request)).state.annotations.some(row => row.visit_id === visitId && row.coordinate_version === maleVersion && row.view === "front" && row.strokes.length === 2)).toBe(true);
  const saved = (await readState(page.request)).state.annotations.find(row => row.visit_id === visitId && row.coordinate_version === maleVersion && row.view === "front")!;
  const memo = saved.strokes.at(-1)!;
  expect(memo.points[0].x).toBeCloseTo(0.48, 2);
  expect(memo.points[0].y).toBeCloseTo(0.8, 2);
  await dismissToast(page);
  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(0);
  await page.getByRole("tab", { name: /^침/ }).click();
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(2);
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await expect(canvas.locator("image")).toHaveAttribute("href", artPath("back", false));
  await markAndSelect(page, 446, 894);
  await expectRegion(page, "left");
  await addPoint(page, /태계.*KI3/);
  const records = await openRecords(page);
  await records.getByRole("button", { name: "오늘 시행 확인", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.annotations.some(row => row.visit_id === visitId && row.coordinate_version === maleVersion && row.view === "back" && row.strokes.length === 1)).toBe(true);
  await closeRecords(page); await dismissToast(page);
  await capture(page, testInfo, "hani-portrait-male-back.png");
  await page.reload();
  await expect(canvas).toHaveAttribute("data-coordinate-version", maleVersion);
  await expect(canvas.locator("[data-ink-kind]")).toHaveCount(2);
  await capture(page, testInfo, "hani-portrait-male-front.png");
  noRuntimeErrors();
});

  test("portrait tablet and landscape controls fit the four supported viewports", async ({ page }, testInfo) => {
    const initial = await localDemo(page);
    expect(initial.capabilities.ai).toBe(false);
    for (const viewport of [{ width: 834, height: 1194 }, { width: 820, height: 1180 }, { width: 1024, height: 1366 }, { width: 1366, height: 1024 }]) {
      await page.setViewportSize(viewport);
      const portrait = viewport.height > viewport.width;
      const demoKey = portrait ? "A" : "B";
      const female = demoKey === "A";
      const { current_visit_id: visitId, patient_id: patientId } = scenario(initial, demoKey);
      await page.goto("/tablet/visits/" + visitId);
      const canvas = canvasOf(page);
      await expect(canvas).toHaveAttribute("data-coordinate-version", female ? femaleVersion : maleVersion);
      await expect(canvas).toHaveAttribute("viewBox", portrait ? portraitBox : "0 0 1000 1000");
      await expect(page.locator(".tablet-patient")).toContainText(initial.state.patients.find(row => row.id === patientId)!.display_name);
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      expect(dimensions.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dimensions.height).toBeLessThanOrEqual(viewport.height + 1);
      await reachable(page, page.getByRole("button", { name: "앞면", exact: true }));
      await reachable(page, page.getByRole("button", { name: "뒷면", exact: true }));
      await reachable(page, page.getByRole("radio", { name: "부위 선택", exact: true }));
      await reachable(page, page.getByRole("button", { name: "필기 작업 되돌리기", exact: true }));
      const beforeSheet = await canvas.boundingBox();
      if (portrait) {
        expect(beforeSheet!.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
        await expect(page.locator(".tablet-inspector")).not.toBeVisible();
        await reachable(page, page.locator(".tablet-toolbar-save"));
        await reachable(page, page.locator(".tablet-records-toggle"));
        const records = await openRecords(page);
        await expect(records).toHaveAttribute("aria-modal", "true");
        expect(await canvas.boundingBox()).toEqual(beforeSheet);
        await reachable(page, records.getByRole("button", { name: "초안 저장", exact: true }));
        await reachable(page, records.getByRole("button", { name: "오늘 시행 확인", exact: true }));
        await page.keyboard.press("Escape");
        await expect(recordsOf(page)).toHaveCount(0);
        await expect(page.locator(".tablet-records-toggle")).toBeFocused();
      } else {
        await expect(page.locator(".tablet-inspector")).toBeVisible();
        await reachable(page, page.locator(".tablet-inspector").getByRole("button", { name: "초안 저장", exact: true }));
        await reachable(page, page.locator(".tablet-inspector").getByRole("button", { name: "오늘 시행 확인", exact: true }));
      }
      await directSelection(page, female ? [419, 894] : [446, 894]);
      await expectRegion(page, "right");
      await expect(pickerOf(page)).toHaveAttribute("aria-modal", portrait ? "true" : "false");
      expect(await canvas.boundingBox()).toEqual(beforeSheet);
      await reachable(page, pickerOf(page).getByRole("button", { name: /이 부위 추가/ }));
      await page.keyboard.press("Escape");
      await expect(pickerOf(page)).toHaveCount(0);
      await capture(page, testInfo, "hani-portrait-" + (female ? "female-" : "male-") + viewport.width + "x" + viewport.height + ".png");
    }
    expect((await readState(page.request)).version).toBe(initial.version);
  });
