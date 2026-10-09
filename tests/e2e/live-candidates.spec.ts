import { expect, test } from "@playwright/test";
import { localDemo, origin, readState, scenario } from "./helpers";

test("live procedure context reaches both screens without switching tabs or confirming treatment", async ({ page, context }) => {
  const initial = await localDemo(page);
  const { current_visit_id: visitId } = scenario(initial, "B");
  const beforeTreatmentIds = new Set(initial.state.treatments.filter((item) => item.visit_id === visitId).map((item) => item.id));
  await page.goto(`/tablet/visits/${visitId}`);
  await expect(page.getByRole("tab", { name: /^침/ })).toHaveAttribute("aria-selected", "true");
  const pc = await context.newPage();
  await pc.goto(`/clinic/visits/${visitId}`);
  await expect(pc.getByLabel("S 증상·경과")).toBeVisible();

  // This endpoint only persists explicit test text and runs the local detector.
  // It does not request a microphone, ephemeral OpenAI token or model call.
  const started = await page.request.post("/api/audio/sessions", {
    headers: { Origin: origin }, data: { visitId },
  });
  expect(started.status(), await started.text()).toBe(200);
  const { audioSessionId } = await started.json() as { audioSessionId: string };
  try {
    const text = "오늘 약침을 합니다. 지난번 침을 맞았어요. 도침은 하지 않을게요.";
    const result = await page.request.post("/api/realtime/events", {
      headers: { Origin: origin },
      data: { visitId, audioSessionId, itemId: `e2e:${Date.now()}`, ordinal: 0, text },
    });
    expect(result.status(), await result.text()).toBe(200);
    const current = await readState(page.request);
    const events = current.state.live_events.filter((item) => item.audio_session_id === audioSessionId);
    expect(events).toHaveLength(3);
    expect(events.map((item) => [item.modality, item.technique, item.context])).toEqual([
      ["pharmacopuncture", null, "current"],
      ["acupuncture", "standard_acupuncture", "past"],
      ["acupuncture", "needle_knife", "negated"],
    ]);
    expect(events.every((item) => item.status === "suggested")).toBe(true);
    expect(current.state.treatments.filter((item) => item.visit_id === visitId).map((item) => item.id)).toEqual([...beforeTreatmentIds]);

    await expect(page.getByText("PC에서 녹음 중", { exact: true })).toBeVisible();
    await expect(page.locator(".tablet-live-candidates")).toContainText("오늘 약침을 합니다");
    await expect(page.getByRole("tab", { name: /^침/ })).toHaveAttribute("aria-selected", "true");
    const past = pc.locator(".hs-live-candidates > div").filter({ hasText: "지난번 침을 맞았어요" });
    const negated = pc.locator(".hs-live-candidates > div").filter({ hasText: "도침은 하지 않을게요" });
    await expect(past).toContainText("과거 발화");
    await expect(negated).toContainText("시행하지 않는 발화");
    await expect(past.getByRole("button", { name: "시술 후보에 추가" })).toHaveCount(0);
    await expect(negated.getByRole("button", { name: "시술 후보에 추가" })).toHaveCount(0);

    const present = pc.locator(".hs-live-candidates > div").filter({ hasText: "오늘 약침을 합니다" });
    await present.getByRole("button", { name: "시술 후보에 추가", exact: true }).click();
    await expect.poll(async () => (await readState(page.request)).state.live_events.find((item) => item.id === events[0].id)?.status).toBe("accepted");
    const accepted = await readState(page.request);
    const added = accepted.state.treatments.filter((item) => item.visit_id === visitId && !beforeTreatmentIds.has(item.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ modality: "pharmacopuncture", technique: null, status: "suggested", source: "realtime_candidate" });
    expect(added[0].acupoints).toHaveLength(0);
    await expect(page.getByRole("tab", { name: /^침/ })).toHaveAttribute("aria-selected", "true");
  } finally {
    const stopped = await page.request.post("/api/audio/sessions", {
      headers: { Origin: origin }, data: { visitId, audioSessionId, action: "stop" },
    });
    expect(stopped.status(), await stopped.text()).toBe(200);
    await pc.close();
  }
  const stoppedState = await readState(page.request);
  expect(stoppedState.state.visits.find((item) => item.id === visitId)?.workflow_status).toBe("in_progress");
  await expect(page.getByText("PC 녹음 대기", { exact: true })).toBeVisible();
});
