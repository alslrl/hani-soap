import { expect, test } from "@playwright/test";
import { action, chooseSelect, localDemo, readState, scenario } from "./helpers";

const categories: Record<string, string> = {
  chief_complaint: "주소증 경과", pain: "통증", function_daily: "기능·일상생활",
  treatment_response: "치료 후 반응", medication: "복약 상태", discomfort: "복용·치료 후 불편감",
  sleep: "수면", appetite_digestion: "식욕·소화", bowel_urine: "대변·소변",
  temperature_sweat_energy: "한열·땀·기력", lifestyle: "생활관리 실천", questions_concerns: "환자 질문·걱정",
};

test("required checks live in revisit questions, resolve individually, and preserve today's answers", async ({ page }) => {
  const initial = await localDemo(page);
  const a = scenario(initial, "A");
  const b = scenario(initial, "B");
  const visit = initial.state.visits.find((item) => item.id === a.current_visit_id)!;
  const previous = initial.state.visits.filter((item) => item.patient_id === a.patient_id && item.scheduled_at < visit.scheduled_at).at(-1)!;
  const suffix = Date.now().toString();
  const firstTitle = `첫 번째 통증 필수 확인 ${suffix}`;
  const secondTitle = `두 번째 통증 필수 확인 ${suffix}`;
  const nextTitle = `다음 방문 통증 확인 ${suffix}`;
  const otherTitle = `다른 환자 확인 ${suffix}`;
  await action(page.request, "followup.create", { visitId: previous.id, title: firstTitle, item_key: "pain" });
  await action(page.request, "followup.create", { visitId: previous.id, title: secondTitle, item_key: "pain" });
  await action(page.request, "followup.create", { visitId: visit.id, title: nextTitle, item_key: "pain" });
  const prepared = await action(page.request, "followup.create", { visitId: b.current_visit_id, title: otherTitle, item_key: "pain" });
  const required = prepared.state.followup_items.filter((item) => item.patient_id === a.patient_id && item.status === "pending" && prepared.state.visits.some((source) => source.id === item.source_visit_id && source.scheduled_at < visit.scheduled_at));
  const first = required.find((item) => item.title === firstTitle)!;
  const second = required.find((item) => item.title === secondTitle)!;

  await page.goto(`/clinic/visits/${visit.id}`);
  await page.getByRole("tab", { name: "재진 질문", exact: true }).click();
  const editor = page.getByRole("region", { name: "재진 확인 질문" });
  const nav = editor.getByRole("navigation", { name: "재진 질문 항목" });
  await expect(editor.getByText(`필수 질문 ${required.length}개 남음`, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "오늘 확인할 것", exact: true })).toHaveCount(0);
  await expect(editor.getByText(otherTitle, { exact: true })).toHaveCount(0);
  await expect(editor.getByRole("listitem").filter({ hasText: nextTitle })).toBeVisible();
  for (const check of required) {
    await nav.getByRole("button").filter({ hasText: categories[check.item_key] }).click();
    await expect(editor.getByRole("list", { name: `${categories[check.item_key]} 필수 질문`, exact: true }).getByText(check.title, { exact: true })).toBeVisible();
  }
  await nav.getByRole("button").filter({ hasText: /^02\s*통증/ }).click();
  await expect(editor.getByLabel("오늘 통증 NRS (0~10)")).toHaveValue("");
  const answer = editor.getByRole("textbox", { name: "오늘 상세 답변", exact: true });
  await expect(answer).toHaveValue("");
  await answer.fill(`오늘 확인한 통증 답변 ${suffix}`);
  await chooseSelect(page, editor.getByRole("combobox", { name: "확인 상태", exact: true }), "confirmed");
  await editor.getByRole("button", { name: "오늘 답변 저장", exact: true }).click();
  await expect(editor.getByText("오늘 확인한 답변을 저장했습니다.", { exact: true })).toBeVisible();
  // Confirming the category never silently resolves individual required questions.
  await expect(editor.getByRole("button", { name: `${firstTitle} 확인 완료`, exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: `${secondTitle} 확인 완료`, exact: true })).toBeVisible();
  await answer.fill(`아직 저장하지 않은 답변 ${suffix}`);
  await editor.getByRole("button", { name: `${firstTitle} 확인 완료`, exact: true }).click();
  await expect(editor.getByText(`필수 질문 ${required.length - 1}개 남음`, { exact: true })).toBeVisible();
  await expect(answer).toHaveValue(`아직 저장하지 않은 답변 ${suffix}`);
  const afterFirst = await readState(page.request);
  expect(afterFirst.state.followup_items.find((item) => item.id === first.id)).toMatchObject({ status: "resolved", resolved_visit_id: visit.id });
  expect(afterFirst.state.followup_items.find((item) => item.id === second.id)?.status).toBe("pending");
  expect(afterFirst.state.followup_answers.find((item) => item.visit_id === visit.id && item.item_key === "pain")?.answer_text).toBe(`오늘 확인한 통증 답변 ${suffix}`);
  expect(afterFirst.state.observations.some((item) => item.visit_id === visit.id)).toBe(false);

  await editor.getByRole("button", { name: "＋ 다음 방문 질문 추가", exact: true }).click();
  const addedTitle = `새로 추가한 다음 방문 질문 ${suffix}`;
  await editor.getByLabel("다음 방문에 확인할 내용", { exact: true }).fill(addedTitle);
  await editor.getByRole("button", { name: "질문 추가", exact: true }).click();
  await expect(editor.getByRole("listitem").filter({ hasText: addedTitle })).toBeVisible();
  await expect(editor.getByText(`필수 질문 ${required.length - 1}개 남음`, { exact: true })).toBeVisible();
  await expect(answer).toHaveValue(`아직 저장하지 않은 답변 ${suffix}`);
  const added = (await readState(page.request)).state.followup_items.find((item) => item.title === addedTitle);
  expect(added).toMatchObject({ source_visit_id: visit.id, patient_id: a.patient_id, item_key: "pain", status: "pending" });
  await editor.getByRole("button", { name: "오늘 답변 저장", exact: true }).click();
  await expect(editor.getByText("오늘 확인한 답변을 저장했습니다.", { exact: true })).toBeVisible();

  for (const check of required.filter((item) => item.id !== first.id)) {
    await nav.getByRole("button").filter({ hasText: categories[check.item_key] }).click();
    await editor.getByRole("button", { name: `${check.title} 확인 완료`, exact: true }).click();
    await expect(editor.getByRole("button", { name: `${check.title} 확인 완료`, exact: true })).toHaveCount(0);
  }
  await expect(editor.getByText("오늘 필수 질문을 모두 확인했습니다.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "재진 질문", exact: true }).click();
  await nav.getByRole("button").filter({ hasText: /^02\s*통증/ }).click();
  await expect(answer).toHaveValue(`아직 저장하지 않은 답변 ${suffix}`);
  await expect(editor.getByText("오늘 필수 질문을 모두 확인했습니다.", { exact: true })).toBeVisible();
  await expect(editor.getByRole("listitem").filter({ hasText: nextTitle })).toBeVisible();
  await expect(editor.getByRole("listitem").filter({ hasText: addedTitle })).toBeVisible();
  const final = await readState(page.request);
  expect(final.state.followup_items.find((item) => item.title === nextTitle)?.status).toBe("pending");
  expect(final.state.followup_items.find((item) => item.title === otherTitle)?.status).toBe("pending");
});
