import { expect, test } from "@playwright/test";
import { localDemo, readState, scenario } from "./helpers";

test("existing care history supports manual responses and explicit contact resolution", async ({ page }) => {
  const initial = await localDemo(page);
  const { patient_id: patientId } = scenario(initial, "A");
  const patient = initial.state.patients.find((item) => item.id === patientId)!;
  const previousResponseIds = new Set(initial.state.care_responses.map((item) => item.id));
  const existingOpenContacts = initial.state.contact_tasks.filter((item) => item.status === "open").map((item) => item.id);

  await page.goto("/clinic/care");
  await expect(page.getByRole("heading", { name: "고객 케어", exact: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: patient.display_name }).first().click();
  const message = initial.state.care_messages.find((item) => item.patient_id === patientId && item.status === "sent" && item.delivery_mode === "mock" && item.stage === "day3")!;
  expect(message).toBeTruthy();
  await page.getByLabel("확인할 안내").selectOption(message.id);
  await expect(page.getByRole("button", { name: "승인 문안 모의 발송", exact: true })).toHaveCount(0);
  await page.getByLabel("환자 응답").selectOption("discomfort");
  await expect(page.getByLabel("불편 상세 선택")).toHaveValue("");
  await page.getByRole("button", { name: "응답 기록", exact: true }).click();

  await expect.poll(async () => {
    const current = await readState(page.request);
    return current.state.care_responses.filter((item) => !previousResponseIds.has(item.id) && item.message_id === message.id && item.option === "discomfort").length;
  }).toBe(1);
  const discomfort = await readState(page.request);
  const response = discomfort.state.care_responses.find((item) => !previousResponseIds.has(item.id) && item.message_id === message.id && item.option === "discomfort")!;
  expect(response.detail).toBeNull();
  const task = discomfort.state.contact_tasks.find((item) => item.response_id === response.id)!;
  expect(task?.status).toBe("open");
  const taskRow = page.locator(`[data-contact-id="${task.id}"]`);
  await expect(taskRow.getByText("연락 필요", { exact: true })).toBeVisible();

  // A reassuring later response must not silently dispose of the earlier work.
  await page.getByLabel("환자 응답").selectOption("taking_well");
  await page.getByRole("button", { name: "응답 기록", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.care_responses.length).toBe(discomfort.state.care_responses.length + 1);
  expect((await readState(page.request)).state.contact_tasks.find((item) => item.id === task.id)?.status).toBe("open");
  await page.reload();
  await expect(taskRow.getByText("연락 필요", { exact: true })).toBeVisible();

  const note = `연락 결과: 현재 상태와 후속 조치를 직접 확인함 ${Date.now()}`;
  await taskRow.getByLabel("연락 결과").fill(note);
  await taskRow.getByRole("button", { name: "연락 완료 처리", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.contact_tasks.find((item) => item.id === task.id)?.status).toBe("closed");
  await page.reload();
  await expect(taskRow.getByText("연락 완료", { exact: true })).toBeVisible();
  await expect(taskRow.getByText(note, { exact: false })).toBeVisible();
  const final = await readState(page.request);
  expect(final.state.contact_tasks.find((item) => item.id === task.id)?.resolution_note).toBe(note);
  expect(final.state.care_messages.find((item) => item.id === message.id)?.approved_body).toBe(message.approved_body);
  for (const contactId of existingOpenContacts) {
    expect(final.state.contact_tasks.find((item) => item.id === contactId)?.status).toBe("open");
  }
});
