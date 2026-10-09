import { expect, test } from "@playwright/test";
import { localDemo, readState, scenario } from "./helpers";

async function openRegion(page: import("@playwright/test").Page, x: number, y: number) {
  await page.getByRole("button", { name: "부위 직접 선택", exact: true }).click();
  const point = await page.getByTestId("treatment-canvas").evaluate((element, value) => {
    const result = new DOMPoint(value.x, value.y).matrixTransform((element as SVGSVGElement).getScreenCTM()!);
    return { x: result.x, y: result.y };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}

test("whole-body selection searches beyond the ankle and preserves per-point sides and procedure layers", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const initial = await localDemo(page);
  expect(initial.capabilities.ai).toBe(false);
  const { current_visit_id: visitId } = scenario(initial, "B");
  await page.goto(`/tablet/visits/${visitId}`);
  await openRegion(page, 350, 550);
  const picker = page.getByRole("dialog", { name: "부위별 위치 선택" });
  await picker.getByRole("button", { name: "전신 검색 · 361", exact: true }).click();
  await expect(picker.getByText("전신 후보 361개 · 선택 0개")).toBeVisible();
  const query = picker.getByRole("searchbox", { name: "혈명·코드 검색" });
  await query.fill("합곡");
  await picker.getByRole("checkbox", { name: /합곡.*LI4/ }).check();
  await picker.getByLabel("환자 기준 좌우").selectOption("not_applicable");
  await expect(picker.getByRole("button", { name: /^이 부위 추가/ })).toBeDisabled();
  await picker.getByLabel("환자 기준 좌우").selectOption("left");
  await query.fill("GV20");
  await picker.getByRole("checkbox", { name: /백회.*GV20/ }).check();
  await expect(picker.getByRole("button", { name: "합곡 선택 해제", exact: true })).toBeVisible();
  await picker.getByRole("button", { name: /^이 부위 추가/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(item => item.visit_id === visitId && item.modality === "acupuncture" && item.locations?.some(point => point.acupoint_code === "LI4" && point.body_region === "hand" && point.laterality === "left") && item.locations.some(point => point.acupoint_code === "GV20" && point.laterality === "midline"))).toBe(true);

  await page.getByRole("tab", { name: /^약침/ }).click();
  await page.getByRole("button", { name: "뒷면", exact: true }).click();
  await openRegion(page, 550, 440);
  await query.fill("신수");
  await picker.getByRole("checkbox", { name: /신수.*BL23/ }).check();
  await picker.getByLabel("환자 기준 좌우").selectOption("right");
  await picker.getByRole("button", { name: /^이 부위 추가/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.treatments.some(item => item.visit_id === visitId && item.modality === "pharmacopuncture" && item.status === "suggested" && item.locations?.some(point => point.acupoint_code === "BL23" && point.body_region === "lower_back" && point.laterality === "right"))).toBe(true);
  await page.reload();
  const state = (await readState(page.request)).state;
  const needle = state.treatments.find(item => item.visit_id === visitId && item.modality === "acupuncture")!;
  expect(needle.locations?.some(point => point.acupoint_code === "LI4" && point.laterality === "left")).toBe(true);
  expect(needle.locations?.some(point => point.acupoint_code === "GV20" && point.laterality === "midline")).toBe(true);
  expect(needle.locations?.some(point => point.acupoint_code === "BL23")).toBe(false);
  expect(needle.status).toBe("suggested");
});

test("manual catalog entry opens all 361 codes without an invented body marker", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  const initial = await localDemo(page);
  await page.goto(`/tablet/visits/${scenario(initial, "A").current_visit_id}`);
  await page.getByRole("button", { name: "목록에서 선택", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "부위별 위치 선택" });
  await expect(picker.getByRole("heading", { name: "전신 혈자리 선택" })).toBeVisible();
  await expect(picker.getByText("전신 후보 361개 · 선택 0개")).toBeVisible();
  await expect(page.locator(".tablet-selection-ring")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "선택 부위 확대", exact: true })).toBeDisabled();
  await picker.getByRole("searchbox", { name: "혈명·코드 검색" }).fill("合谷");
  await picker.getByRole("checkbox", { name: /합곡.*LI4/ }).check();
  await expect(picker.getByRole("button", { name: /^이 부위 추가/ })).toBeDisabled();
  await picker.getByLabel("환자 기준 좌우").selectOption("right");
  await expect(picker.getByRole("button", { name: /^이 부위 추가/ })).toBeEnabled();
});
