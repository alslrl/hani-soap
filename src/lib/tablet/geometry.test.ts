import { describe, expect, it } from "vitest";
import { recognizeCheck, toOriginalPoint, type InkPoint } from "./geometry";
import { ANKLE_CANDIDATES, mapBodyRegion, regionCandidates } from "./regions";

const line = (a: InkPoint, b: InkPoint, n = 10) => Array.from({ length: n }, (_, i) => ({ x: a.x + (b.x - a.x) * i / (n - 1), y: a.y + (b.y - a.y) * i / (n - 1) }));
const check = [...line({ x: 430, y: 875 }, { x: 446, y: 894 }), ...line({ x: 446, y: 894 }, { x: 481, y: 843 }).slice(1)];

describe("check gesture rejects ambiguous handwriting", () => {
  it("recognizes a check and anchors its turning point rather than its long tail", () => {
    const result = recognizeCheck(check);
    expect(result?.anchor).toMatchObject({ x: 446, y: 894 });
    expect(mapBodyRegion(result!.anchor, "front")).toMatchObject({ region: "ankle", laterality: "right" });
  });
  it("keeps checks after modest changes in size and tilt", () => {
    for (const scale of [0.8, 1, 1.6]) {
      const angle = 8 * Math.PI / 180;
      const transformed = check.map(p => ({ x: 450 + (p.x - 450) * scale * Math.cos(angle) - (p.y - 870) * scale * Math.sin(angle), y: 870 + (p.x - 450) * scale * Math.sin(angle) + (p.y - 870) * scale * Math.cos(angle) }));
      expect(recognizeCheck(transformed)).not.toBeNull();
    }
  });
  it("rejects circles and 0/ㅇ, ㄴ, short marks and oversized marks", () => {
    const circle = Array.from({ length: 45 }, (_, i) => ({ x: 450 + 20 * Math.cos(i / 44 * Math.PI * 2), y: 850 + 25 * Math.sin(i / 44 * Math.PI * 2) }));
    const nieun = [...line({ x: 430, y: 830 }, { x: 430, y: 875 }), ...line({ x: 430, y: 875 }, { x: 470, y: 875 })];
    expect(recognizeCheck(circle)).toBeNull();
    expect(recognizeCheck(nieun)).toBeNull();
    expect(recognizeCheck(check.map(p => ({ x: p.x / 10, y: p.y / 10 })))).toBeNull();
    expect(recognizeCheck(check.map(p => ({ x: p.x * 10, y: p.y * 10 })))).toBeNull();
  });
  it("does not classify a check-like stroke next to handwriting as a command", () => {
    expect(recognizeCheck(check, [{ points: [{ x: 450, y: 888 }], kind: "memo" }])).toBeNull();
  });
  it("inverts zoom/translation while preserving original input metadata", () => {
    expect(toOriginalPoint({ x: 320, y: 540, pressure: 0.4 }, { scale: 2, translateX: 20, translateY: 40 })).toEqual({ x: 150, y: 250, pressure: 0.4 });
  });
});

describe("diagram regions and candidate boundaries", () => {
  it("uses patient laterality for front and back", () => {
    expect(mapBodyRegion({ x: 450, y: 877 }, "front")?.laterality).toBe("right");
    expect(mapBodyRegion({ x: 550, y: 877 }, "back")?.laterality).toBe("right");
    expect(mapBodyRegion({ x: 500, y: 420 }, "back")).toMatchObject({ region: "lower_back", laterality: "midline" });
    expect(mapBodyRegion({ x: 100, y: 877 }, "front")).toBeNull();
    expect(mapBodyRegion({ x: 500, y: 800 }, "front")).toBeNull();
  });
  it("does not offer all 16 routine points for one ankle mark", () => {
    expect(new Set(ANKLE_CANDIDATES.map(p => p.code)).size).toBe(16);
    expect(regionCandidates("ankle", "front").map(p => p.code)).not.toContain("GB34");
    expect(regionCandidates("ankle", "front").map(p => p.code)).not.toContain("BL57");
    expect(regionCandidates("lower_back", "back").map(point => point.code)).toContain("BL23");
    expect(regionCandidates("foot", "back").map(point => point.code)).toContain("LR3");
    expect(ANKLE_CANDIDATES.filter(p => p.code === "KI7")).toHaveLength(1);
  });
});
