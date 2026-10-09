/** Each version permanently names one registered drawing and its stored ink plane. */
export const BODY_MAP_VERSIONS = ["body-map-v1", "body-map-v2", "body-map-v3-female"] as const;
export type BodyMapVersion = typeof BODY_MAP_VERSIONS[number];
export const CURRENT_BODY_MAP_VERSION: BodyMapVersion = "body-map-v2";

type VersionedAnnotation = { visit_id: string; coordinate_version: string };
export const BODY_MAP_LABELS: Record<BodyMapVersion, string> = {
  "body-map-v1": "이전 기본 도해", "body-map-v2": "남성 인체 도해", "body-map-v3-female": "여성 인체 도해",
};
export function isBodyMapVersion(version: string): version is BodyMapVersion {
  return (BODY_MAP_VERSIONS as readonly string[]).includes(version);
}
export function preferredBodyMapVersionForSex(sex: "female" | "male" | "unspecified"): BodyMapVersion {
  return sex === "female" ? "body-map-v3-female" : "body-map-v2";
}
export function historicalBodyMapVersions(annotations: readonly VersionedAnnotation[], visitId: string, preferred: BodyMapVersion): BodyMapVersion[] {
  const versions = new Set(annotations.filter(annotation => annotation.visit_id === visitId).map(annotation => annotation.coordinate_version));
  return BODY_MAP_VERSIONS.filter(version => version !== preferred && versions.has(version));
}
