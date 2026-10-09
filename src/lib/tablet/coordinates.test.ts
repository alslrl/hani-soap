import { describe, expect, it } from "vitest";
import type { AnnotationStroke } from "@/lib/types";
import { normalizeStrokes, restoreCanvasStrokes } from "./coordinates";
import { recognizeCheck, type InkPoint } from "./geometry";
import { mapBodyRegion } from "./regions";

const line = (a: InkPoint, b: InkPoint) => Array.from({ length: 10 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / 9, y: a.y + (b.y - a.y) * i / 9, t: 1000 + i, pressure: 0.4 }));
const stroke: AnnotationStroke = {
  id: "check-1", kind: "check", created_at: "2026-10-09T00:00:00.000Z",
  points: [...line({ x: 430, y: 875 }, { x: 446, y: 894 }), ...line({ x: 446, y: 894 }, { x: 481, y: 843 }).slice(1)],
};

describe("tablet annotation coordinate persistence", () => {
  it("sends 0..1 coordinates while preserving original ink metadata and input", () => {
    const stored = normalizeStrokes([stroke]);
    expect(stored[0].points[9]).toEqual({ x: 0.446, y: 0.894, t: 1009, pressure: 0.4 });
    expect(stored[0]).toMatchObject({ id: stroke.id, kind: "check", created_at: stroke.created_at });
    expect(stored[0].points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
    expect(stroke.points[9].x).toBe(446);
  });
  it("round-trips a stored check to the same patient-side region and drawing position", () => {
    const restored = restoreCanvasStrokes(JSON.parse(JSON.stringify(normalizeStrokes([stroke]))));
    restored[0].points.forEach((point, index) => {
      expect(point.x).toBeCloseTo(stroke.points[index].x, 10);
      expect(point.y).toBeCloseTo(stroke.points[index].y, 10);
      expect(point.t).toBe(stroke.points[index].t);
      expect(point.pressure).toBe(stroke.points[index].pressure);
    });
    const check = recognizeCheck(restored[0].points);
    expect(check?.anchor).toMatchObject({ x: 446, y: 894 });
    expect(mapBodyRegion(check!.anchor, "front")).toMatchObject({ region: "ankle", laterality: "right" });
  });
  it("preserves whole-canvas memo corners across storage and image-rendering coordinates", () => {
    const memo: AnnotationStroke = { ...stroke, kind: "memo", points: [{ x: 0, y: 0, t: 1 }, { x: 1000, y: 1000, t: 2 }] };
    expect(normalizeStrokes([memo])[0].points).toEqual([{ x: 0, y: 0, t: 1 }, { x: 1, y: 1, t: 2 }]);
    expect(restoreCanvasStrokes(normalizeStrokes([memo]))).toEqual([memo]);
  });
});
