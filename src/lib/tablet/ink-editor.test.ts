import { describe, expect, it } from "vitest";
import type { AnnotationStroke } from "@/lib/types";
import { editInk, eraseInkAlongPath, initialInkEditor, undoInk } from "./ink-editor";

const stroke = (id: string, coordinates: [number, number][]): AnnotationStroke => ({ id, kind: "memo", created_at: "2026-10-09T00:00:00Z", points: coordinates.map(([x, y], t) => ({ x, y, t, pressure: .5 })) });

describe("stroke eraser and per-layer undo", () => {
  it("erases the middle of a long sparse segment, retaining unrelated ink", () => {
    const long = stroke("long", [[100, 100], [900, 100]]), other = stroke("other", [[100, 180], [200, 180]]);
    expect(eraseInkAlongPath([long, other], [{ x: 500, y: 103 }], 5)).toEqual([other]);
  });
  it("finds a crossing even if neither eraser endpoint touches the ink", () => {
    const line = stroke("cross", [[300, 500], [700, 500]]);
    expect(eraseInkAlongPath([line], [{ x: 500, y: 200 }, { x: 500, y: 800 }], 3)).toHaveLength(0);
  });
  it("handles a dot, near misses, empty strokes and invalid eraser radii", () => {
    const dot = stroke("dot", [[500, 500]]), empty = stroke("empty", []);
    expect(eraseInkAlongPath([dot, empty], [{ x: 510, y: 500 }], 9)).toEqual([dot, empty]);
    expect(eraseInkAlongPath([dot, empty], [{ x: 510, y: 500 }], 10)).toEqual([empty]);
    expect(eraseInkAlongPath([dot], [], 10)).toEqual([dot]);
    expect(eraseInkAlongPath([dot], [{ x: 500, y: 500 }], NaN)).toEqual([dot]);
  });
  it("restores every stroke removed in one eraser drag with one undo", () => {
    const a = stroke("a", [[100, 100], [200, 100]]), b = stroke("b", [[100, 200], [200, 200]]);
    const original = initialInkEditor([a, b]);
    const firstHit = editInk(original, [b], "erase-1"), secondHit = editInk(firstHit, [], "erase-1");
    expect(secondHit.undoStack).toHaveLength(1);
    expect(undoInk(secondHit).strokes).toEqual([a, b]);
    expect(original.strokes).toEqual([a, b]); expect(a.points[0].pressure).toBe(.5);
  });
  it("keeps undo operations for separate gestures and independent layers", () => {
    const a = stroke("a", [[100, 100], [200, 100]]), b = stroke("b", [[100, 200], [200, 200]]);
    const first = editInk(initialInkEditor(), [a], "pen-1"), second = editInk(first, [a, b], "pen-2"), erased = editInk(second, [b], "erase-1");
    const pharma = initialInkEditor([b]);
    expect(undoInk(erased).strokes).toEqual([a, b]);
    expect(undoInk(undoInk(erased)).strokes).toEqual([a]);
    expect(pharma.strokes).toEqual([b]); expect(pharma.undoStack).toHaveLength(0);
  });
  it("does not create undo history for a miss, and allows removal of saved ink", () => {
    const saved = initialInkEditor([stroke("saved", [[100, 100], [200, 100]])]);
    expect(editInk(saved, [...saved.strokes], "miss")).toBe(saved);
    expect(undoInk(saved).strokes).toHaveLength(0);
    const empty = initialInkEditor(); expect(undoInk(empty)).toBe(empty);
  });
});
