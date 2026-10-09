import { describe, expect, it } from "vitest";
import raw from "../../../data/acupoints/경혈_361_위치좌표.json";
import { ACUPOINT_CATALOG, getCatalogPoint, resolvePointLaterality, searchAcupoints, sourceViewMatches } from "./acupoint-catalog";
import { REGION_LABELS, regionCandidates, type BodyRegion } from "./regions";

describe("whole-body catalog selection", () => {
  it("keeps every original code exactly once without adding approximate coordinates", () => {
    expect(ACUPOINT_CATALOG).toHaveLength(361);
    expect(new Set(ACUPOINT_CATALOG.map(point => point.code))).toEqual(new Set(raw.points.map(point => point.code)));
    expect(ACUPOINT_CATALOG.every(point => point.label_ko && point.reference_url.startsWith("https://www.kmcric.com/database/acupoint/") && point.review_status === "not_reviewed")).toBe(true);
    expect(ACUPOINT_CATALOG.some(point => "x" in point || "diagram_position" in point)).toBe(false);
  });
  it("makes every point reachable by a labeled region", () => {
    const covered = new Set(Object.keys(REGION_LABELS).flatMap(region => regionCandidates(region as BodyRegion, "front").map(point => point.code)));
    expect(covered.size).toBe(361);
    for (const point of ACUPOINT_CATALOG) expect(REGION_LABELS[point.region]).toBeTruthy();
  });
  it("offers head, neck, hand, spine and leg candidates instead of only the ankle routine", () => {
    for (const [region, code] of [["head", "GV20"], ["neck", "GB20"], ["hand", "LI4"], ["lower_back", "BL23"], ["calf", "ST36"], ["elbow", "LI11"], ["wrist", "PC7"]] as const) {
      expect(regionCandidates(region, "back").map(point => point.code)).toContain(code);
    }
    expect(regionCandidates("ankle", "front").map(point => point.code)).toEqual(expect.arrayContaining(["GB40", "BL62", "BL60", "KI3", "KI6", "SP5", "ST41"]));
    expect(regionCandidates("ankle", "front").map(point => point.code)).not.toContain("GB34");
    expect(regionCandidates("knee", "front").map(point => point.code)).toContain("GB34");
  });
  it("searches the full catalog by Korean, Hanja, normalized code and source aliases", () => {
    for (const query of ["합곡", "合谷", "li 4", "LI-4"]) expect(searchAcupoints({region:"ankle",view:"front",scope:"all",query}).map(point => point.code)).toContain("LI4");
    expect(searchAcupoints({region:"ankle",view:"front",query:"합곡"})).toEqual([]);
    expect(searchAcupoints({region:"head",view:"back",scope:"all",query:"복류"}).map(point => point.code)).toContain("KI7");
    expect(getCatalogPoint("LV3")?.code).toBe("LR3");
    expect(getCatalogPoint("SJ5")?.code).toBe("TE5");
    expect(getCatalogPoint("TB5")?.code).toBe("TE5");
  });
  it("retains lateral/head reference entries and labels their actual source view", () => {
    const neck = searchAcupoints({region:"neck",view:"back"});
    const point = neck.find(point => point.code === "GB20")!;
    expect(point.source_view).toBe("lateral");
    expect(sourceViewMatches(point, "back")).toBe(false);
    expect(getCatalogPoint("GV20")?.source_view).toBe("head");
  });
  it("saves midline points as midline and requires an explicit side for bilateral points", () => {
    const center = getCatalogPoint("GV20")!;
    expect(resolvePointLaterality(center,"right")).toBe("midline");
    expect(resolvePointLaterality(center,"not_applicable")).toBe("midline");
    const hand = getCatalogPoint("LI4")!;
    expect(resolvePointLaterality(hand,"midline")).toBeNull();
    expect(resolvePointLaterality(hand,"not_applicable")).toBeNull();
    expect(resolvePointLaterality(hand,"left")).toBe("left");
    expect(resolvePointLaterality(hand,"bilateral")).toBe("bilateral");
  });
});
