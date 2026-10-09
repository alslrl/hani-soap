import { describe, expect, it } from "vitest";
import { BODY_MAP_VERSIONS, preferredBodyMapVersionForSex, historicalBodyMapVersions, isBodyMapVersion } from "./body-map-version";

describe("preferred anatomy and separately retained historical frames", () => {
  it("chooses the female frame for a female patient, without inheriting her older drawing", () => {
    expect(preferredBodyMapVersionForSex("female")).toBe("body-map-v3-female");
    expect(preferredBodyMapVersionForSex("male")).toBe("body-map-v2");
    expect(preferredBodyMapVersionForSex("unspecified")).toBe("body-map-v2");
  });
  it("retains both legacy and male historical documents separately for a female patient", () => {
    const annotations = [
      { visit_id: "A", coordinate_version: "body-map-v1" },
      { visit_id: "A", coordinate_version: "body-map-v1" },
      { visit_id: "A", coordinate_version: "body-map-v2" },
      { visit_id: "A", coordinate_version: "body-map-v3-female" },
    ];
    expect(historicalBodyMapVersions(annotations, "A", preferredBodyMapVersionForSex("female"))).toEqual(["body-map-v1", "body-map-v2"]);
    expect(annotations).toHaveLength(4);
    expect(annotations[0].coordinate_version).toBe("body-map-v1");
  });
  it("does not expose another visit's historical frames", () => {
    expect(historicalBodyMapVersions([{ visit_id: "A", coordinate_version: "body-map-v1" }], "B", "body-map-v2")).toEqual([]);
  });
  it("limits selectable frames to the registered drawings", () => {
    expect(BODY_MAP_VERSIONS).toEqual(["body-map-v1", "body-map-v2", "body-map-v3-female"]);
    expect(isBodyMapVersion("body-map-v3-female")).toBe(true);
    expect(isBodyMapVersion("body-map-v9")).toBe(false);
  });
});
