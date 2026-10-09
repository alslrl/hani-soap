/** Coordinate versions name a specific body drawing, not just the canvas size. */
export type BodyMapVersion = "body-map-v1" | "body-map-v2";
export const CURRENT_BODY_MAP_VERSION: BodyMapVersion = "body-map-v2";

type VersionedAnnotation = { visit_id: string; coordinate_version: string };

export function bodyMapVersionForVisit(annotations: readonly VersionedAnnotation[], visitId: string): BodyMapVersion {
  const existing = annotations.filter(annotation => annotation.visit_id === visitId);
  if (existing.some(annotation => annotation.coordinate_version !== "body-map-v1" && annotation.coordinate_version !== "body-map-v2")) {
    throw new Error("이 방문의 인체 도해 버전을 확인할 수 없습니다. 원본 기록을 보존했습니다.");
  }
  if (new Set(existing.map(annotation => annotation.coordinate_version)).size > 1) {
    throw new Error("이 방문에 서로 다른 인체 도해 버전이 있습니다. 원본 기록을 확인해 주세요.");
  }
  // Even an empty saved layer establishes a coordinate frame for its visit.
  // A change in drawing must never silently relocate stored marks.
  return existing.some(annotation => annotation.coordinate_version === "body-map-v1") ? "body-map-v1" : CURRENT_BODY_MAP_VERSION;
}
