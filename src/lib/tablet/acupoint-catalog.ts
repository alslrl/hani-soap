import data from "../../../data/acupoints/tablet-catalog.json";
import type { BodyRegion, BodyView, Laterality } from "./regions";

export type CatalogView = "anterior" | "posterior" | "lateral" | "head";
export type CatalogPoint = {
  code: string; label_ko: string; hanja: string; meridian: string; meridian_label: string;
  region: BodyRegion; regions: BodyRegion[]; source_region: string; source_region_label: string;
  source_view: CatalogView; laterality: "bilateral" | "midline";
  review_status: string; reference_url: string; aliases: string[];
};
export const CATALOG_VIEW_LABELS: Record<CatalogView, string> = { anterior: "앞면 자료", posterior: "뒷면 자료", lateral: "옆면 자료", head: "머리 자료" };
const routineRegions: Record<string, BodyRegion> = {
  GB40: "ankle", BL62: "ankle", BL60: "ankle", KI3: "ankle", KI6: "ankle", SP5: "ankle", ST41: "ankle",
  GB34: "knee", GB39: "calf", SP6: "calf", KI7: "calf", BL57: "calf", BL56: "calf", ST42: "foot", LR3: "foot", ST43: "foot",
};
const normalize = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[\s\-·()]/g, "");

export const ACUPOINT_CATALOG: CatalogPoint[] = data.points.map(point => {
  const region = (point.source_region === "lower_leg" ? "calf" : point.source_region) as BodyRegion;
  // Preserve the existing ankle routine as an additional lookup group, without
  // rewriting the upstream first-clause region classification.
  const regions: BodyRegion[] = routineRegions[point.code] ? [...new Set<BodyRegion>([region, routineRegions[point.code]])] : [region];
  return { ...point, region, regions, source_view: point.source_view as CatalogView, laterality: point.laterality as CatalogPoint["laterality"], aliases: point.code === "KI7" ? ["복류"] : [] };
});
const byCode = new Map(ACUPOINT_CATALOG.map(point => [point.code, point]));
const groups: Partial<Record<BodyRegion, BodyRegion[]>> = {
  head: ["head", "face"], abdomen: ["upper_abdomen", "lower_abdomen", "lateral_abdomen"],
  hip: ["buttock", "groin", "sacrum", "perineum"], hand: ["hand", "wrist"],
  forearm: ["forearm", "elbow", "wrist"], chest: ["chest", "axilla"], lower_back: ["lower_back", "sacrum"],
  upper_arm: ["upper_arm", "elbow", "axilla"], shoulder: ["shoulder", "axilla"],
};

export function getCatalogPoint(code: string): CatalogPoint | undefined { return byCode.get(normalize(code).replace(/^LV(?=\d)/, "LR").replace(/^(SJ|TB)(?=\d)/, "TE")); }
export function isPointInRegion(point: CatalogPoint, region: BodyRegion): boolean {
  const accepted = groups[region] || [region];
  return point.regions.some(value => accepted.includes(value));
}
export function sourceViewMatches(point: CatalogPoint, view: BodyView): boolean {
  return point.source_view === (view === "front" ? "anterior" : "posterior");
}
export function searchAcupoints({ region, view, query = "", scope = "region" }: { region: BodyRegion; view: BodyView; query?: string; scope?: "region" | "all" }): CatalogPoint[] {
  const q = normalize(query).replace(/^(LV)(?=\d)/, "LR").replace(/^(SJ|TB)(?=\d)/, "TE");
  return ACUPOINT_CATALOG.filter(point => (scope === "all" || isPointInRegion(point, region)) && (!q || [point.code, point.label_ko, point.hanja, point.meridian_label, point.source_region_label, ...point.aliases].some(value => normalize(value).includes(q))))
    .sort((a, b) => Number(!sourceViewMatches(a, view)) - Number(!sourceViewMatches(b, view)) || a.meridian.localeCompare(b.meridian) || Number(a.code.match(/\d+/)?.[0]) - Number(b.code.match(/\d+/)?.[0]));
}
/** A midline point never inherits a left/right selection from the checked area. */
export function resolvePointLaterality(point: CatalogPoint, selected: Laterality): Laterality | null {
  if (point.laterality === "midline") return "midline";
  return selected === "left" || selected === "right" || selected === "bilateral" ? selected : null;
}
