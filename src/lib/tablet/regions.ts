import type { InkPoint } from "./geometry";
import type { BodyMapVersion } from "./body-map-version";
import { searchAcupoints, type CatalogPoint } from "./acupoint-catalog";
import bodySilhouettes from "../../../data/anatomy/body-map-v2-silhouette.json";
import femaleSilhouettes from "../../../data/anatomy/body-map-v3-female-silhouette.json";

export type BodyView = "front" | "back";
export type Laterality = "left" | "right" | "bilateral" | "midline" | "not_applicable";
export type BodyRegion = "head" | "face" | "neck" | "shoulder" | "axilla" | "upper_arm" | "elbow" | "forearm" | "wrist" | "hand" | "chest" | "upper_back" | "abdomen" | "upper_abdomen" | "lower_abdomen" | "lateral_abdomen" | "lower_back" | "sacrum" | "hip" | "buttock" | "groin" | "perineum" | "thigh" | "knee" | "calf" | "ankle" | "foot";
export type RegionMatch = { region: BodyRegion; laterality: Laterality; anchor: InkPoint; view: BodyView; selectionSource?: "gesture" | "catalog" };
export const REGION_LABELS: Record<BodyRegion, string> = {
  head: "머리", face: "얼굴", neck: "목", shoulder: "어깨", axilla: "겨드랑", upper_arm: "위팔", elbow: "팔꿈치", forearm: "아래팔", wrist: "손목", hand: "손", chest: "가슴", upper_back: "등", abdomen: "복부 전체", upper_abdomen: "윗배", lower_abdomen: "아랫배", lateral_abdomen: "옆배", lower_back: "허리", sacrum: "엉치", hip: "골반 전체", buttock: "엉덩이", groin: "서혜부", perineum: "회음", thigh: "허벅지", knee: "무릎", calf: "종아리", ankle: "발목", foot: "발등·발",
};
export const SIDE_LABELS: Record<Laterality, string> = { left: "좌측", right: "우측", bilateral: "양측", midline: "정중선", not_applicable: "해당 없음" };

/** Self-drawn diagram regions are input hit areas, not acupoint coordinates. */
function mapLegacyBodyRegion(anchor: InkPoint, view: BodyView): RegionMatch | null {
  const { x, y } = anchor;
  let region: BodyRegion | null = null;
  const inBox = (l: number, r: number, top: number, bottom: number) => x >= l && x <= r && y >= top && y <= bottom;
  if (inBox(449, 551, 42, 147) && Math.hypot((x - 500) / 51, (y - 95) / 53) <= 1) region = "head";
  else if (inBox(469, 531, 145, 187)) region = "neck";
  else if (inBox(377, 623, 183, 239)) region = "shoulder";
  else if (inBox(324, 410, 239, 365) || inBox(590, 676, 239, 365)) region = "upper_arm";
  else if (inBox(272, 369, 365, 526) || inBox(631, 728, 365, 526)) region = "forearm";
  else if (inBox(242, 326, 526, 603) || inBox(674, 758, 526, 603)) region = "hand";
  else if (inBox(412, 588, 239, 365)) region = view === "front" ? "chest" : "upper_back";
  else if (inBox(422, 578, 365, 486)) region = view === "front" ? "abdomen" : "lower_back";
  else if (inBox(406, 594, 486, 557)) region = "hip";
  else if (inBox(407, 487, 557, 691) || inBox(513, 593, 557, 691)) region = "thigh";
  else if (inBox(410, 482, 691, 751) || inBox(518, 590, 691, 751)) region = "knee";
  else if (inBox(418, 482, 751, 850) || inBox(518, 582, 751, 850)) region = "calf";
  else if (inBox(426, 478, 850, 904) || inBox(522, 574, 850, 904)) region = "ankle";
  else if (inBox(387, 480, 904, 963) || inBox(520, 613, 904, 963)) region = "foot";
  if (!region) return null;
  const laterality: Laterality = Math.abs(x - 500) < 19 ? "midline" : (view === "front" ? x < 500 : x > 500) ? "right" : "left";
  return { region, laterality, anchor, view };
}

/** Pixel registration is generated from the same PNGs displayed at 0,0,1000,1000. */
export function isInsideAnatomyBody(anchor: InkPoint, view: BodyView, version: BodyMapVersion = "body-map-v2"): boolean {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.x >= 1000 || anchor.y < 0 || anchor.y >= 1000) return false;
  const silhouettes = version === "body-map-v3-female" ? femaleSilhouettes : bodySilhouettes;
  const row = silhouettes[view][Math.floor(anchor.y)];
  const x = Math.floor(anchor.x);
  return row.some(([left, right]) => x >= left && x <= right);
}

