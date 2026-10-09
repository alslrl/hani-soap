"use client";
import { ActionArrow } from '@/components/ui/ActionArrow';
import { Disclosure } from '@/components/ui/Disclosure';
import { AppSelect } from '@/components/ui/AppSelect';


import Link from "next/link";
import { TextPrivacyNotice } from "@/components/privacy/TextPrivacyNotice";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/lib/client";
import type { CareMessage, CareResponse, StateEnvelope } from "@/lib/types";
import { formatClinicDate, ORIGIN_LABELS } from "@/components/progress/questions";
import styles from "./care.module.css";
import { KakaoSendButton } from "./KakaoSendButton";
import { displayRecordText } from "@/lib/presentation";

type CareTab = "contact" | "review" | "medication";
type Destination = { patientId?: string; messageId?: string; newDraft?: boolean; cloneBody?: string };
const STAGE_LABELS: Record<CareMessage["stage"], string> = { visit_summary: "진료 후 안내", day3: "복용 3일차", week1: "복용 1주차", end_minus3: "종료 3일 전" };
const MESSAGE_LABELS: Record<CareMessage["status"], string> = { draft: "검토 전 초안", approved: "승인 완료", sent: "발송 완료", failed: "발송 실패", unknown: "결과 확인 필요" };
const RESPONSE_LABELS: Record<CareResponse["option"], string> = { taking_well: "잘 먹고 있어요", discomfort: "불편한 점 있어요", improving: "좋아지고 있어요", unsure: "잘 모르겠어요", will_book: "예약할게요", will_wait: "더 지켜볼게요" };
const DETAIL_LABELS: Record<NonNullable<CareResponse["detail"]>, string> = { stomach_discomfort: "속이 불편해요", difficulty_taking: "약 챙기기가 어려워요", other: "기타" };
const optionsForStage = (stage: CareMessage["stage"]): CareResponse["option"][] => stage === "week1" ? ["improving", "unsure", "discomfort"] : stage === "end_minus3" ? ["will_book", "will_wait", "discomfort"] : ["taking_well", "discomfort"];

const CARE_SOURCE_LABELS: Record<string, string> = { approved_plan: "승인 계획", medication_instruction: "확인된 복약 안내", reviewed_signal: "의료진이 확인한 직접 표현", care_response: "지난 응답", open_contact: "미해결 연락", followup_answer: "확인된 재진 답변", observation: "검토한 경과 기록", approved_history: "과거 승인 기록", care_message: "과거 발송 안내" };
const CARE_PURPOSE_LABELS: Record<string, string> = { instruction: "기록된 행동 안내", explanation: "승인 내용 설명", acknowledgment: "지난 보고 확인", check_question: "현재 상태를 묻는 질문" };
const objectValue = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function CareEvidenceItem({ value }: { value: unknown }) {
  const item = objectValue(value);
  if (!item || typeof item.quote !== "string") return null;
  const date = typeof item.source_date === "string" && Number.isFinite(Date.parse(item.source_date)) ? formatClinicDate(item.source_date, true) : null;
  const refs = Array.isArray(item.source_refs) ? item.source_refs.map(objectValue).filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref.quote === "string")) : [];
  return <div className={styles.contextEvidence}>
    <div className={styles.evidenceMeta}><span>{typeof item.source_kind === "string" ? CARE_SOURCE_LABELS[item.source_kind] ?? "기록 근거" : "승인 P 원문"}</span>{date && <time dateTime={String(item.source_date)}>{date}</time>}{item.response_source === "demo_simulation" ? <span>모의 응답</span> : item.response_source === "kakao_self_link" ? <span>카카오 본인 링크 응답</span> : null}{item.temporal === "past_record" || item.temporal === "dated_report" ? <span>지난 기록·현재 상태 미확정</span> : null}</div>
    <blockquote>{item.quote}</blockquote>
    {typeof item.source_visit_id === "string" && <Link className={styles.sourceVisitLink} href={`/clinic/visits/${item.source_visit_id}`}>해당 진료 확인 ↗</Link>}
    {refs.length > 0 && <details><summary>원래 기록의 인용 보기</summary>{refs.map((ref, index) => <p key={index}>{String(ref.quote)}</p>)}</details>}
  </div>;
}
function CareStrategyPanel({ result }: { result: Record<string, unknown> | null | undefined }) {
  const strategy = objectValue(result?.care_strategy);
  const focus = Array.isArray(strategy?.focus) ? strategy.focus.map(objectValue).filter((item): item is Record<string, unknown> => Boolean(item && typeof item.title === "string" && typeof item.why === "string")) : [];
  if (!focus.length) return null;
  const recipient = objectValue(strategy?.recipient);
  return <section className={styles.careStrategy} aria-label="맞춤 안내 방향과 근거">
    <header><h4>안내 방향 제안</h4><span>의료진 검토 전</span></header><p className={styles.strategyAudience}>{recipient?.kind === "guardian" ? "보호자에게 설명할 안내" : "환자에게 설명할 안내"}{typeof strategy?.stage === "string" && strategy.stage in STAGE_LABELS ? ` · ${STAGE_LABELS[strategy.stage as CareMessage["stage"]]}` : ""}</p>
    {focus.map((item, index) => <div className={styles.focusItem} key={index}><strong>{String(item.title)}</strong><p>{String(item.why)}</p><details><summary>이 방향의 날짜·원문 근거</summary>{Array.isArray(item.evidence) && item.evidence.map((evidence, number) => <CareEvidenceItem key={number} value={evidence} />)}</details></div>)}
  </section>;
}

