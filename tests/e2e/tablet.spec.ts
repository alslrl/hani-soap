import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { action, localDemo, readState, scenario } from "./helpers";

const frontArt = "/demo/anatomy/body-front-v2.png";
const backArt = "/demo/anatomy/body-back-v2.png";
type Point = [number, number];

async function draw(page: Page, points: Point[]) {
  const screenPoints = await page.getByTestId("treatment-canvas").evaluate((svg, coordinates) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!;
    return coordinates.map(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  }, points);
  await page.mouse.move(screenPoints[0].x, screenPoints[0].y);
  await page.mouse.down();
  for (const point of screenPoints.slice(1)) await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.up();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = process.env.HANI_VISUAL_OUTPUT_DIR ? join(process.env.HANI_VISUAL_OUTPUT_DIR, name) : testInfo.outputPath(name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

test("v2 static anatomy supports gestures, laterality, zoom and independent saved procedure layers", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  const initial = await localDemo(page);
  expect(initial.capabilities.ai).toBe(false);
  const { current_visit_id: visitId } = scenario(initial, "B");
  expect(initial.state.annotations.filter(item => item.visit_id === visitId)).toHaveLength(0);
  const models: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", request => { if (/\.glb(?:\?|$)/i.test(request.url())) models.push(request.url()); });
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const frontLoaded = page.waitForResponse(response => new URL(response.url()).pathname === frontArt && response.ok());
  await page.goto(`/tablet/visits/${visitId}`);
  await frontLoaded;
  const canvas = page.getByTestId("treatment-canvas");
  const art = canvas.locator("image");
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v2");
  await expect(page.getByTestId("legacy-body-map-notice")).toHaveCount(0);
  await expect(art).toHaveAttribute("href", frontArt);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => document.createElement("canvas").getContext("webgl"))).toBeNull();

  // This turning point lies inside the PNG alpha mask on the displayed ankle.
  await draw(page, [[430, 875], [446, 894], [481, 843]]);
  const picker = page.getByRole("dialog", { name: "부위별 위치 선택" });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel("선택 부위")).toHaveValue("ankle");
  await expect(picker.getByLabel("환자 기준 좌우")).toHaveValue("right");
  await page.getByRole("button", { name: "선택 부위 확대", exact: true }).click();
  expect((await canvas.getAttribute("viewBox"))?.split(" ").slice(-2)).toEqual(["360", "360"]);
  await expect(art).toHaveAttribute("width", "1000");
  await picker.getByRole("checkbox", { name: /구허.*GB40/ }).check();
  await picker.getByRole("button", { name: /이 부위 추가/ }).click();
  await draw(page, [[480, 800], [500, 800], [520, 800]]);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  await expect(picker).toHaveCount(0);
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(item => item.visit_id === visitId && item.modality === "acupuncture" && item.technique === "standard_acupuncture" && item.acupoints.some(point => point.code === "GB40"))).toBe(true);
  const frontSaved = (await readState(page.request)).state.annotations.find(item => item.visit_id === visitId && item.modality === "acupuncture" && item.technique === "standard_acupuncture" && item.view === "front")!;
  expect(frontSaved.coordinate_version).toBe("body-map-v2");
  const memo = frontSaved.strokes.find(item => item.kind === "memo")!;
  expect(memo.points[0].x).toBeCloseTo(0.48, 2);
  expect(memo.points[0].y).toBeCloseTo(0.8, 2);
  await page.getByRole("button", { name: "전체 인체 보기", exact: true }).click();
  await expect(canvas).toHaveAttribute("viewBox", "0 0 1000 1000");

  const backLoaded = page.waitForResponse(response => new URL(response.url()).pathname === backArt && response.ok());
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await backLoaded;
  await expect(art).toHaveAttribute("href", backArt);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(0);
  await draw(page, [[430, 875], [446, 894], [481, 843]]);
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel("선택 부위")).toHaveValue("ankle");
  // The same screen side is the patient's opposite side in the back view.
  await expect(picker.getByLabel("환자 기준 좌우")).toHaveValue("left");
  await picker.getByRole("checkbox", { name: /태계.*KI3/ }).check();
  await picker.getByRole("button", { name: /이 부위 추가/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.annotations.some(item => item.visit_id === visitId && item.view === "back" && item.coordinate_version === "body-map-v2" && item.strokes.length === 1)).toBe(true);
  await page.getByRole("button", { name: "앞면", exact: true }).click();
  const locations = page.locator(".tablet-selected-locations");
  await expect(locations).toContainText("GB40");
  await expect(locations).toContainText("KI3");
  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v2");
  await expect(locations).not.toContainText("GB40");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(0);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(0);
  await page.getByRole("button", { name: "목록에서 선택", exact: true }).click();
  await picker.getByRole("checkbox", { name: /신맥.*BL62/ }).check();
  await picker.getByRole("button", { name: /이 부위 추가/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(item => item.visit_id === visitId && item.modality === "pharmacopuncture" && item.status === "suggested" && item.acupoints.some(point => point.code === "BL62"))).toBe(true);
  await page.getByRole("tab", { name: /^침/ }).click();
  await expect(locations).toContainText("GB40");
  await expect(locations).not.toContainText("BL62");
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  await page.reload();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v2");
  await expect(art).toHaveAttribute("href", frontArt);
  await expect(locations).toContainText("GB40");
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  await page.getByRole("button", { name: "오늘 시행 확인", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(item => item.visit_id === visitId && item.modality === "acupuncture" && item.technique === "standard_acupuncture" && item.status === "confirmed" && item.acupoints.some(point => point.code === "GB40"))).toBe(true);
  await capture(page, testInfo, "hani-anatomy-v2-landscape.png");
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await expect(art).toHaveAttribute("href", backArt);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(1);
  await capture(page, testInfo, "hani-anatomy-v2-back-landscape.png");
  await page.getByRole("button", { name: "앞면", exact: true }).click();
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capture(page, testInfo, "hani-anatomy-v2-portrait.png");
  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(locations).toContainText("BL62");
  await expect(locations).not.toContainText("GB40");

  const pc = await context.newPage();
  await pc.goto(`/clinic/visits/${visitId}`);
  const procedure = pc.locator(".hs-treatment-row").filter({ hasText: "구허" });
  await expect(procedure).toContainText("태계");
  await expect(procedure).toContainText("시행 확인");
  const pharmacopuncture = pc.locator(".hs-treatment-row").filter({ hasText: "신맥" });
  await expect(pharmacopuncture).toContainText("약침");
  await expect(pharmacopuncture).toContainText("확인 전");
  await pc.close();
  expect(models).toHaveLength(0);
  expect(browserErrors).toHaveLength(0);
  expect((await readState(page.request)).state.annotations.filter(item => item.visit_id === visitId).every(item => item.coordinate_version === "body-map-v2")).toBe(true);
});

test("a saved v1 annotation keeps the legacy diagram for every layer after reload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  const initial = await localDemo(page);
  expect(initial.capabilities.ai).toBe(false);
  const { current_visit_id: visitId } = scenario(initial, "A");
  expect(initial.state.annotations.filter(item => item.visit_id === visitId)).toHaveLength(0);
  const annotationId = randomUUID();
  const storedPoints = [{ x: 0.43, y: 0.875, t: 1 }, { x: 0.446, y: 0.894, t: 2 }, { x: 0.481, y: 0.843, t: 3 }];
  await action(page.request, "annotation.save", { visitId, annotation: {
    id: annotationId, scope: "treatment", modality: "acupuncture", technique: "standard_acupuncture", view: "front",
    coordinate_space: "normalized", coordinate_version: "body-map-v1", canvas_size: { width: 1000, height: 1000 }, revision: 0,
    strokes: [{ id: randomUUID(), points: storedPoints, kind: "check", created_at: new Date().toISOString() }],
  } });
  await page.goto(`/tablet/visits/${visitId}`);
  const canvas = page.getByTestId("treatment-canvas");
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await expect(page.getByTestId("legacy-body-map-notice")).toBeVisible();
  await expect(canvas.locator("g.tablet-body")).toHaveCount(1);
  await expect(canvas.locator("image")).toHaveCount(0);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveAttribute("d", "M430.00,875.00 L446.00,894.00 L481.00,843.00");
  await page.getByRole("tab", { name: /^약침/ }).click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await expect(canvas.locator("image")).toHaveCount(0);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveCount(0);
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await draw(page, [[480, 400], [500, 400], [520, 400]]);
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.annotations.some(item => item.visit_id === visitId && item.modality === "pharmacopuncture" && item.view === "back" && item.coordinate_version === "body-map-v1")).toBe(true);
  await page.reload();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await expect(canvas.locator("g.tablet-body")).toHaveCount(1);
  await expect(canvas.locator("image")).toHaveCount(0);
  await expect(canvas.locator('[data-ink-kind="check"]')).toHaveAttribute("d", "M430.00,875.00 L446.00,894.00 L481.00,843.00");
  await capture(page, testInfo, "hani-anatomy-v2-legacy-compatibility.png");
  await page.getByRole("tab", { name: /^약침/ }).click();
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-coordinate-version", "body-map-v1");
  await expect(canvas.locator('[data-ink-kind="memo"]')).toHaveCount(1);
  const final = await readState(page.request);
  expect(final.state.annotations.find(item => item.id === annotationId)?.strokes[0].points).toEqual(storedPoints);
  expect(final.state.annotations.filter(item => item.visit_id === visitId).every(item => item.coordinate_version === "body-map-v1")).toBe(true);
});
