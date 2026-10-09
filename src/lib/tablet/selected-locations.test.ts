import { describe, expect, it } from "vitest";
import type { TreatmentLocation } from "@/lib/types";
import { selectedLocationDisplays } from "./selected-locations";

const location = (code: string, laterality: TreatmentLocation["laterality"] = "right", annotation_id: string | null = null): TreatmentLocation => ({
  location_type: "acupoint", acupoint_code: code, label_ko: code, laterality, annotation_id,
  body_region: "hand", location_note: "", finding_ref: null,
});

describe("selected-location display feedback", () => {
  it("uses each sex's registered display points and patient-side orientation", () => {
    for (const version of ["body-map-v2", "body-map-v3-female"] as const) {
      const entries = selectedLocationDisplays([location("LI4", "right"), location("LI4", "left"), location("BL23", "right")], version, {});
      expect(entries[0].dots.front).toHaveLength(1);
      expect(entries[0].dots.front[0].x).toBeLessThan(500);
      expect(entries[1].dots.front[0].x).toBeGreaterThan(500);
      expect(entries[2].dots.front).toHaveLength(0);
      expect(entries[2].dots.back[0].x).toBeGreaterThan(500);
      expect(entries[2].views).toEqual(["back"]);
    }
    expect(selectedLocationDisplays([location("LI4")], "body-map-v2", {})[0].dots.front[0])
      .not.toEqual(selectedLocationDisplays([location("LI4")], "body-map-v3-female", {})[0].dots.front[0]);
  });
  it("expands bilateral selections to two dots with one legend number, and midline to one", () => {
    const entries = selectedLocationDisplays([location("LI4", "bilateral"), location("CV12", "midline")], "body-map-v2", {});
    expect(entries[0].dots.front.map(dot => dot.side).sort()).toEqual(["left", "right"]);
    expect(entries[0].number).toBe(1);
    expect(entries[1].dots.front).toHaveLength(1);
    expect(entries[1].dots.front[0]).toMatchObject({ x: 500, side: "midline" });
    expect(entries[1].number).toBe(2);
  });
  it("retains unavailable selections in the legend without inventing hidden or uncoded positions", () => {
    const inputs = [location("GB30"), location("KI1"), location("UNKNOWN"), { ...location(""), acupoint_code: null, location_type: "ashi" as const }];
    const entries = selectedLocationDisplays(inputs, "body-map-v3-female", {});
    expect(entries).toHaveLength(inputs.length);
    expect(entries.every(entry => entry.views.length === 0 && entry.unavailable)).toBe(true);
    expect(entries[3].unavailable).toBe("위치 설명은 기록에서 확인");
    expect(selectedLocationDisplays([location("LI4", "not_applicable")], "body-map-v2", {})[0].views).toHaveLength(0);
  });
  it("does not project legacy annotations onto a new body or change saved records", () => {
    const inputs = [location("LI4", "right", "old"), location("LI4", "left", "new")];
    const original = structuredClone(inputs);
    const entries = selectedLocationDisplays(inputs, "body-map-v3-female", { old: "body-map-v1", new: "body-map-v3-female" });
    expect(entries[0].unavailable).toBe("이전 도해 기록");
    expect(entries[0].views).toHaveLength(0);
    expect(entries[1].dots.front).toHaveLength(1);
    expect(inputs).toEqual(original);
    expect(selectedLocationDisplays(inputs, "body-map-v1", {})[0].views).toHaveLength(0);
  });
});
