import type { FollowupAnswer } from "@/lib/types";

export type FollowupKey = FollowupAnswer["item_key"];
export type QuestionGroup = {
  key: FollowupKey;
  title: string;
  question: string;
  subitems: { key: string; label: string }[];
};

export const QUESTION_GROUPS: QuestionGroup[] = [
  { key: "chief_complaint", title: "주소증 경과", question: "지난 진료 이후 주로 불편했던 증상은 어떻게 달라졌나요? 새로 생긴 증상도 있나요?", subitems: [{ key: "symptom_course", label: "증상·위치·빈도" }] },
  { key: "pain", title: "통증", question: "지금 통증은 어느 정도인가요? 어디가, 언제, 어떻게 아픈가요?", subitems: [{ key: "current_pain", label: "현재 통증" }] },
  { key: "function_daily", title: "기능·일상생활", question: "지난번 어려웠던 동작이나 일상생활은 지금 어떤가요?", subitems: [{ key: "daily_activity", label: "활동과 현재 제한" }] },
  { key: "treatment_response", title: "치료 후 반응", question: "지난 치료 뒤 어떤 변화가 있었나요? 얼마나 유지됐나요?", subitems: [{ key: "response_duration", label: "반응과 유지 기간" }] },
  { key: "medication", title: "복약 상태", question: "약은 어떻게 드셨나요? 빠뜨리거나 중단한 적이 있나요?", subitems: [{ key: "adherence", label: "실제 복용과 누락" }] },
  { key: "discomfort", title: "복용·치료 후 불편감", question: "약을 먹거나 치료받은 뒤 불편한 점이 있었나요? 지금도 있나요?", subitems: [{ key: "current_discomfort", label: "증상·시점·현재 상태" }] },
  { key: "sleep", title: "수면", question: "잠드는 것, 자다가 깨는 것, 아침에 일어났을 때 느낌은 어떤가요?", subitems: [{ key: "sleep_quality", label: "입면·각성·회복감" }] },
  { key: "appetite_digestion", title: "식욕·소화", question: "식욕과 식사량은 어떤가요? 식후 불편은 있나요?", subitems: [{ key: "appetite", label: "식욕·식사량" }, { key: "digestion", label: "소화·식후 불편" }] },
  { key: "bowel_urine", title: "대변·소변", question: "대변·소변 상태나 지난번 불편은 어떻게 달라졌나요?", subitems: [{ key: "stool", label: "대변" }, { key: "urine", label: "소변" }] },
  { key: "temperature_sweat_energy", title: "한열·땀·기력", question: "추위·열감·땀·피로는 지난번과 비교해 어떤가요?", subitems: [{ key: "cold_sensitivity", label: "추위·열감" }, { key: "sweating", label: "땀" }, { key: "energy", label: "기력·피로" }] },
  { key: "lifestyle", title: "생활관리 실천", question: "지난번 안내드린 관리를 해보셨나요? 어려운 점은 무엇인가요?", subitems: [{ key: "self_care", label: "실천·빈도·어려움" }] },
  { key: "questions_concerns", title: "환자 질문·걱정", question: "아직 궁금하거나 걱정되는 점이 있나요? 지난 설명 중 다시 듣고 싶은 것이 있나요?", subitems: [{ key: "open_questions", label: "질문과 설명 여부" }] },
];

export const CHANGE_LABELS: Record<NonNullable<FollowupAnswer["change"]>, string> = {
  improved: "호전", same: "동일", worsened: "악화", unclear: "불명확",
};
export const CONFIRMATION_LABELS: Record<FollowupAnswer["confirmation_status"], string> = {
  confirmed: "확인 완료", mentioned_only: "추가 확인 필요", not_confirmed: "확인 안 됨",
};
export function formatClinicDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export const ORIGIN_LABELS: Record<string, string> = {
  provided_case: "제공 기록", synthetic_history: "과거 진료", synthetic_response: "환자 응답", manual_demo: "직접 입력",
};
