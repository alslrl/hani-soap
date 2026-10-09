"use client";
import { Disclosure } from '@/components/ui/Disclosure';


import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/lib/client";
import type { AppState, Observation, Visit } from "@/lib/types";
import { CHANGE_LABELS, CONFIRMATION_LABELS, formatClinicDate, ORIGIN_LABELS, QUESTION_GROUPS } from "./questions";
import { FollowupEditor } from "./FollowupEditor";
import styles from "./progress.module.css";

function metricLabel(observation: Observation) {
  if (observation.instrument === "NRS") return "통증 변화";
  if (observation.instrument === "FREQUENCY") return observation.metric_key === "nocturnal_wetting_frequency" ? "밤중 실수 횟수" : "증상 빈도";
  const activities: Record<string, string> = { stairs_down: "계단 내려가기", walking: "걷기", arm_raise: "팔 올리기", stair_descent: "계단 내려가기" };
  if (observation.instrument === "APP_FUNCTION_DISCOMFORT") return `${activities[observation.activity_key ?? ""] ?? observation.activity_key ?? "활동"} 불편`;
  return "증상 불편 변화";
}
function metricScale(observation: Observation) {
  return observation.instrument === "NRS" ? "통증 NRS (0~10)" : observation.instrument === "FREQUENCY" ? observation.unit === "episodes_per_night" ? "횟수 (회/밤)" : `횟수 (${observation.unit})` : observation.instrument === "APP_FUNCTION_DISCOMFORT" ? "자체 기능 불편 점수 (0~10)" : "자체 증상 불편 점수 (0~10)";
}
const regionLabels: Record<string, string> = { ankle: "발목", lower_back: "허리", shoulder: "어깨", knee: "무릎", neck: "목" };
const sideLabels: Record<string, string> = { left: "왼쪽", right: "오른쪽", bilateral: "양쪽", midline: "중앙", not_applicable: "" };

