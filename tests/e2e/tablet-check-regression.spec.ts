import { expect, test } from "@playwright/test";
import { localDemo, scenario } from "./helpers";

for (const failure of ["capture_lost", "coalesced_metadata"] as const) {
  test(`Pencil check survives ${failure} and opens a region picker`, async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    const initial = await localDemo(page);
    const demo = failure === "capture_lost" ? "A" : "B";
    const visitId = scenario(initial, demo).current_visit_id;
    await page.goto(`/tablet/visits/${visitId}`);
    const canvas = page.getByTestId("treatment-canvas");
    await expect(canvas).toHaveAttribute("data-readonly", "false");
    await canvas.evaluate((element, args) => {
      const svg = element as SVGSVGElement;
      const matrix = svg.getScreenCTM()!;
      const anchorX = args.demo === "A" ? 419 : 446;
      const vertices = [[anchorX - 16, 875], [anchorX, 894], [anchorX + 35, 843]];
      const emit = (type: string, x: number, y: number, brokenSamples = false) => {
        const location = new DOMPoint(x, y).matrixTransform(matrix);
        const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 401, pointerType: "pen", isPrimary: true, clientX: location.x, clientY: location.y, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, pressure: .5 });
        if (brokenSamples) Object.defineProperty(event, "getCoalescedEvents", { value: () => [new PointerEvent("pointermove", { pointerId: 0, pointerType: "pen", clientX: location.x, clientY: location.y, pressure: .5 })] });
        svg.dispatchEvent(event);
      };
      emit("pointerdown", ...vertices[0] as [number, number]);
      for (let segment = 1; segment < vertices.length; segment++) {
        for (let sample = 1; sample <= 14; sample++) {
          const before = vertices[segment - 1], after = vertices[segment];
          emit("pointermove", before[0] + (after[0] - before[0]) * sample / 14, before[1] + (after[1] - before[1]) * sample / 14, args.failure === "coalesced_metadata");
        }
      }
      if (args.failure === "capture_lost") emit("lostpointercapture", ...vertices.at(-1)! as [number, number]);
      emit("pointerup", ...vertices.at(-1)! as [number, number]);
    }, { demo, failure });
    await expect(canvas.locator("[data-ink-kind='check']")).toHaveCount(1);
    const picker = page.getByRole("dialog", { name: "부위별 위치 선택" });
    await expect(picker).toBeVisible();
    await expect(picker.getByLabel("선택 부위")).toHaveValue("ankle");
    await expect(picker.getByLabel("환자 기준 좌우")).toHaveValue("right");
  });
}