export function CareWorkspace() {
  const { data, error, loading, refresh, act } = useAppState();
  const state = data?.state;
  const [tab, setTab] = useState<CareTab>("contact");
  const [patientId, setPatientId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [stage, setStage] = useState<CareMessage["stage"]>("visit_summary");
  const [sourceVisitId, setSourceVisitId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<Destination | null>(null);
  const [contactNotes, setContactNotes] = useState<Record<string, string>>({});
  const [responseOption, setResponseOption] = useState<CareResponse["option"]>("taking_well");
  const [responseDetail, setResponseDetail] = useState<CareResponse["detail"]>(null);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const lastPatient = useRef("");
  const hydratedEditor = useRef("");
  const cloneText = useRef<string | null>(null);

  useEffect(() => {
    if (!state || patientId) return;
    setPatientId(state.contact_tasks.find((item) => item.status === "open")?.patient_id ?? state.patients[0]?.id ?? "");
  }, [state, patientId]);
  useEffect(() => {
    if (!state || !patientId || lastPatient.current === patientId) return;
    const messages = state.care_messages.filter((item) => item.patient_id === patientId);
    const contact = state.contact_tasks.find((item) => item.patient_id === patientId && item.status === "open");
    const response = state.care_responses.find((item) => item.id === contact?.response_id);
    setMessageId(response?.message_id ?? messages.find((item) => item.status === "draft")?.id ?? messages.at(-1)?.id ?? "new");
    lastPatient.current = patientId;
  }, [state, patientId]);
  const message = state?.care_messages.find((item) => item.id === messageId && item.patient_id === patientId);
  const generationJob = state?.jobs.find((item) => item.id === generationJobId);
  useEffect(() => {
    if (!state || !generationJob || dirty || typeof generationJob.result?.messageId !== "string") return;
    const generated = state.care_messages.find((item) => item.id === generationJob.result?.messageId && item.patient_id === patientId);
    if (generated) { setMessageId(generated.id); setGenerationJobId(null); }
  }, [state, generationJob, dirty, patientId]);
  useEffect(() => {
    if (!state || !patientId || !messageId) return;
    const key = `${patientId}:${messageId}`;
    if (hydratedEditor.current === key) return;
    const patientVisits = state.visits.filter((item) => item.patient_id === patientId).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
    const approvedVisit = patientVisits.find((visit) => state.soap_documents.some((soap) => soap.visit_id === visit.id && soap.status === "approved"));
    const loadedClone = cloneText.current;
    setDraftBody(message?.draft_body ?? loadedClone ?? "");
    cloneText.current = null;
    setStage(message?.stage ?? "visit_summary");
    setSourceVisitId(message?.visit_id ?? approvedVisit?.id ?? "");
    setCourseId(message?.medication_course_id ?? state.medication_courses.find((course) => course.patient_id === patientId)?.id ?? "");
    setResponseOption(message ? optionsForStage(message.stage)[0] : "taking_well");
    setResponseDetail(null); setDirty(Boolean(loadedClone)); setFeedback(""); setFailed(false);
    hydratedEditor.current = key;
  }, [state, patientId, messageId, message]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  if (loading && !data) return <div className={styles.empty}>후속 관리 기록을 불러오는 중입니다.</div>;
  if (!state) return <div className={styles.empty} role="alert"><p>{error ?? "기록을 불러오지 못했습니다."}</p><button onClick={() => refresh()}>다시 불러오기</button></div>;
  const patient = state.patients.find((item) => item.id === patientId);
  const patientMessages = state.care_messages.filter((item) => item.patient_id === patientId).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const patientVisits = state.visits.filter((item) => item.patient_id === patientId).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const approvedSoaps = state.soap_documents.filter((item) => item.status === "approved" && patientVisits.some((visit) => visit.id === item.visit_id));
  const sourceSoap = approvedSoaps.filter((item) => item.visit_id === sourceVisitId).sort((a, b) => b.revision - a.revision)[0];
  const patientContacts = state.contact_tasks.filter((item) => item.patient_id === patientId);
  const openContacts = state.contact_tasks.filter((item) => item.status === "open");
  const needsReview = state.care_messages.filter((item) => item.status === "draft" || item.status === "approved");
  const tabPatients = state.patients.filter((item) => tab === "contact" ? openContacts.some((contact) => contact.patient_id === item.id) : tab === "review" ? needsReview.some((message) => message.patient_id === item.id) : state.medication_courses.some((course) => course.patient_id === item.id));
  const editable = messageId === "new" || message?.status === "draft";
  const patientVisitIds = new Set(patientVisits.map((visit) => visit.id));
  const careJob = state.jobs.filter((item) => item.kind === "care" && patientVisitIds.has(item.visit_id)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const jobRunning = Boolean(careJob && ["queued", "running"].includes(careJob.status));
  const messageGeneration = state.jobs.find((item) => item.kind === "care" && item.result?.messageId === message?.id);
  const tabCounts = { contact: openContacts.length, review: needsReview.length, medication: state.medication_courses.length };
  const timeline = [
    ...approvedSoaps.map((soap) => ({ id: soap.id, date: soap.approved_at ?? patientVisits.find((visit) => visit.id === soap.visit_id)!.scheduled_at, kind: "soap" as const, soap })),
    ...patientMessages.filter((message) => message.status !== "draft").map((message) => ({ id: message.id, date: message.delivered_at ?? message.approved_at ?? message.scheduled_at, kind: "message" as const, message })),
    ...state.care_responses.filter((item) => item.patient_id === patientId).map((response) => ({ id: response.id, date: response.received_at, kind: "response" as const, response })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  function applyDestination(destination: Destination) {
    setPendingDestination(null); setDirty(false); setFeedback("");
    if (destination.patientId) { setPatientId(destination.patientId); return; }
    if (destination.newDraft) {
      cloneText.current = destination.cloneBody ?? "";
      hydratedEditor.current = "";
      setMessageId("new");
      if (messageId === "new") { setDraftBody(destination.cloneBody ?? ""); setStage("visit_summary"); setDirty(Boolean(destination.cloneBody)); }
      return;
    }
    if (destination.messageId) setMessageId(destination.messageId);
  }
  function navigate(destination: Destination) {
    if (dirty) setPendingDestination(destination); else applyDestination(destination);
  }
  function report(error: unknown) { setFailed(true); setFeedback(error instanceof Error ? error.message : "처리하지 못했습니다. 다시 시도해 주세요."); }
  async function saveDraft(): Promise<StateEnvelope | null> {
    if (!draftBody.trim() || !sourceVisitId) { setFailed(true); setFeedback("승인된 진료 기록과 안내 내용을 확인해 주세요."); return null; }
    const existingIds = new Set(state!.care_messages.map((item) => item.id));
    const result = await act("care.save", { visitId: sourceVisitId, ...(message && message.status === "draft" ? { messageId: message.id } : {}), draft_body: draftBody, stage, medication_course_id: stage === "visit_summary" ? null : courseId || null });
    const saved = result.state.care_messages.find((item) => message?.status === "draft" ? item.id === message.id : !existingIds.has(item.id) && item.patient_id === patientId);
    if (saved) { hydratedEditor.current = `${patientId}:${saved.id}`; setMessageId(saved.id); }
    setDirty(false);
    return result;
  }
  async function saveAndMove() {
    if (!pendingDestination || busy) return;
    setBusy(true); setFailed(false);
    try { const result = await saveDraft(); if (result) applyDestination(pendingDestination); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function perform(type: string, payload: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true); setFeedback(""); setFailed(false);
    try { await act(type, payload); setFeedback(success); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function generateAiDraft() {
    if (busy || dirty || !sourceVisitId) return;
    setBusy(true); setFailed(false); setFeedback("");
    try {
      const response = await fetch("/api/care/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitId: sourceVisitId, stage, medication_course_id: stage === "visit_summary" ? null : courseId || null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI 안내 초안을 만들지 못했습니다.");
      setGenerationJobId(body.jobId);
      await refresh();
      setFeedback("승인 계획과 확인된 환자 맥락으로 안내 초안을 생성하고 있습니다.");
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function save() {
    if (busy) return;
    setBusy(true); setFeedback(""); setFailed(false);
    try { if (await saveDraft()) setFeedback("안내 초안을 저장했습니다. 내용을 확인한 뒤 승인해 주세요."); }
    catch (error) { report(error); } finally { setBusy(false); }
  }

  return <main className={styles.workspace}>
    <header className={styles.pageHeader}><div><h1>고객 케어</h1><p>진료 후 안내와 환자 응답을 이어 확인합니다.</p></div></header>
    <nav className={styles.tabs} aria-label="후속 관리 분류">{([["contact", "연락 필요"], ["review", "안내 발송 검토"], ["medication", "복약 관리"]] as const).map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}<span>{tabCounts[key]}</span></button>)}</nav>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {pendingDestination && <div className={styles.unsaved} role="alert"><div><strong>저장하지 않은 안내가 있습니다.</strong><p>이동하기 전에 변경 내용을 처리해 주세요.</p></div><button type="button" onClick={saveAndMove} disabled={busy}>저장 후 이동</button><button type="button" onClick={() => applyDestination(pendingDestination)} disabled={busy}>변경 버리고 이동</button><button type="button" onClick={() => setPendingDestination(null)}>계속 편집</button></div>}
    <div className={styles.columns}>
      <aside className={styles.patientList} aria-label="관리할 환자"><div className={styles.listHeading}>{tab === "contact" ? "확인이 필요한 환자" : tab === "review" ? "안내를 검토할 환자" : "복약 중인 환자"}<span>{tabPatients.length}명</span></div>
        {tabPatients.length === 0 && <p className={styles.emptySmall}>이 분류에 남은 업무가 없습니다.</p>}
        {tabPatients.map((item) => {
          const responses = state.care_responses.filter((response) => response.patient_id === item.id).sort((a, b) => b.received_at.localeCompare(a.received_at));
          const nextMessage = state.care_messages.filter((message) => message.patient_id === item.id && message.status !== "sent").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
          const contactCount = openContacts.filter((contact) => contact.patient_id === item.id).length;
          return <button type="button" className={styles.patientButton} key={item.id} aria-current={patientId === item.id ? "true" : undefined} onClick={() => navigate({ patientId: item.id })}><img src={`/demo/portraits/${item.portrait_asset_key}.png`} alt="" width="44" height="54" /><span><strong>{item.display_name}{item.guardian && <small>보호자</small>}</strong><span>{item.chief_complaint}</span><small>{responses[0] ? `최근: ${RESPONSE_LABELS[responses[0].option]}` : "아직 응답 없음"}</small>{nextMessage && <small>예정 {formatClinicDate(nextMessage.scheduled_at)}</small>}</span>{contactCount > 0 && <i className={styles.contactCount}>{contactCount}</i>}</button>;
        })}
        {patient && !tabPatients.some((item) => item.id === patientId) && <div className={styles.currentOutside}><small>현재 확인 중</small><strong>{patient.display_name}</strong><p>이 분류의 남은 업무가 없습니다.</p></div>}
      </aside>
      <section className={styles.history} aria-label="진료와 안내 이력">
        {patient ? <><header className={styles.patientHeader}><div><h2>{patient.display_name}</h2><p>{patient.chief_complaint}{patient.guardian ? " · 보호자 응답" : ""}</p></div><Link href={`/clinic/patients/${patient.id}/progress`}>경과 보기 <ActionArrow direction="up-right" /></Link></header>
          {tab === "medication" && <section className={styles.medications}><h3>확인된 복용 일정</h3>{state.medication_courses.filter((course) => course.patient_id === patientId).map((course) => <div key={course.id}><strong>{course.medication_name ?? "처방명 미확인"}</strong><p>{formatClinicDate(`${course.start_date}T00:00:00+09:00`)} 시작 · {course.end_date ? `${formatClinicDate(`${course.end_date}T00:00:00+09:00`)} 종료` : "종료일 미확인"}{course.daily_frequency ? ` · 하루 ${course.daily_frequency}회` : " · 복용 횟수 미확인"}</p><p>{course.instructions}</p><small>{ORIGIN_LABELS[course.origin]}</small></div>)}</section>}
          <div className={styles.sectionHeading}><h3>진료·안내·응답 이력</h3><span>최근 순</span></div>
          <ol className={styles.timeline}>{timeline.map((event) => <li key={event.id} className={event.kind === "response" && event.response.option === "discomfort" ? styles.discomfortEvent : ""}><time dateTime={event.date}>{formatClinicDate(event.date, true)}</time>
            {event.kind === "soap" ? <><div className={styles.eventTitle}><strong>승인 진료 기록</strong><span className={styles.tag}>{ORIGIN_LABELS[event.soap.origin]}</span></div><p>{displayRecordText(event.soap.sections.s)}</p><Disclosure><summary>승인 SOAP 전체 보기</summary>{Object.entries(event.soap.sections).map(([key, value]) => <div className={styles.soapSection} key={key}><b>{key.toUpperCase()}</b><p>{displayRecordText(value)}</p></div>)}</Disclosure></> : event.kind === "message" ? <><div className={styles.eventTitle}><strong>{STAGE_LABELS[event.message.stage]}</strong><span className={styles.tag}>{MESSAGE_LABELS[event.message.status]}</span>{event.message.delivery_mode === "kakao_self" && <span className={styles.tag}>카카오톡</span>}</div><p className={styles.messageText}>{displayRecordText(event.message.approved_body ?? event.message.draft_body)}</p><button type="button" className={styles.textButton} onClick={() => navigate({ messageId: event.message.id })}>안내와 응답 확인 <ActionArrow /></button></> : <><div className={styles.eventTitle}><strong>{RESPONSE_LABELS[event.response.option]}</strong><span className={styles.tag}>{event.response.source === "demo_simulation" ? "직접 입력" : "카카오톡 응답"}</span></div>{event.response.detail && <p>{DETAIL_LABELS[event.response.detail]}</p>}{event.response.option === "discomfort" && <small>연락 작업에 연결됨 · 인과관계는 의료진 확인 필요</small>}{event.response.option === "will_book" && <small>예약 의향을 남긴 응답입니다. 실제 예약 완료와 구분합니다.</small>}</>}
          </li>)}</ol>
          {timeline.length === 0 && <p className={styles.empty}>아직 승인 진료나 안내·응답 이력이 없습니다.</p>}
        </> : <p className={styles.empty}>확인할 환자를 선택해 주세요.</p>}
      </section>
      <aside className={styles.inspector} aria-label="안내 검토와 연락 처리">
        {patient && <>
          {patientContacts.length > 0 && <section className={styles.contactSection}><h3>연락 처리 <span>{patientContacts.filter((contact) => contact.status === "open").length}건 필요</span></h3>{patientContacts.map((contact) => {
            const response = state.care_responses.find((item) => item.id === contact.response_id);
            return <div className={styles.contactTask} key={contact.id} data-contact-id={contact.id}><div className={styles.eventTitle}><strong>{contact.status === "open" ? "연락 필요" : "연락 완료"}</strong>{response && <time>{formatClinicDate(response.received_at, true)}</time>}</div><p>{response ? `${RESPONSE_LABELS[response.option]}${response.detail ? ` · ${DETAIL_LABELS[response.detail]}` : ""}` : contact.reason}</p><Disclosure><summary>연락 사유와 원문</summary><p>{displayRecordText(contact.reason)}</p>{response && <button type="button" className={styles.textButton} onClick={() => navigate({ messageId: response.message_id })}>원래 보낸 안내 확인 <ActionArrow /></button>}</Disclosure>{contact.status === "open" ? <><label className={styles.fieldLabel}>연락 결과<textarea rows={3} placeholder="직접 확인한 내용과 후속 조치를 남겨 주세요." value={contactNotes[contact.id] ?? ""} onChange={(event) => setContactNotes((current) => ({ ...current, [contact.id]: event.target.value }))} /></label><button type="button" className={styles.primary} disabled={busy || !contactNotes[contact.id]?.trim()} onClick={() => perform("contact.close", { contactId: contact.id, resolution_note: contactNotes[contact.id].trim() }, "연락 결과를 남기고 완료 처리했습니다.")}>연락 완료 처리</button></> : <p className={styles.closedNote}>{contact.resolution_note}<small>{contact.closed_at ? formatClinicDate(contact.closed_at, true) : ""} 처리</small></p>}</div>;
          })}</section>}
          <section className={styles.composeSection}><div className={styles.sectionHeading}><h3>안내 검토</h3><button type="button" className={styles.textButton} onClick={() => navigate({ newDraft: true })}>＋ 새 안내</button></div>
            <button type="button" className={styles.aiButton} disabled={busy || jobRunning || dirty || !data?.capabilities.ai || !sourceSoap || (stage !== "visit_summary" && !courseId) || (stage === "end_minus3" && !state.medication_courses.find((course) => course.id === courseId)?.end_date)} onClick={generateAiDraft}>{jobRunning ? "AI 안내 생성 중…" : "AI 맞춤 안내 초안 만들기"}</button>
            {!data?.capabilities.ai && <small>AI 연결을 설정하면 승인 기록으로 초안을 생성할 수 있습니다.</small>}
            {careJob && <div className={styles.aiJob} role="status"><strong>{careJob.status === "queued" ? "AI 작업 대기 중" : careJob.status === "running" ? "승인 기록에서 안내 정리 중" : careJob.status === "waiting_review" ? "AI 초안 · 의료진 검토 필요" : careJob.status === "failed" ? "AI 생성 실패" : "AI 생성 완료"}</strong>{careJob.error && <p>{careJob.error}</p>}</div>}
            <label className={styles.fieldLabel}>확인할 안내<AppSelect value={messageId} onChange={(event) => navigate({ messageId: event.target.value })}>{messageId === "new" && <option value="new">새 안내 초안</option>}{patientMessages.map((item) => <option key={item.id} value={item.id}>{STAGE_LABELS[item.stage]} · {MESSAGE_LABELS[item.status]} · {formatClinicDate(item.scheduled_at)}</option>)}</AppSelect></label>
            <CareStrategyPanel result={messageGeneration?.result} />
            {messageGeneration?.result?.care_context_version === "contextual-care-v1" && <div className={styles.contextReviewNotice}>{messageGeneration.result.stale_input === true ? <p role="alert">생성 중 환자 응답이나 확인 기록이 바뀌었습니다. 최신 맥락으로 다시 생성한 뒤 검토해 주세요.</p> : <p>안내 방향과 날짜별 근거를 대조하고 최종 문안을 편집·승인해 주세요.</p>}<button type="button" className={styles.textButton} disabled={busy || jobRunning || dirty || !data?.capabilities.ai} onClick={generateAiDraft}>최신 맥락으로 다시 생성</button>{dirty && <small>편집한 문안은 먼저 저장해 주세요. 재생성은 새 초안으로 남깁니다.</small>}</div>}
            {editable ? <><div className={styles.twoFields}><label className={styles.fieldLabel}>안내 시점<AppSelect value={stage} onChange={(event) => { setStage(event.target.value as CareMessage["stage"]); setDirty(true); }} disabled={Boolean(message)}>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</AppSelect></label><label className={styles.fieldLabel}>기준 진료<AppSelect value={sourceVisitId} onChange={(event) => { setSourceVisitId(event.target.value); setDirty(true); }} disabled={Boolean(message)}><option value="">승인 기록 선택</option>{patientVisits.filter((visit) => approvedSoaps.some((soap) => soap.visit_id === visit.id)).map((visit) => <option key={visit.id} value={visit.id}>{formatClinicDate(visit.scheduled_at)} · {visit.visit_no}회차</option>)}</AppSelect></label></div>
              {stage !== "visit_summary" && <label className={styles.fieldLabel}>기준 복약 과정<AppSelect value={courseId} onChange={(event) => { setCourseId(event.target.value); setDirty(true); }} disabled={Boolean(message)}><option value="">확인된 과정 선택</option>{state.medication_courses.filter((course) => course.patient_id === patientId).map((course) => <option key={course.id} value={course.id}>{course.medication_name ?? "처방명 미확인"} · {formatClinicDate(`${course.start_date}T00:00:00+09:00`)} 시작{!course.end_date ? " · 종료일 미확인" : ""}</option>)}</AppSelect>{stage === "end_minus3" && !state.medication_courses.find((course) => course.id === courseId)?.end_date && <small>종료일이 확인되어야 이 안내 일정을 만들 수 있습니다.</small>}</label>}
              <label className={styles.fieldLabel}>안내문 초안<textarea rows={8} placeholder="승인된 진료에서 확인된 관리·복용·다음 방문 안내를 작성해 주세요." value={draftBody} onChange={(event) => { setDraftBody(event.target.value); setDirty(true); }} /></label>
              {sourceSoap && <Disclosure className={styles.sourcePlan}><summary>기준 진료의 승인 계획 대조</summary><p>{sourceSoap.sections.p}</p></Disclosure>}
              <div className={styles.actionRow}><button type="button" disabled={busy || !dirty || !draftBody.trim() || !sourceVisitId || (stage !== "visit_summary" && !courseId) || (stage === "end_minus3" && !state.medication_courses.find((course) => course.id === courseId)?.end_date)} onClick={save}>초안 저장</button><button type="button" className={styles.primary} disabled={busy || dirty || !message || !draftBody.trim() || !sourceSoap} onClick={() => message && perform("care.approve", { messageId: message.id }, "내용을 승인했습니다. 카카오톡으로 발송할 수 있습니다.")}>내용 승인</button></div>
              <small>{dirty ? "저장하지 않은 변경이 있습니다. 먼저 초안을 저장해 주세요." : "승인하기 전 기준 진료 기록과 안내 내용을 확인해 주세요."}</small>
            </> : message ? <><div className={styles.approvedPreview}><div className={styles.eventTitle}><strong>발송 안내문</strong><span className={styles.tag}>{MESSAGE_LABELS[message.status]}</span></div><p>{displayRecordText(message.approved_body ?? "안내문을 확인할 수 없습니다.")}</p><small>{message.approved_at ? `${formatClinicDate(message.approved_at, true)} 승인` : "승인 시각 미확인"}</small></div>{(message.status === "approved" || message.delivery_mode === "kakao_self") && <KakaoSendButton key={message.id} message={message} busy={busy} onBusyChange={setBusy} onComplete={refresh}/>}<div className={styles.actionRow}><button type="button" disabled={busy} onClick={() => navigate({ newDraft: true, cloneBody: displayRecordText(message.approved_body ?? message.draft_body) })}>새 초안으로 수정</button></div></> : null}
            {messageGeneration && <TextPrivacyNotice audit={messageGeneration.result?.text_privacy}/>}
            {messageGeneration && <details className={styles.aiEvidence}><summary>문장별 근거와 확인할 정보</summary>{Array.isArray(messageGeneration.result?.missing_information) && messageGeneration.result.missing_information.map((item, index) => <p key={`missing-${index}`}>확인 필요: {String(item)}</p>)}{Array.isArray(messageGeneration.result?.review_notes) && messageGeneration.result.review_notes.map((item, index) => <p key={`note-${index}`}>{String(item)}</p>)}{Array.isArray(messageGeneration.result?.evidence) && messageGeneration.result.evidence.map((item, index) => { const evidence = objectValue(item); return evidence ? <div key={index}><strong>{typeof evidence.text === "string" ? evidence.text : ""}</strong>{typeof evidence.purpose === "string" && <small>{CARE_PURPOSE_LABELS[evidence.purpose] ?? "검토할 문장"}</small>}<CareEvidenceItem value={evidence} /></div> : null; })}<small>지난 보고는 현재 상태나 약의 인과관계를 확정하지 않습니다. 승인 전 의료진이 문안과 원문을 대조합니다.</small></details>}
            {message?.status === "sent" && message.delivery_mode === "kakao_self" && <p className={styles.empty}>카카오톡에서 안내 링크를 열어 응답하면 이력에 표시됩니다.</p>}
            {message?.status === "sent" && message.delivery_mode === "mock" && <section className={styles.simulator}><div className={styles.eventTitle}><h4>환자 응답 기록</h4><span className={styles.tag}>직접 입력</span></div><label className={styles.fieldLabel}>응답 선택<AppSelect aria-label="환자 응답" value={responseOption} onChange={(event) => { setResponseOption(event.target.value as CareResponse["option"]); setResponseDetail(null); }}>{optionsForStage(message.stage).map((option) => <option key={option} value={option}>{RESPONSE_LABELS[option]}</option>)}</AppSelect></label>{responseOption === "discomfort" && <label className={styles.fieldLabel}>불편 내용 (선택)<AppSelect aria-label="불편 상세 선택" value={responseDetail ?? ""} onChange={(event) => setResponseDetail(event.target.value ? event.target.value as CareResponse["detail"] : null)}><option value="">아직 상세 응답 없음</option>{Object.entries(DETAIL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</AppSelect></label>}<button type="button" className={styles.secondary} disabled={busy} onClick={() => perform("care.respond", { messageId: message.id, option: responseOption, detail: responseDetail, eventKey: `ui:${crypto.randomUUID()}` }, responseOption === "discomfort" ? "불편 응답을 기록하고 연락 작업을 생성했습니다." : "응답을 기록했습니다.")}>응답 기록</button>{responseOption === "discomfort" && <small>상세 응답이 없어도 바로 연락 필요로 연결합니다.</small>}</section>}
          </section>
          {feedback && <p className={failed ? styles.error : styles.feedback} role={failed ? "alert" : "status"}>{feedback}</p>}
        </>}
      </aside>
    </div>
  </main>;
}
