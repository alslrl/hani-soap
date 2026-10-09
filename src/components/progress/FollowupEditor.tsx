"use client";

import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/lib/client";
import type { FollowupAnswer, Observation } from "@/lib/types";
import { CHANGE_LABELS, CONFIRMATION_LABELS, formatClinicDate, QUESTION_GROUPS, type FollowupKey } from "./questions";
import { getTranscriptAnswerProposals, prefillTranscriptAnswerDrafts, transcriptDraftAnalysisSignature, type NrsPanelTarget, type TranscriptAnswerDraftBinding } from "@/lib/ai/clinical-analysis-drafts";
import { ClinicalAnalysisReview, TranscriptAnswerDraftBadge } from "./ClinicalAnalysisReview";
import styles from "./progress.module.css";

type AnswerDraft = Pick<FollowupAnswer, "item_key" | "subitem_key" | "answer_text" | "change" | "confirmation_status" | "applicability">;
const answerKey = (item: string, subitem: string) => `${item}:${subitem}`;

export function FollowupEditor({ visitId, compact = false, nrsTarget }: { visitId: string; compact?: boolean; nrsTarget?: NrsPanelTarget }) {
  const { data, act, refresh } = useAppState();
  const state = data?.state;
  const visit = state?.visits.find((item) => item.id === visitId);
  const patient = state?.patients.find((item) => item.id === visit?.patient_id);
  const [selectedGroup, setSelectedGroup] = useState<FollowupKey>("chief_complaint");
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [transcriptDrafts, setTranscriptDrafts] = useState<Record<string, TranscriptAnswerDraftBinding>>({});
  const [hasUnsavedAiDrafts, setHasUnsavedAiDrafts] = useState(false);
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const hydratedVisit = useRef("");
  const hydratedAnswers = useRef("");

  useEffect(() => {
    if (!state || !visit) return;
    const sameVisit = hydratedVisit.current === visit.id;
    const signature = JSON.stringify([state.followup_answers.filter((item) => item.visit_id === visit.id), state.observations.filter((item) => item.visit_id === visit.id), transcriptDraftAnalysisSignature(state, visit.id)]);
    if (sameVisit && (dirty || hydratedAnswers.current === signature)) return;
    const next: Record<string, AnswerDraft> = {};
    for (const group of QUESTION_GROUPS) {
      for (const subitem of group.subitems) {
        next[answerKey(group.key, subitem.key)] = { item_key: group.key, subitem_key: subitem.key, answer_text: "", change: null, confirmation_status: "not_confirmed", applicability: "unknown" };
      }
    }
    for (const item of state.followup_answers.filter((item) => item.visit_id === visit.id)) {
      const group = QUESTION_GROUPS.find((group) => group.key === item.item_key);
      // A blank category placeholder is replaced by its independent detailed fields.
      if (item.subitem_key === item.item_key && !item.answer_text && (group?.subitems.length ?? 0) > 1) continue;
      next[answerKey(item.item_key, item.subitem_key)] = { item_key: item.item_key, subitem_key: item.subitem_key, answer_text: item.answer_text ?? "", change: item.change, confirmation_status: item.confirmation_status, applicability: item.applicability };
    }
    // Preserve the identity of measured subitems, while today's answers stay blank.
    for (const observation of state.observations.filter((item) => item.patient_id === visit.patient_id)) {
      const source = state.followup_answers.find((item) => item.id === observation.followup_answer_id);
      if (!source) continue;
      const key = answerKey(source.item_key, source.subitem_key);
      if (!next[key]) next[key] = { item_key: source.item_key, subitem_key: source.subitem_key, answer_text: "", change: null, confirmation_status: "not_confirmed", applicability: "unknown" };
    }
    const values: Record<string, string> = {};
    for (const observation of state.observations.filter((item) => item.visit_id === visit.id)) values[observation.series_key] = String(observation.value);
    const prefilled = prefillTranscriptAnswerDrafts(state, visit.id, next);
    setDrafts(prefilled.drafts);
    setTranscriptDrafts(prefilled.bindings);
    setHasUnsavedAiDrafts(prefilled.hasUnsavedAiDrafts);
    setMetricValues(values);
    setDirty(false);
    if (!sameVisit) setFeedback("");
    hydratedVisit.current = visit.id;
    hydratedAnswers.current = signature;
  }, [state, visit, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  if (!state || !visit || !patient) return <p className={styles.empty}>방문 기록을 불러오는 중입니다.</p>;
  const visitDates = new Map(state.visits.map((item) => [item.id, item.scheduled_at]));
  const previousAnswers = state.followup_answers.filter((item) => item.patient_id === patient.id && item.visit_id !== visit.id && (visitDates.get(item.visit_id) ?? "") < visit.scheduled_at && item.answer_text).sort((a, b) => (visitDates.get(b.visit_id) ?? "").localeCompare(visitDates.get(a.visit_id) ?? ""));
  const metricTemplates = Array.from(new Map(state.observations.filter((item) => item.patient_id === patient.id && (visitDates.get(item.visit_id) ?? "") <= visit.scheduled_at).sort((a, b) => a.measured_at.localeCompare(b.measured_at)).map((item) => [item.series_key, item])).values());
  // The clinic's NRS panel owns its score input. Saving answers must not replay
  // a hidden, stale copy of that score over a newer measurement.
  const isLinkedNrs = (metric: Observation) => Boolean(nrsTarget && metric.instrument === "NRS" && metric.metric_key === nrsTarget.metric_key && metric.body_region === nrsTarget.body_region && metric.laterality === nrsTarget.laterality && metric.activity_key === nrsTarget.activity_key && metric.measurement_context === nrsTarget.measurement_context);
  const editableMetrics = metricTemplates.filter((metric) => !isLinkedNrs(metric));
  const currentNrs = state.observations.filter((item) => item.visit_id === visitId && isLinkedNrs(item)).sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
  const group = QUESTION_GROUPS.find((item) => item.key === selectedGroup)!;
  const groupDrafts = Object.entries(drafts).filter(([, item]) => item.item_key === selectedGroup);
  const pendingItems = state.followup_items.filter((item) => item.patient_id === patient.id && item.status === "pending");
  const completedCount = QUESTION_GROUPS.filter((group) => Object.values(drafts).some((item) => item.item_key === group.key && (item.confirmation_status === "confirmed" || item.applicability === "not_applicable"))).length;

  function update(key: string, value: Partial<AnswerDraft>) {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...value } }));
    setDirty(true); setFeedback("");
  }

  async function save() {
    if (busy || !state || !visit) return;
    setBusy(true); setFeedback(""); setFailed(false);
    try {
      for (const metric of editableMetrics) {
        const input = metricValues[metric.series_key];
        if (input === undefined || input.trim() === "") continue;
        const value = Number(input);
        if (!Number.isFinite(value) || value < (metric.scale_min ?? 0) || (metric.scale_max !== null && value > metric.scale_max) || (metric.instrument === "NRS" && !Number.isInteger(value))) throw new Error("점수·횟수의 범위를 확인해 주세요. NRS는 0~10 정수로 입력합니다.");
      }
      let saved;
      if (Object.keys(transcriptDrafts).length) {
        const response = await fetch('/api/clinical-analysis/answers', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitId,patientId:visit.patient_id,answers:Object.values(drafts),transcriptDrafts:Object.values(transcriptDrafts),expectedVersion:data?.version}) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? '전사 초안과 답변을 저장하지 못했습니다.');
        saved = body as import('@/lib/types').StateEnvelope;
      } else saved = await act("followup.save", { visitId, answers: Object.values(drafts) });
      for (const metric of editableMetrics) {
        const input = metricValues[metric.series_key];
        if (input === undefined || input.trim() === "") continue;
        const currentValue = state.observations.filter((item) => item.visit_id === visitId && item.series_key === metric.series_key).sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
        if (currentValue && String(currentValue.value) === input) continue;
        const value = Number(input);
        if (!Number.isFinite(value) || value < (metric.scale_min ?? 0) || (metric.scale_max !== null && value > metric.scale_max)) throw new Error("점수·횟수의 범위를 확인해 주세요.");
        const sourceAnswer = state.followup_answers.find((answer) => answer.id === metric.followup_answer_id);
        const answer = saved.state.followup_answers.find((answer) => answer.visit_id === visitId && sourceAnswer && answer.item_key === sourceAnswer.item_key && answer.subitem_key === sourceAnswer.subitem_key);
        saved = await act("observation.save", { visitId, followupAnswerId: answer?.id, metric_key: metric.metric_key, series_key: metric.series_key, instrument: metric.instrument, value, unit: metric.unit, body_region: metric.body_region, laterality: metric.laterality, activity_key: metric.activity_key, measurement_context: metric.measurement_context });
      }
      setDirty(false); setHasUnsavedAiDrafts(false); await refresh(); setFeedback("오늘 확인한 답변을 저장했습니다.");
    } catch (error) { setFailed(true); setFeedback(error instanceof Error ? error.message : "저장하지 못했습니다. 입력 내용을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  function renderMetric(metric: Observation) {
    const current = state!.observations.find((item) => item.visit_id === visitId && item.series_key === metric.series_key);
    const previous = state!.observations.filter((item) => item.series_key === metric.series_key && item.visit_id !== visitId && item.measured_at < visit!.scheduled_at).sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
    const title = metric.instrument === "NRS" ? "오늘 통증 NRS (0~10)" : metric.instrument === "FREQUENCY" ? "오늘 야간 실수 횟수 (회/밤)" : "오늘 불편 점수 (0~10)";
    return <div className={styles.metricEntry} key={metric.series_key}>
      <label htmlFor={`score-${metric.id}`}>{title}</label>
      <input id={`score-${metric.id}`} type="number" inputMode="decimal" min={metric.scale_min ?? 0} max={metric.scale_max ?? undefined} step={metric.instrument === "FREQUENCY" ? "any" : 1} value={metricValues[metric.series_key] ?? ""} placeholder="미확인" onChange={(event) => { setMetricValues((values) => ({ ...values, [metric.series_key]: event.target.value })); setDirty(true); }} />
      <small>{previous ? `참고: ${formatClinicDate(previous.measured_at)} ${previous.value}${metric.instrument === "FREQUENCY" ? "회/밤" : "점"}` : "비교할 이전 점수가 없습니다."}{current ? " · 오늘 저장 기록 있음" : " · 오늘 값은 새로 확인해 주세요."}</small>
      {metric.instrument === "NRS" && <small>0 통증 없음 · 10 상상할 수 있는 가장 심한 통증</small>}
    </div>;
  }

  function openNrs() {
    const input = nrsTarget ? document.getElementById(nrsTarget.inputId) : null;
    if (!(input instanceof HTMLInputElement)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    input.focus({ preventScroll: true });
  }

  return <section className={`${styles.followup} ${compact ? styles.compact : ""}`} aria-label="재진 확인 질문">
    <header className={styles.editorHeader}><div><h2>오늘 확인할 것</h2><p>12개 항목 중 {completedCount}개 확인{dirty ? " · 저장하지 않은 변경" : ""}</p></div><button type="button" className={styles.primary} disabled={busy || !dirty && !hasUnsavedAiDrafts} onClick={save}>{busy ? "저장 중…" : "오늘 답변 저장"}</button></header>
    <ClinicalAnalysisReview visitId={visitId} disabled={dirty || busy} nrsTarget={nrsTarget} />
    {pendingItems.length > 0 && <details className={styles.pending}><summary>이어 확인할 질문 {pendingItems.length}개</summary><ul>{pendingItems.map((item) => <li key={item.id}>{item.title}</li>)}</ul></details>}
    {feedback && <p className={failed ? styles.error : styles.feedback} role={failed ? "alert" : "status"}>{feedback}</p>}
    <div className={styles.questionsLayout}>
      <nav className={styles.questionNav} aria-label="재진 질문 항목">{QUESTION_GROUPS.map((item, index) => {
        const answers = Object.values(drafts).filter((answer) => answer.item_key === item.key);
        const done = answers.length > 0 && answers.every((answer) => answer.confirmation_status === "confirmed" || answer.applicability === "not_applicable");
        return <button key={item.key} type="button" aria-current={selectedGroup === item.key ? "true" : undefined} onClick={() => setSelectedGroup(item.key)}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}<i aria-label={done ? "확인 완료" : "확인 필요"}>{done ? "✓" : "·"}</i></button>;
      })}</nav>
      <div className={styles.questionBody}><h3>{group.title}</h3><p className={styles.question}>{group.question}</p>
        {group.key === "pain" && nrsTarget && <div className={styles.nrsShortcut}>
          <span>오늘 통증 점수</span>
          <button type="button" className={styles.primary} onClick={openNrs} aria-controls={nrsTarget.inputId}>통증 NRS 입력으로 이동</button>
          <small>오늘 통증 NRS: {currentNrs ? `${currentNrs.value}/10` : "미확인"} · 점수는 통증 NRS 패널에서 입력합니다.</small>
        </div>}
        {groupDrafts.map(([key, answer]) => {
          const subitem = group.subitems.find((item) => item.key === answer.subitem_key);
          const previous = previousAnswers.find((item) => item.item_key === answer.item_key && item.subitem_key === answer.subitem_key) ?? (groupDrafts.length === 1 ? previousAnswers.find((item) => item.item_key === answer.item_key) : undefined);
          return <fieldset className={styles.answerField} key={key}><legend>{subitem?.label ?? (answer.subitem_key === "nocturnal_wetting" ? "야간 실수·이후 각성" : answer.subitem_key)}</legend>
            <div className={styles.previous}><span>지난 기록 {previous ? `· ${formatClinicDate(visitDates.get(previous.visit_id)!)}` : "· 첫 기록·비교 기준 없음"}</span><p>{previous?.answer_text ?? "이전 답변이 없습니다. 오늘 답변을 새로 확인해 주세요."}</p></div>
            <div className={styles.changeButtons} aria-label={`${subitem?.label ?? group.title} 변화`}>{Object.entries(CHANGE_LABELS).map(([value, label]) => <button key={value} type="button" aria-pressed={answer.change === value} onClick={() => update(key, { change: answer.change === value ? null : value as AnswerDraft["change"] })}>{label}</button>)}</div>
            <label className={styles.inputLabel}>오늘 상세 답변<textarea rows={3} placeholder="환자의 표현과 확인한 내용을 기록해 주세요." value={answer.answer_text ?? ""} onChange={(event) => update(key, { answer_text: event.target.value })} /></label>
            {transcriptDrafts[key] && <TranscriptAnswerDraftBadge state={state} binding={transcriptDrafts[key]} edited={answer.answer_text !== getTranscriptAnswerProposals(state,visitId).find(proposal => proposal.candidate.id === transcriptDrafts[key].candidateId)?.candidate.text} />}
            <div className={styles.selectRow}><label>확인 상태<select value={answer.confirmation_status} onChange={(event) => update(key, { confirmation_status: event.target.value as AnswerDraft["confirmation_status"] })}>{Object.entries(CONFIRMATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>해당 여부<select value={answer.applicability} onChange={(event) => update(key, { applicability: event.target.value as AnswerDraft["applicability"] })}><option value="unknown">아직 확인 안 됨</option><option value="applicable">해당함</option><option value="not_applicable">해당 없음</option></select></label></div>
          </fieldset>;
        })}
        {editableMetrics.filter((metric) => (group.key === "pain" && metric.instrument === "NRS") || (group.key === "function_daily" && metric.instrument === "APP_FUNCTION_DISCOMFORT") || (group.key === "bowel_urine" && metric.instrument === "FREQUENCY")).map(renderMetric)}
      </div>
    </div>
  </section>;
}
