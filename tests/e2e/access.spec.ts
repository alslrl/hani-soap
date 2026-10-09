import { expect, test } from "@playwright/test";
import { origin, pin } from "./helpers";

test("the PIN gate protects both pages and APIs", async ({ page }) => {
  const state = await page.request.get("/api/state");
  expect(state.status()).toBe(401);

  const mutation = await page.request.post("/api/actions", {
    headers: { Origin: origin },
    data: { type: "visit.start", payload: { visitId: "unauthenticated" } },
  });
  expect(mutation.status()).toBe(401);

  await page.goto("/clinic");
  await expect(page).toHaveURL(/\/access(?:\?|$)/);

  const wrongPin = await page.request.post("/api/access/unlock", {
    headers: { Origin: origin },
    data: { pin: pin === "9999" ? "9998" : "9999" },
  });
  expect(wrongPin.status()).toBe(401);
  expect((await page.request.get("/api/state")).status()).toBe(401);

  const foreignOrigin = await page.request.post("/api/access/unlock", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { pin },
  });
  expect(foreignOrigin.status()).toBe(403);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});

test("unlock creates an HttpOnly session and rejects foreign-origin mutations", async ({ page }) => {
  await page.goto("/access");
  await page.getByLabel("접근 PIN").fill(pin);
  await expect(page.getByRole("button", { name: "진료실 입장" })).toBeEnabled();
  await page.getByRole("button", { name: "진료실 입장" }).click();
  await expect(page).toHaveURL(/\/clinic$/);
  await expect(page.getByRole("heading", { name: /오늘 환자/ })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.httpOnly && cookie.sameSite !== "None")).toBe(true);
  expect((await page.request.get("/api/state")).status()).toBe(200);

  const mutation = await page.request.post("/api/actions", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { type: "visit.start", payload: { visitId: "foreign-origin" } },
  });
  expect(mutation.status()).toBe(403);

  await page.getByRole("button", { name: "잠금", exact: true }).click();
  await expect(page).toHaveURL(/\/access$/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});
