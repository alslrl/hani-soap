import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import reference from "../../../data/anatomy/acupoint-reference-overlay.json";
import catalog from "../../../data/acupoints/tablet-catalog.json";
import { acupointReferenceDots } from "./acupoint-reference";
import { isInsideAnatomyBody, mapBodyRegion, type BodyView } from "./regions";

describe("display-only anatomy acupoint registration", () => {
  it("covers every supported source code without approving or inventing hidden surfaces", () => {
    const source = JSON.parse(readFileSync(new URL("../../../docs/verification/atlas-review/display-candidates.json", import.meta.url), "utf8"));
    const bytes = readFileSync(new URL("../../../docs/verification/atlas-review/display-candidates.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(reference.source_sha256);
    expect(reference.clinical_approval).toBe(false);
    const all = Object.values(reference.profiles["body-map-v2"]).flat();
    expect(new Set(all.map(point => point.code))).toEqual(new Set(source.points.map((point: { code: string }) => point.code).filter((code: string) => !reference.omitted_codes.includes(code))));
    expect(all.some(point => point.source_view === "lateral" || point.region === "perineum" || point.code === "KI1")).toBe(false);
  });
  it("keeps every dot inside its own rendered skin, with explicit patient sides and unique instances", () => {
    for (const version of ["body-map-v2", "body-map-v3-female"] as const) {
      for (const view of ["front", "back"] as BodyView[]) {
        const dots = acupointReferenceDots(version, view);
        expect(dots.length).toBeGreaterThan(100);
        expect(new Set(dots.map(dot => `${dot.code}:${dot.side}`)).size).toBe(dots.length);
        for (const dot of dots) {
          expect(isInsideAnatomyBody(dot, view, version), `${version} ${view} ${dot.code}`).toBe(true);
          const canonical = catalog.points.find(point => point.code === dot.code)!;
          expect(canonical).toBeDefined();
          if (canonical.laterality === "midline") {
            expect(dot.side).toBe("midline"); expect(dot.x).toBe(500);
          } else {
            expect((dot.x < 500) === ((dot.side === "right") === (view === "front"))).toBe(true);
          }
        }
      }
    }
  });
  it("registers hand and lumbar references to their actual regions on both body shapes", () => {
    for (const version of ["body-map-v2", "body-map-v3-female"] as const) {
      for (const [code, view, region] of [["LI4", "front", "hand"], ["BL23", "back", "lower_back"], ["ST36", "front", "calf"]] as const) {
        for (const dot of acupointReferenceDots(version, view).filter(point => point.code === code)) {
          expect(mapBodyRegion(dot, view, version)).toMatchObject({ region, laterality: dot.side });
        }
      }
    }
    const male = acupointReferenceDots("body-map-v2", "front").find(dot => dot.code === "LI4")!;
    const female = acupointReferenceDots("body-map-v3-female", "front").find(dot => dot.code === "LI4")!;
    expect(male).not.toEqual(female);
  });
  it("does not place new dots on stored legacy drawing coordinates", () => {
    expect(acupointReferenceDots("body-map-v1", "front")).toHaveLength(0);
    expect(acupointReferenceDots("body-map-v1", "back")).toHaveLength(0);
  });
});
