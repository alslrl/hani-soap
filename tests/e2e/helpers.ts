import { expect, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import type { ActionRequest, StateEnvelope } from "../../src/lib/types";

export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const origin = new URL(baseURL).origin;
export const pin = process.env.HANI_TEST_PIN ?? "1234";

export async function unlock(request: APIRequestContext) {
  const result = await request.post("/api/access/unlock", {
    headers: { Origin: origin },
    data: { pin },
  });
  expect(result.status(), await result.text()).toBe(200);
}

export async function readState(request: APIRequestContext): Promise<StateEnvelope> {
  const response = await request.get("/api/state");
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<StateEnvelope>;
}

export async function localDemo(page: Page): Promise<StateEnvelope> {
  // Even if someone overrides the base URL, never mutate a cloud-backed store.
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL).hostname);
  await unlock(page.request);
  const envelope = await readState(page.request);
  expect(envelope.storage, "Run E2E against an isolated local HANI_DATA_DIR").toBe("local");
  expect(envelope.state.meta.is_demo).toBe(true);
  expect(envelope.state.patients).toHaveLength(2);
  return envelope;
}

export async function action(request: APIRequestContext, type: string, payload: Record<string, unknown>): Promise<StateEnvelope> {
  const response = await request.post("/api/actions", {
    headers: { Origin: origin },
    data: { type, payload } satisfies ActionRequest,
  });
  expect(response.status(), `${type}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<StateEnvelope>;
}

export function scenario(envelope: StateEnvelope, demoKey: "A" | "B") {
  const entry = envelope.state.scenario_inputs.find((item) => item.demo_key === demoKey);
  expect(entry, `Scenario ${demoKey} exists`).toBeTruthy();
  return entry!;
}

export async function waitForVisit(page: Page, visitId: string, status: string, recordStatus?: string) {
  await expect.poll(async () => {
    const current = await readState(page.request);
    const visit = current.state.visits.find((item) => item.id === visitId);
    return { status: visit?.workflow_status, ...(recordStatus ? { recordStatus: visit?.record_status } : {}) };
  }).toEqual({ status, ...(recordStatus ? { recordStatus } : {}) });
}

export async function chooseSelect(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  await page.getByRole("option").filter({ visible: true }).locator(`xpath=self::*[@data-option-value=${JSON.stringify(value)}]`).click();
}