/** Region bands identify user-confirmable areas, never precise acupoint positions. */
function mapAnatomyBodyRegion(anchor: InkPoint, view: BodyView, version: BodyMapVersion): RegionMatch | null {
  if (!isInsideAnatomyBody(anchor, view, version)) return null;
  const { x, y } = anchor;
  const fromMidline = Math.abs(x - 500);
  const wristY = version === "body-map-v3-female" ? 480 : 520;
  const handBottomY = version === "body-map-v3-female" ? 565 : 600;
  let region: BodyRegion;
  if (y < 148) region = "head";
  else if (y < 190 && fromMidline < 55) region = "neck";
  else if (y < 240 && fromMidline > 82) region = "shoulder";
  else if (y < 400 && fromMidline > 93) region = "upper_arm";
  else if (y >= 400 && y < wristY && fromMidline > 98) region = "forearm";
  else if (y >= wristY && y < handBottomY && fromMidline > 116) region = "hand";
  else if (y < 375) region = view === "front" ? "chest" : "upper_back";
  else if (y < 495) region = view === "front" ? "abdomen" : "lower_back";
  else if (y < 595) region = "hip";
  else if (y < 695) region = "thigh";
  else if (y < 755) region = "knee";
  else if (y < 865) region = "calf";
  else if (y < 920) region = "ankle";
  else region = "foot";
  const laterality: Laterality = fromMidline < 19 ? "midline" : (view === "front" ? x < 500 : x > 500) ? "right" : "left";
  return { region, laterality, anchor, view };
}

export function mapBodyRegion(anchor: InkPoint, view: BodyView, version: BodyMapVersion = "body-map-v1"): RegionMatch | null {
  return version === "body-map-v1" ? mapLegacyBodyRegion(anchor, view) : mapAnatomyBodyRegion(anchor, view, version);
}

export type AcupointCandidate = { code: string; label_ko: string; regions: BodyRegion[]; views: BodyView[]; area: "outer" | "inner" | "front" | "back" };
// Only the 16 names/codes chosen in the reviewed ankle demo reference are listed.
// No coordinates are assigned, and no item is a treatment recommendation.
export const ANKLE_CANDIDATES: AcupointCandidate[] = [
  { code: "GB40", label_ko: "구허", regions: ["ankle"], views: ["front", "back"], area: "outer" },
  { code: "BL62", label_ko: "신맥", regions: ["ankle"], views: ["front", "back"], area: "outer" },
  { code: "BL60", label_ko: "곤륜", regions: ["ankle"], views: ["front", "back"], area: "back" },
  { code: "GB39", label_ko: "현종", regions: ["calf"], views: ["front", "back"], area: "outer" },
  { code: "GB34", label_ko: "양릉천", regions: ["knee"], views: ["front", "back"], area: "outer" },
  { code: "KI3", label_ko: "태계", regions: ["ankle"], views: ["front", "back"], area: "inner" },
  { code: "KI6", label_ko: "조해", regions: ["ankle"], views: ["front", "back"], area: "inner" },
  { code: "SP5", label_ko: "상구", regions: ["ankle"], views: ["front", "back"], area: "inner" },
  { code: "SP6", label_ko: "삼음교", regions: ["calf"], views: ["front", "back"], area: "inner" },
  { code: "ST41", label_ko: "해계", regions: ["ankle"], views: ["front"], area: "front" },
  { code: "ST42", label_ko: "충양", regions: ["foot"], views: ["front"], area: "front" },
  { code: "LR3", label_ko: "태충", regions: ["foot"], views: ["front"], area: "front" },
  { code: "ST43", label_ko: "함곡", regions: ["foot"], views: ["front"], area: "front" },
  { code: "KI7", label_ko: "부류(복류)", regions: ["calf"], views: ["front", "back"], area: "inner" },
  { code: "BL57", label_ko: "승산", regions: ["calf"], views: ["back"], area: "back" },
  { code: "BL56", label_ko: "승근", regions: ["calf"], views: ["back"], area: "back" },
];

export function regionCandidates(region: BodyRegion, view: BodyView): CatalogPoint[] {
  return searchAcupoints({ region, view });
}

export const PROCEDURES = [
  { key: "needle", label: "침", modality: "acupuncture", technique: "standard_acupuncture" },
  { key: "knife", label: "도침", modality: "acupuncture", technique: "needle_knife" },
  { key: "pharma", label: "약침", modality: "pharmacopuncture", technique: null },
  { key: "moxa", label: "뜸", modality: "moxibustion", technique: null },
  { key: "cupping", label: "부항", modality: "cupping", technique: null },
  { key: "tuina", label: "추나", modality: "tuina", technique: null },
] as const;
export type ProcedureKey = typeof PROCEDURES[number]["key"];
