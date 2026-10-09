import registration from "../../../data/anatomy/acupoint-reference-overlay.json";
import type { BodyMapVersion } from "./body-map-version";
import type { BodyView } from "./regions";

export type ReferenceDot = {
  code: string;
  side: string;
  region: string;
  x: number;
  y: number;
  source_view: string;
};
const NO_DOTS: readonly ReferenceDot[] = [];

/** Display only. Never use these candidates for hit-testing, selection or storage. */
export function acupointReferenceDots(version: BodyMapVersion, view: BodyView): readonly ReferenceDot[] {
  if (version === "body-map-v1") return NO_DOTS;
  return registration.profiles[version][view];
}
