import { describe, expect, it } from "vitest";
import { bodyCanvasViewBox, svgViewBox } from "./viewport";
import { toOriginalPoint } from "./geometry";
import { normalizeStrokes, restoreCanvasStrokes } from "./coordinates";
import type { AnnotationStroke } from "@/lib/types";

describe("portrait anatomy viewport preserves the canonical ink plane", () => {
  it("crops horizontal whitespace only in the current portrait frame", () => {
    expect(svgViewBox(bodyCanvasViewBox(true))).toBe("230 0 540 1000");
    expect(svgViewBox(bodyCanvasViewBox(false))).toBe("0 0 1000 1000");
    expect(svgViewBox(bodyCanvasViewBox(true, null, { originalPlane: true }))).toBe("0 0 1000 1000");
  });
  it("keeps ankle and free-memo coordinates unchanged across portrait and landscape CTMs", () => {
    for (const portrait of [true, false]) {
      const box = bodyCanvasViewBox(portrait);
      const size = portrait ? { width: 834, height: 880 } : { width: 920, height: 530 };
      const scale = Math.min(size.width / box.width, size.height / box.height);
      const transform = { scale, translateX: (size.width - box.width * scale) / 2 - box.x * scale, translateY: (size.height - box.height * scale) / 2 - box.y * scale };
      const original = { x: 419, y: 894, t: 3, pressure: 0.6 };
      const displayed = { ...original, x: original.x * scale + transform.translateX, y: original.y * scale + transform.translateY };
      const restored = toOriginalPoint(displayed, transform);
      expect(restored.x).toBeCloseTo(419, 10);
      expect(restored.y).toBeCloseTo(894, 10);
      const stroke: AnnotationStroke = { id: "portrait", kind: "check", created_at: "2026-10-09T00:00:00Z", points: [restored as AnnotationStroke["points"][number]] };
      expect(normalizeStrokes([stroke])[0].points[0].x).toBeCloseTo(0.419, 10);
      expect(restoreCanvasStrokes(normalizeStrokes([stroke]))[0].points[0].y).toBeCloseTo(894, 10);
    }
  });
  it("keeps the 360-square region zoom in the same canonical plane", () => {
    expect(bodyCanvasViewBox(true, { x: 419, y: 894 })).toEqual({ x: 239, y: 640, width: 360, height: 360 });
    expect(bodyCanvasViewBox(false, { x: 419, y: 894 })).toEqual(bodyCanvasViewBox(true, { x: 419, y: 894 }));
  });
  it("fits legacy margin notes at x100 and x900 when viewing an original frame", () => {
    const box = bodyCanvasViewBox(true, null, { originalPlane: true });
    expect([100, 900].every(x => x >= box.x && x <= box.x + box.width)).toBe(true);
  });
});
