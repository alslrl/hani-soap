import type { ReactNode } from "react";
import type { AppState, Patient, Visit, SoapDocument } from "@/lib/types";

export type State = AppState;
export type { Patient, Visit };
export type Soap = SoapDocument;
export type Sections = Soap["sections"];

export const workflowLabels: Record<string, string> = {
  waiting: "대기",
  in_progress: "진료 중",
  completed: "진료 완료",
};
export const recordLabels: Record<string, string> = {
  empty: "기록 전",
  draft: "초안",
  processing: "처리 중",
  review_needed: "검토 필요",
  approved: "의료진 승인",
};
export const regionLabels: Record<string, string> = {
  ankle: "발목",
  lower_back: "허리",
  lumbar: "허리",
  back: "등",
  neck: "목",
  shoulder: "어깨",
  knee: "무릎",
  abdomen: "복부",
  head: "머리",
  other: "기타",
};
export const sideLabels: Record<string, string> = {
  left: "왼쪽",
  right: "오른쪽",
  bilateral: "양쪽",
  midline: "중앙",
  not_applicable: "해당 없음",
};
export const modalityLabels: Record<string, string> = {
  acupuncture: "침",
  pharmacopuncture: "약침",
  moxibustion: "뜸",
  cupping: "부항",
  tuina: "추나",
};
export const itemLabels: Record<string, string> = {
  chief_complaint: "주요 증상",
  pain: "통증",
  function_daily: "일상 기능",
  treatment_response: "치료 반응",
  medication: "복약",
  discomfort: "불편 반응",
  sleep: "수면",
  appetite_digestion: "식욕·소화",
  bowel_urine: "대소변",
  temperature_sweat_energy: "한열·땀·기력",
  lifestyle: "생활 관리",
  questions_concerns: "궁금한 점",
};

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function fullDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}
export function visitTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function dayKey(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function age(patient: Patient, at: string) {
  const [birthYear, birthMonth, birthDay] = patient.birth_date
    .split("-")
    .map(Number);
  const [year, month, day] = dayKey(at).split("-").map(Number);
  const beforeBirthday =
    month < birthMonth || (month === birthMonth && day < birthDay);
  return year - birthYear - (beforeBirthday ? 1 : 0);
}
export function demographics(patient: Patient, at: string) {
  return `${age(patient, at)}세 · ${patient.sex === "female" ? "여" : patient.sex === "male" ? "남" : "미확인"}`;
}
export function Portrait({
  patient,
  size = "normal",
}: {
  patient: Patient;
  size?: "small" | "normal" | "large";
}) {
  return patient.portrait_asset_key ? (
    <img
      className={`hs-portrait hs-portrait-${size}`}
      src={`/demo/portraits/${patient.portrait_asset_key}.png`}
      alt={`${patient.display_name} 가상 프로필`}
    />
  ) : (
    <span className={`hs-portrait hs-portrait-${size} hs-portrait-fallback`}>
      {patient.display_name.slice(0, 1)}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber";
}) {
  return <span className={`hs-badge hs-badge-${tone}`}>{children}</span>;
}
export function WorkflowBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "in_progress"
          ? "blue"
          : status === "completed"
            ? "green"
            : "neutral"
      }
    >
      {workflowLabels[status] || status}
    </Badge>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="hs-empty">
      <span className="hs-empty-mark" aria-hidden="true">
        —
      </span>
      <p>{title}</p>
      {children && <span>{children}</span>}
    </div>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string | null;
  retry?: () => void;
}) {
  return (
    <div className="clinic-surface hs-load" aria-live="polite">
      <div className={loading ? "hs-spinner" : "hs-error-mark"} />{" "}
      <p>
        {loading
          ? "진료 정보를 불러오고 있어요"
          : error || "진료 정보를 불러오지 못했어요"}
      </p>
      {!loading && retry && (
        <button className="hs-button" onClick={retry}>
          다시 불러오기
        </button>
      )}
    </div>
  );
}
export function NrsSparkline({
  points,
  label = "통증 NRS",
  emptyTitle = "아직 기록된 통증 점수가 없어요",
}: {
  points: { value: number; label: string }[];
  label?: string;
  emptyTitle?: string;
}) {
  if (!points.length) return <Empty title={emptyTitle} />;
  const width = 220,
    height = 78,
    left = 12,
    right = 208;
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : left + (index * (right - left)) / (points.length - 1);
  const y = (value: number) => 9 + (10 - value) * 5;
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`)
    .join(" ");
  return (
    <svg
      className="hs-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} 경과: ${points.map((point) => `${point.label} ${point.value}점`).join(", ")}`}
    >
      <path d="M 9 59 H 211" className="hs-chart-baseline" />
      <path d={path} className="hs-chart-line" />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={x(index)} cy={y(point.value)} r="3.5" />
          <text x={x(index)} y={y(point.value) - 8} textAnchor="middle">
            {point.value}
          </text>
          <text
            className="hs-chart-date"
            x={x(index)}
            y="75"
            textAnchor="middle"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function panelTitle(title: string, action?: ReactNode) {
  return (
    <div className="hs-panel-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "저장하지 못했어요. 다시 시도해 주세요.";
}
