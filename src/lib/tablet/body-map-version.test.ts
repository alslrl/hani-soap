import { describe, expect, it } from "vitest";
import { bodyMapVersionForVisit } from "./body-map-version";

describe("body map version selection preserves stored coordinate frames", () => {
  it("uses the new anatomy rendering only for a fresh visit or an existing v2 visit", () => {
    expect(bodyMapVersionForVisit([], "new-visit")).toBe("body-map-v2");
    expect(bodyMapVersionForVisit([{ visit_id: "new-visit", coordinate_version: "body-map-v2" }], "new-visit")).toBe("body-map-v2");
  });
  it("keeps all new layers in a visit on v1 when any old layer was saved", () => {
    expect(bodyMapVersionForVisit([{ visit_id: "old-visit", coordinate_version: "body-map-v1" }], "old-visit")).toBe("body-map-v1");
  });
  it("does not carry another visit's old anatomy version into a new visit", () => {
    expect(bodyMapVersionForVisit([{ visit_id: "old-visit", coordinate_version: "body-map-v1" }], "new-visit")).toBe("body-map-v2");
  });
  it("refuses a mixed-version visit instead of drawing either set of marks on the wrong body", () => {
    expect(() => bodyMapVersionForVisit([{ visit_id: "mixed", coordinate_version: "body-map-v1" }, { visit_id: "mixed", coordinate_version: "body-map-v2" }], "mixed")).toThrow("서로 다른");
  });
  it("does not guess a coordinate frame for an unsupported saved version", () => {
    expect(() => bodyMapVersionForVisit([{ visit_id: "future-visit", coordinate_version: "body-map-v9" }], "future-visit")).toThrow("도해 버전");
  });
});
