import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getCatalogPoint, resolvePointLaterality } from "../tablet/acupoint-catalog";
import { readState, mutateState } from "./store";
import type { TreatmentLocation } from "../types";

test("whole-body catalog codes and per-point sides persist independently for each procedure", async () => {
  const previous = { ...process.env };
  const directory = await mkdtemp(path.join(os.tmpdir(), "hani-catalog-storage-"));
  Object.assign(process.env, { HANI_STORAGE_MODE: "local", HANI_DATA_DIR: directory });
  delete process.env.VERCEL;
  try {
    const initial = await readState();
    const visitId = initial.state.scenario_inputs[0].current_visit_id;
    const locations: TreatmentLocation[] = ["LI4", "GV20", "BL23", "ST36"].map(code => {
      const point = getCatalogPoint(code)!;
      return { location_type: "acupoint", acupoint_code: point.code, label_ko: point.label_ko, body_region: point.region, laterality: resolvePointLaterality(point, "right")!, location_note: "", annotation_id: null, finding_ref: null };
    });
    await mutateState({ type: "treatment.save", payload: { visitId, treatment: { modality: "acupuncture", body_region: "multiple", laterality: "bilateral", locations, acupoints: locations.map(item => ({ code: item.acupoint_code!, label_ko: item.label_ko! })), status: "suggested" } } });
    await mutateState({ type: "treatment.save", payload: { visitId, treatment: { modality: "pharmacopuncture", body_region: "hand", laterality: "left", locations: [{ ...locations[0], laterality: "left" }], acupoints: [{ code: "LI4", label_ko: "합곡" }], status: "suggested" } } });
    const reloaded = await readState();
    const needle = reloaded.state.treatments.find(item => item.visit_id === visitId && item.modality === "acupuncture")!;
    const pharma = reloaded.state.treatments.find(item => item.visit_id === visitId && item.modality === "pharmacopuncture")!;
    assert.deepEqual(needle.locations, locations);
    assert.equal(needle.locations?.find(item => item.acupoint_code === "GV20")?.laterality, "midline");
    assert.equal(pharma.locations?.[0].laterality, "left");
    assert.equal(needle.locations?.[0].laterality, "right");
    assert.equal(needle.status, "suggested");
    assert.equal(reloaded.state.visits.find(item => item.id === visitId)?.workflow_status, "waiting");
  } finally {
    process.env = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