function MetricChart({ values, visits, state }: { values: Observation[]; visits: Visit[]; state: AppState }) {
  const first = values[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latest = values.at(-1)!;
  const selected = values.find((item) => item.id === selectedId) ?? latest;
  const answer = state.followup_answers.find((item) => item.id === selected.followup_answer_id);
  const selectedVisit = visits.find((item) => item.id === selected.visit_id);
  const max = first.instrument === "NRS" || first.instrument === "APP_FUNCTION_DISCOMFORT" || first.instrument === "SYMPTOM_BOTHER" ? 10 : first.scale_max ?? Math.max(3, Math.ceil(Math.max(...values.map((item) => item.value))) + 1);
  const min = first.scale_min ?? 0;
  const width = 680, height = 280, left = 52, right = 35, top = 35, bottom = 55;
  const x = (index: number) => visits.length === 1 ? width / 2 : left + index * (width - left - right) / (visits.length - 1);
  const y = (value: number) => top + (max - value) / Math.max(1, max - min) * (height - top - bottom);
  const byVisit = new Map(values.map((value) => [value.visit_id, value]));
  const paths: string[] = [];
  let path = "";
  visits.forEach((visit, index) => {
    const value = byVisit.get(visit.id);
    if (!value) { if (path) paths.push(path); path = ""; return; }
    path += `${path ? " L" : "M"} ${x(index)} ${y(value.value)}`;
  });
  if (path) paths.push(path);
  const ticks = Array.from(new Set([min, Math.round((min + max) / 2), max]));
  return <section className={styles.chartSection}>
    <header className={styles.chartHeader}><div><h2>{metricLabel(first)}</h2><p>{[sideLabels[first.laterality ?? ""], regionLabels[first.body_region ?? ""] ?? first.body_region].filter(Boolean).join(" ") || (first.measurement_context === "nightly_wetting_reported_after_waking" ? "보호자 보고 · 야뇨 뒤 각성" : "같은 측정 조건의 방문 기록")}</p></div><div className={styles.latestScore}><strong>{latest.value}</strong><span>{first.instrument === "FREQUENCY" ? "회/밤" : "점"}<small>{formatClinicDate(latest.measured_at)}</small></span></div></header>
    <p className={styles.scaleLabel}>{metricScale(first)}</p>
    <div className={styles.chartScroll}><svg viewBox={`0 0 ${width} ${height}`} className={styles.chart} role="group" aria-label={`${metricLabel(first)} 방문별 그래프. 점을 선택하면 해당 기록을 확인합니다.`}>
      {ticks.map((tick) => <g key={tick}><line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} stroke="var(--line)" /><text x={left - 14} y={y(tick) + 5} textAnchor="end" className={styles.axisText}>{tick}</text></g>)}
      {paths.map((value, index) => <path key={index} d={value} fill="none" stroke="var(--accent)" strokeWidth="3" />)}
      {visits.map((visit, index) => {
        const value = byVisit.get(visit.id);
        return <g key={visit.id}><text x={x(index)} y={height - 22} textAnchor="middle" className={styles.axisText}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(visit.scheduled_at))}</text>
          {value ? <g role="button" tabIndex={0} aria-label={`${formatClinicDate(visit.scheduled_at)} ${value.value}${first.instrument === "FREQUENCY" ? "회/밤" : "점"} 기록 보기`} aria-pressed={value.id === selected.id} className={styles.chartPoint} onClick={() => setSelectedId(value.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(value.id); } }}>
            <circle cx={x(index)} cy={y(value.value)} r="24" fill="transparent" />
            <circle cx={x(index)} cy={y(value.value)} r={value.id === selected.id ? 8 : 6} fill={value.id === selected.id ? "var(--accent)" : "white"} stroke="var(--accent)" strokeWidth="3" />
            <text x={x(index)} y={y(value.value) - 17} textAnchor="middle" className={styles.pointValue}>{value.value}</text>
          </g> : <g><line x1={x(index)} y1={top + 16} x2={x(index)} y2={height - bottom} stroke="#d4ddda" strokeDasharray="4 5" /><text x={x(index)} y={top + 5} textAnchor="middle" className={styles.missingLabel}>미확인</text></g>}
        </g>;
      })}
    </svg></div>
    {first.instrument !== "FREQUENCY" && <p className={styles.endpoints}>0 {first.instrument === "NRS" ? "통증 없음" : "불편 없음"}<span>10 {first.instrument === "NRS" ? "상상할 수 있는 가장 심한 통증" : "가장 심한 불편"}</span></p>}
    <div className={styles.pointDetail}>
      <div className={styles.detailTitle}><strong>{formatClinicDate(selected.measured_at)} · {selectedVisit?.visit_no}회차</strong><span className={styles.tag}>{selected.review_status === "reviewed" ? "의료진 검토" : "검토 필요"}</span><span className={styles.tag}>{ORIGIN_LABELS[selected.origin]}</span></div>
      <p>{answer?.answer_text ?? "연결된 상세 답변이 없습니다."}</p>
      {answer && <small>{answer.change ? `변화: ${CHANGE_LABELS[answer.change]}` : answer.comparison_visit_id ? "변화 미선택" : "첫 기록·비교 기준 없음"} · {CONFIRMATION_LABELS[answer.confirmation_status]}</small>}
      <Disclosure className={styles.sourceDetails}><summary>기록 근거 {selected.source_refs.length}개</summary>{selected.source_refs.length ? selected.source_refs.map((source, index) => <div key={index}><span>{ORIGIN_LABELS[source.origin]} · {source.kind === "manual" ? "직접 입력/검수" : source.kind === "seed_snapshot" ? "과거 진료" : "연결 기록"}</span><p>{source.quote ?? "인용문 없음"}</p>{source.source_id && <code>{source.source_id}</code>}</div>) : <p>별도 인용 없이 직접 입력한 측정값입니다.</p>}</Disclosure>
    </div>
  </section>;
}

