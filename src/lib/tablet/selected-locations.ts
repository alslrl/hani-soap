import type { TreatmentLocation } from "@/lib/types";
import { getCatalogPoint } from "./acupoint-catalog";
import { acupointReferenceDots, type ReferenceDot } from "./acupoint-reference";
import type { BodyMapVersion } from "./body-map-version";
import type { BodyView } from "./regions";

export type SelectedLocationDisplay = {
  index: number;
  number: number;
  location: TreatmentLocation;
  dots: Record<BodyView, readonly ReferenceDot[]>;
  views: BodyView[];
  unavailable: string | null;
};

/** Derive display feedback from saved selections; never write candidate coordinates into clinical records. */
export function selectedLocationDisplays(
  locations: readonly TreatmentLocation[],
  version: BodyMapVersion,
  annotationVersions: Readonly<Record<string, string>>,
): SelectedLocationDisplay[] {
  const references = { front: acupointReferenceDots(version, "front"), back: acupointReferenceDots(version, "back") };
  return locations.map((location, index) => {
    const sourceVersion = location.annotation_id ? annotationVersions[location.annotation_id] : undefined;
    const previousFrame = Boolean(sourceVersion && sourceVersion !== version);
    const point = location.location_type === "acupoint" && location.acupoint_code ? getCatalogPoint(location.acupoint_code) : undefined;
    const onSide = (dot: ReferenceDot) => dot.code === point?.code && (
      location.laterality === "bilateral" ? dot.side === "left" || dot.side === "right" : dot.side === location.laterality
    );
    const dots = {
      front: previousFrame ? [] : references.front.filter(onSide),
      back: previousFrame ? [] : references.back.filter(onSide),
    };
    const views = (["front", "back"] as const).filter(view => dots[view].length > 0);
    const unavailable = views.length ? null : previousFrame ? "이전 도해 기록" : location.location_type !== "acupoint" ? "위치 설명은 기록에서 확인" : "앞·뒷면 위치 표시 없음";
    return { index, number: index + 1, location, dots, views, unavailable };
  });
}
