import { describe, expect, it } from "vitest";
import { isInsideAnatomyBody, mapBodyRegion } from "./regions";

describe("female anatomy uses its own registered silhouette", () => {
  it("locates the female ankles with front/back patient laterality", () => {
    expect(mapBodyRegion({x:419,y:894},"front","body-map-v3-female")).toMatchObject({region:"ankle",laterality:"right"});
    expect(mapBodyRegion({x:580,y:894},"back","body-map-v3-female")).toMatchObject({region:"ankle",laterality:"right"});
    expect(mapBodyRegion({x:419,y:894},"back","body-map-v3-female")).toMatchObject({region:"ankle",laterality:"left"});
  });
  it("does not reuse the male ankle outline or move old marks onto the new image", () => {
    expect(isInsideAnatomyBody({x:446,y:894},"front","body-map-v2")).toBe(true);
    expect(isInsideAnatomyBody({x:446,y:894},"front","body-map-v3-female")).toBe(false);
    expect(mapBodyRegion({x:500,y:800},"front","body-map-v3-female")).toBeNull();
    expect(mapBodyRegion({x:100,y:450},"front","body-map-v3-female")).toBeNull();
  });
  it("follows female hands and torso in their different pose", () => {
    expect(mapBodyRegion({x:280,y:500},"front","body-map-v3-female")).toMatchObject({region:"hand",laterality:"right"});
    expect(mapBodyRegion({x:315,y:440},"front","body-map-v3-female")).toMatchObject({region:"forearm",laterality:"right"});
    expect(mapBodyRegion({x:500,y:440},"back","body-map-v3-female")).toMatchObject({region:"lower_back",laterality:"midline"});
  });
});
