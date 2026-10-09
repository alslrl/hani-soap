import { expect, test } from "@playwright/test";
import { action, localDemo, readState, scenario, waitForVisit } from "./helpers";

test("opening a patient is read-only, and SOAP approval is separate from finishing the visit", async ({ page }) => {
  const initial = await localDemo(page);
  const { current_visit_id: visitId, patient_id: patientId } = scenario(initial, "A");
  const patient = initial.state.patients.find((item) => item.id === patientId)!;
  const before = initial.state.visits.find((item) => item.id === visitId)!;

  await page.goto("/clinic");
  await page.getByRole("link").filter({ hasText: patient.display_name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/clinic/visits/${visitId}$`));
  await expect(page.getByLabel("S 증상·경과")).toBeVisible();
  const opened = await readState(page.request);
  expect(opened.state.visits.find((item) => item.id === visitId)?.workflow_status).toBe(before.workflow_status);
  expect(opened.state.visits).toHaveLength(initial.state.visits.length);

  // Repeated suite runs may start with a completed visit in the isolated store.
  if (before.workflow_status === "completed") {
    await action(page.request, "visit.reopen", { visitId });
    await page.reload();
  } else if (before.workflow_status === "waiting") {
    await page.getByRole("button", { name: "진료 시작", exact: true }).click();
  }
  await waitForVisit(page, visitId, "in_progress");

  const suffix = Date.now().toString();
  const sections = {
    s: `오늘 환자가 설명한 오른쪽 발목 불편. 검증 ${suffix}`,
    o: "오늘 진찰 소견은 추가 확인 필요.",
    a: "의료진 평가 확인 대기.",
    p: "시술 계획은 시행 여부를 확인한 뒤 기록.",
  };
  await page.getByLabel("S 증상·경과").fill(sections.s);
  await page.getByLabel("O 관찰·검사").fill(sections.o);
  await page.getByLabel("A 평가").fill(sections.a);
  await page.getByLabel("P 치료·계획").fill(sections.p);
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await waitForVisit(page, visitId, "in_progress", "draft");
  await page.getByRole("button", { name: "검토 후 승인", exact: true }).click();
  await waitForVisit(page, visitId, "in_progress", "approved");

  await page.reload();
  await expect(page.getByLabel("S 증상·경과")).toHaveValue(sections.s);
  await waitForVisit(page, visitId, "in_progress", "approved");
  const approved = await readState(page.request);
  expect(approved.state.soap_documents.some((doc) => doc.visit_id === visitId && doc.status === "approved" && doc.sections.s === sections.s)).toBe(true);

  await page.getByRole("button", { name: "오늘 진료 마침", exact: true }).click();
  await waitForVisit(page, visitId, "completed", "approved");
  await page.reload();
  await waitForVisit(page, visitId, "completed", "approved");
  await page.goto("/clinic");
  const completedColumn = page.locator("section").filter({ has: page.getByRole("heading", { name: "진료 완료", exact: true }) });
  await expect(completedColumn.getByRole("link").filter({ hasText: patient.display_name })).toBeVisible();
});
