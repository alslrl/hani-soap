import { describe, expect, it } from "vitest";
import type { AnnotationStroke } from "@/lib/types";
import { mapBodyRegion, isInsideAnatomyBody, type BodyView } from "./regions";
import { recognizeCheck, toOriginalPoint, type InkPoint } from "./geometry";
import { normalizeStrokes, restoreCanvasStrokes } from "./coordinates";

const line = (a: InkPoint, b: InkPoint) => Array.from({ length: 10 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / 9, y: a.y + (b.y - a.y) * i / 9, t: i }));
const check = [...line({ x: 430, y: 875 }, { x: 446, y: 894 }), ...line({ x: 446, y: 894 }, { x: 481, y: 843 }).slice(1)];

describe("registered v2 anatomy region input", () => {
  it("maps the displayed front and back body with patient laterality", () => {
    expect(mapBodyRegion({ x: 446, y: 894 }, "front", "body-map-v2")).toMatchObject({ region: "ankle", laterality: "right" });
    expect(mapBodyRegion({ x: 550, y: 894 }, "back", "body-map-v2")).toMatchObject({ region: "ankle", laterality: "right" });
    expect(mapBodyRegion({ x: 446, y: 894 }, "back", "body-map-v2")).toMatchObject({ region: "ankle", laterality: "left" });
    expect(mapBodyRegion({ x: 500, y: 440 }, "back", "body-map-v2")).toMatchObject({ region: "lower_back", laterality: "midline" });
    expect(mapBodyRegion({ x: 500, y: 440 }, "front", "body-map-v2")).toMatchObject({ region: "abdomen", laterality: "midline" });
  });
  it("rejects transparent canvas, arm gaps, and leg gaps in both rendered silhouettes", () => {
    for (const view of ["front", "back"] as BodyView[]) {
      for (const point of [{ x: 100, y: 500 }, { x: 500, y: 800 }, { x: 401, y: 450 }, { x: 599, y: 450 }, { x: 500, y: 20 }]) {
        expect(isInsideAnatomyBody(point, view)).toBe(false);
        expect(mapBodyRegion(point, view, "body-map-v2")).toBeNull();
      }
      expect(isInsideAnatomyBody({ x: NaN, y: 500 }, view)).toBe(false);
    }
  });
  it("follows the rendered arm and hand boundaries instead of the wider legacy drawing", () => {
    expect(mapBodyRegion({ x: 365, y: 450 }, "front", "body-map-v2")).toMatchObject({ region: "forearm", laterality: "right" });
    expect(mapBodyRegion({ x: 350, y: 550 }, "front", "body-map-v2")).toMatchObject({ region: "hand", laterality: "right" });
    expect(mapBodyRegion({ x: 279, y: 550 }, "front", "body-map-v1")).toMatchObject({ region: "hand" });
    expect(mapBodyRegion({ x: 279, y: 550 }, "front", "body-map-v2")).toBeNull();
    expect(mapBodyRegion({ x: 445, y: 725 }, "front", "body-map-v2")).toMatchObject({ region: "knee" });
    expect(mapBodyRegion({ x: 450, y: 800 }, "front", "body-map-v2")).toMatchObject({ region: "calf" });
    expect(mapBodyRegion({ x: 450, y: 950 }, "front", "body-map-v2")).toMatchObject({ region: "foot" });
  });
  it("keeps a zoomed check at the same registered ankle after normalized storage and reload", () => {
    const transform = { scale: 2.5, translateX: -700, translateY: -1600 };
    const displayed = check.map(p => ({ ...p, x: p.x * transform.scale + transform.translateX, y: p.y * transform.scale + transform.translateY }));
    const original = displayed.map(p => toOriginalPoint(p, transform)) as AnnotationStroke["points"];
    const stroke: AnnotationStroke = { id: "zoom-check", kind: "check", created_at: "2026-10-09T00:00:00Z", points: original };
    const restored = restoreCanvasStrokes(JSON.parse(JSON.stringify(normalizeStrokes([stroke]))));
    const result = recognizeCheck(restored[0].points);
    expect(result?.anchor).toMatchObject({ x: 446, y: 894 });
    expect(mapBodyRegion(result!.anchor, "front", "body-map-v2")).toMatchObject({ region: "ankle", laterality: "right" });
  });
});
