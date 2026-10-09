import { expect, test } from "@playwright/test";
import { localDemo, readState, scenario , chooseSelect } from "./helpers";

test("reviewed mock instructions lead to responses and contact work that needs explicit resolution", async ({ page }) => {
  const initial = await localDemo(page);
  const { patient_id: patientId } = scenario(initial, "A");
  const patient = initial.state.patients.find((item) => item.id === patientId)!;
  const previousResponseIds = new Set(initial.state.care_responses.map((item) => item.id));
  const existingOpenContacts = initial.state.contact_tasks.filter((item) => item.status === "open").map((item) => item.id);

  await page.goto("/clinic/care");
  await expect(page.getByRole("heading", { name: "고객 케어", exact: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: patient.display_name }).first().click();
  await page.getByRole("button", { name: "＋ 새 안내", exact: true }).click();
  const body = `진료 후 상태를 살펴보고 불편한 점을 알려주세요. 모의 안내 ${Date.now()}`;
  await page.getByLabel("안내문 초안").fill(body);
  await expect(page.getByRole("combobox", { name: "기준 진료" })).not.toHaveAttribute("data-value", "");
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.care_messages.some((item) => item.patient_id === patientId && item.draft_body === body && item.status === "draft")).toBe(true);
  const saved = await readState(page.request);
  const message = saved.state.care_messages.find((item) => item.patient_id === patientId && item.draft_body === body)!;
  expect(message.approved_body).toBeNull();
  await page.getByRole("button", { name: "문안 승인", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.care_messages.find((item) => item.id === message.id)?.status).toBe("approved");
  await page.getByRole("button", { name: "승인 문안 모의 발송", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.care_messages.find((item) => item.id === message.id)?.status).toBe("sent");
  const sent = (await readState(page.request)).state.care_messages.find((item) => item.id === message.id)!;
  expect(sent.approved_body).toBe(body);
  expect(sent.delivery_mode).toBe("mock");
  await chooseSelect(page, page.getByRole("combobox", { name: "모의 환자 응답" }), "discomfort");
  await expect(page.getByRole("combobox", { name: "불편 상세 선택" })).toHaveAttribute("data-value", "");
  await page.getByRole("button", { name: "모의 응답 기록", exact: true }).click();

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
  await chooseSelect(page, page.getByRole("combobox", { name: "모의 환자 응답" }), "taking_well");
  await page.getByRole("button", { name: "모의 응답 기록", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.care_responses.length).toBe(discomfort.state.care_responses.length + 1);
  expect((await readState(page.request)).state.contact_tasks.find((item) => item.id === task.id)?.status).toBe("open");
  await page.reload();
  await expect(taskRow.getByText("연락 필요", { exact: true })).toBeVisible();

  const note = `모의 연락: 현재 상태와 후속 조치를 직접 확인함 ${Date.now()}`;
  await taskRow.getByLabel("연락 결과").fill(note);
  await taskRow.getByRole("button", { name: "연락 완료 처리", exact: true }).click();
  await expect.poll(async () => (await readState(page.request)).state.contact_tasks.find((item) => item.id === task.id)?.status).toBe("closed");
  await page.reload();
  await expect(taskRow.getByText("연락 완료", { exact: true })).toBeVisible();
  await expect(taskRow.getByText(note, { exact: false })).toBeVisible();
  const final = await readState(page.request);
  expect(final.state.contact_tasks.find((item) => item.id === task.id)?.resolution_note).toBe(note);
  for (const contactId of existingOpenContacts) {
    expect(final.state.contact_tasks.find((item) => item.id === contactId)?.status).toBe("open");
  }
});