export function ProgressWorkspace({ patientId }: { patientId: string }) {
  const { data, error, loading, refresh } = useAppState();
  const [showQuestions, setShowQuestions] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  if (loading && !data) return <div className={styles.empty}>경과 기록을 불러오는 중입니다.</div>;
  if (!data) return <div className={styles.empty} role="alert"><p>{error ?? "기록을 불러오지 못했습니다."}</p><button onClick={() => refresh()}>다시 불러오기</button></div>;
  const state = data.state;
  const patient = state.patients.find((item) => item.id === patientId);
  if (!patient) return <div className={styles.empty}>환자를 찾을 수 없습니다. <Link href="/clinic">오늘 환자 보기</Link></div>;
  const visits = state.visits.filter((item) => item.patient_id === patientId).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const currentVisit = visits.at(-1);
  const observations = state.observations.filter((item) => item.patient_id === patientId).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const series = Array.from(new Map(observations.map((item) => [item.series_key, observations.filter((value) => value.series_key === item.series_key)])).entries());
  const detailVisit = visits.find((item) => item.id === selectedVisitId) ?? currentVisit;
  const detailAnswers = state.followup_answers.filter((item) => item.visit_id === detailVisit?.id && (item.answer_text || item.applicability === "not_applicable"));
  return <main className={styles.workspace}>
    <header className={styles.pageHeader}><div><Link href="/clinic" className={styles.backLink}>← 오늘 환자</Link><h1>{patient.display_name}<span>경과 기록</span></h1><p>{patient.chief_complaint}{patient.guardian ? " · 보호자 보고 포함" : ""}</p></div><div className={styles.headerActions}>{currentVisit && <Link className={styles.secondary} href={`/clinic/visits/${currentVisit.id}`}>진료실로 이동</Link>}<button type="button" className={styles.primary} aria-expanded={showQuestions} onClick={() => setShowQuestions(!showQuestions)}>{showQuestions ? "그래프 보기" : "오늘 질문·답변 기록"}</button></div></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {showQuestions && currentVisit ? <FollowupEditor visitId={currentVisit.id} /> : <>
      <div className={styles.recordNotice}><span>기록한 측정값만 표시합니다.</span><p>오늘 미확인 값은 빈 상태로 남겨 둡니다.</p></div>
      {series.length ? <div className={styles.chartGrid}>{series.map(([key, values]) => <MetricChart key={key} values={values} visits={visits} state={state} />)}</div> : <div className={styles.empty}>아직 저장한 점수나 횟수가 없습니다. 방문별 답변을 아래에서 확인하세요.</div>}
      <section className={styles.visitAnswers}><header><h2>방문별 상세 답변</h2><p>점수가 없는 항목도 환자의 표현과 확인 상태를 보존합니다.</p></header><div className={styles.visitTabs} role="group" aria-label="답변을 볼 방문">{visits.map((visit) => <button type="button" key={visit.id} aria-pressed={detailVisit?.id === visit.id} onClick={() => setSelectedVisitId(visit.id)}>{formatClinicDate(visit.scheduled_at)}<small>{visit.visit_no}회차</small></button>)}</div>
        {detailAnswers.length ? <div className={styles.answerHistory}>{detailAnswers.map((answer) => <div key={answer.id}><strong>{QUESTION_GROUPS.find((group) => group.key === answer.item_key)?.title}{answer.subitem_key && <small>{QUESTION_GROUPS.flatMap((group) => group.subitems).find((item) => item.key === answer.subitem_key)?.label ?? (answer.subitem_key === "nocturnal_wetting" ? "야간 실수" : "")}</small>}</strong><p>{answer.answer_text ?? "해당 없음"}</p><span>{answer.change ? CHANGE_LABELS[answer.change] : "변화 미선택"} · {CONFIRMATION_LABELS[answer.confirmation_status]} · {answer.review_status === "reviewed" ? "의료진 검토" : "검토 필요"}</span></div>)}</div> : <p className={styles.empty}>이 방문에서 아직 확인한 답변이 없습니다.</p>}
      </section>
    </>}
  </main>;
}
