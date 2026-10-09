"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/client";
import type { FollowupItem, SourceRef, Treatment } from "@/lib/types";
import AudioControls from "@/components/audio/AudioControls";
import { FollowupEditor } from "@/components/progress/FollowupEditor";
import { useLeaveGuard } from "./useLeaveGuard";
import {
  Badge,
  demographics,
  Empty,
  errorMessage,
  fullDate,
  itemLabels,
  LoadState,
  modalityLabels,
  NrsSparkline,
  panelTitle,
  Portrait,
  recordLabels,
  regionLabels,
  shortDate,
  sideLabels,
  WorkflowBadge,
  type Patient,
  type Sections,
  type Soap,
  type State,
  type Visit,
} from "./shared";
import "./clinic.css";

const emptySections: Sections = { s: "", o: "", a: "", p: "" };
const sectionMeta = [
  {
    key: "s",
    title: "Subjective",
    label: "증상·경과",
    placeholder: "환자 또는 보호자가 이야기한 증상과 경과를 기록하세요.",
  },
  {
    key: "o",
    title: "Objective",
    label: "관찰·검사",
    placeholder: "오늘 확인한 소견과 검사 결과를 기록하세요.",
  },
  {
    key: "a",
    title: "Assessment",
    label: "평가",
    placeholder: "의료진의 평가를 기록하세요.",
  },
  {
    key: "p",
    title: "Plan",
    label: "치료·계획",
    placeholder: "실제 시행한 치료와 앞으로의 계획을 구분해 기록하세요.",
  },
] as const;
type Act = ReturnType<typeof useAppState>["act"];

function latestSoap(state: State, visitId: string) {
  return state.soap_documents
    .filter((document) => document.visit_id === visitId)
    .sort((a, b) => b.revision - a.revision)[0];
}

function ReadOnlySoap({ document }: { document?: Soap }) {
  if (!document) return <Empty title="승인된 기록이 없어요" />;
  return (
    <div className="hs-readonly-soap">
      {sectionMeta.map((section) => (
        <div key={section.key}>
          <span>{section.key.toUpperCase()}</span>
          <p>{document.sections[section.key] || "기록 없음"}</p>
        </div>
      ))}
    </div>
  );
}

function PatientRail({
  state,
  patient,
  visit,
  act,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  act: Act;
}) {
  const [notes, setNotes] = useState(patient.notes || "");
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLeaveGuard(isEditing && notes !== (patient.notes || ""));
  async function saveNote() {
    setBusy(true);
    setError("");
    try {
      await act("patient.note", { patientId: patient.id, notes });
      setIsEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="hs-patient-rail">
      <section className="hs-panel hs-identity-panel">
        {panelTitle(
          "환자 정보",
          <Link
            href={`/clinic/patients/${patient.id}`}
            className="hs-text-link"
          >
            전체 이력 ↗
          </Link>,
        )}
        <div className="hs-identity">
          <Portrait patient={patient} size="large" />
          <div>
            <strong>{patient.display_name}</strong>
            <span>{demographics(patient, visit.scheduled_at)}</span>
            <span className="hs-muted">
              차트 {patient.demo_key} · 가상 환자
            </span>
          </div>
        </div>
        <dl className="hs-patient-details">
          <div>
            <dt>주소증</dt>
            <dd>{patient.chief_complaint}</dd>
          </div>
          <div>
            <dt>생년월일</dt>
            <dd>{patient.birth_date}</dd>
          </div>
          {patient.guardian && (
            <div>
              <dt>보호자</dt>
              <dd>
                {patient.guardian.display_name} ·{" "}
                {patient.guardian.relationship}
              </dd>
            </div>
          )}
          <div>
            <dt>방문</dt>
            <dd>
              {visit.visit_no === 1 ? "초진" : `${visit.visit_no}번째 방문`}
            </dd>
          </div>
        </dl>
      </section>
      <section className="hs-panel hs-memo-panel">
        {panelTitle(
          "환자 메모",
          <button
            className="hs-text-button"
            onClick={() => {
              setNotes(patient.notes || "");
              setIsEditing(!isEditing);
            }}
          >
            {isEditing ? "취소" : "수정"}
          </button>,
        )}
        {isEditing ? (
          <>
            <label className="hs-sr-only" htmlFor="patient-note">
              환자 메모
            </label>
            <textarea
              id="patient-note"
              className="hs-note-input"
              rows={6}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <button
              className="hs-button hs-button-small"
              disabled={busy}
              onClick={saveNote}
            >
              {busy ? "저장 중…" : "메모 저장"}
            </button>
          </>
        ) : (
          <p className="hs-patient-note">
            {patient.notes || "등록된 메모가 없어요."}
          </p>
        )}
        {error && (
          <p role="alert" className="hs-inline-error">
            {error}
          </p>
        )}
      </section>
    </aside>
  );
}

function SoapEditor({
  document,
  visit,
  state,
  act,
}: {
  document?: Soap;
  visit: Visit;
  state: State;
  act: Act;
}) {
  const [sections, setSections] = useState<Sections>(
    document?.sections || emptySections,
  );
  const [baseId, setBaseId] = useState(document?.id);
  const [baseRevision, setBaseRevision] = useState(document?.revision);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState<SourceRef | null>(null);
  const remoteChanged =
    document?.id !== baseId || document?.revision !== baseRevision;
  const isEmpty = !Object.values(sections).some((value) => value.trim());
  useEffect(() => {
    if (!dirty && remoteChanged) {
      setSections(document?.sections || emptySections);
      setBaseId(document?.id);
      setBaseRevision(document?.revision);
    }
  }, [document, dirty, remoteChanged]);
  useLeaveGuard(dirty);
  async function save() {
    if (dirty && remoteChanged) {
      setError(
        "새 기록이 저장됐어요. 최신 기록을 확인한 뒤 편집 내용을 반영해 주세요.",
      );
      return;
    }
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const updated = await act("soap.save", {
        visitId: visit.id,
        sections,
        soapId: baseId,
        expectedSoapId: baseId ?? null,
        revision: baseRevision,
        source_refs: document?.source_refs || [],
      });
      const saved = latestSoap(updated.state, visit.id);
      setSections(saved?.sections || sections);
      setBaseId(saved?.id);
      setBaseRevision(saved?.revision);
      setDirty(false);
      setNotice("초안을 저장했어요.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function approve() {
    if (!document || dirty) return;
    setBusy("approve");
    setError("");
    setNotice("");
    try {
      await act("soap.approve", {
        visitId: visit.id,
        soapId: document.id,
        revision: document.revision,
      });
      setNotice("이 기록을 의료진 승인본으로 저장했어요.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function copyApproved() {
    if (document?.status !== "approved") return;
    try {
      await navigator.clipboard.writeText(
        sectionMeta
          .map(
            (item) =>
              `${item.key.toUpperCase()}:\n${document.sections[item.key]}`,
          )
          .join("\n\n"),
      );
      setNotice("승인된 SOAP를 복사했어요.");
    } catch {
      setError("복사 권한이 없어요. 승인 기록을 직접 선택해 복사해 주세요.");
    }
  }
  return (
    <div className="hs-soap-editor">
      <div className="hs-soap-toolbar">
        <div>
          <h2>오늘 진료 기록</h2>
          <span>
            {document ? `버전 ${document.revision}` : "새 기록"}
            <span className="hs-separator">·</span>
            {dirty
              ? "미저장 변경"
              : document?.status === "approved"
                ? "의료진 승인됨"
                : document
                  ? "초안 저장됨"
                  : "기록 전"}
          </span>
        </div>
        <Badge
          tone={document?.status === "approved" && !dirty ? "green" : "blue"}
        >
          {dirty
            ? "편집 중"
            : document?.status === "approved"
              ? "승인본"
              : "검토 초안"}
        </Badge>
      </div>
      {dirty && remoteChanged && (
        <div className="hs-warning">
          다른 화면에서 새 기록이 저장됐어요. 현재 편집을 보존하고 있습니다.
          <button
            className="hs-text-button"
            onClick={() => {
              setSections(document?.sections || emptySections);
              setBaseId(document?.id);
              setBaseRevision(document?.revision);
              setDirty(false);
            }}
          >
            최신 기록 불러오기
          </button>
        </div>
      )}
      <div className="hs-soap-fields">
        {sectionMeta.map((section) => (
          <label
            className={`hs-soap-field hs-soap-${section.key}`}
            key={section.key}
          >
            <div className="hs-soap-letter">{section.key.toUpperCase()}</div>
            <div className="hs-soap-content">
              <span className="hs-soap-field-title">
                {section.label}
                <small>{section.title}</small>
              </span>
              <textarea
                aria-label={`${section.key.toUpperCase()} ${section.label}`}
                value={sections[section.key]}
                placeholder={section.placeholder}
                onChange={(event) => {
                  const value = event.target.value;
                  setSections((current) => ({
                    ...current,
                    [section.key]: value,
                  }));
                  setDirty(true);
                  setNotice("");
                }}
              />
            </div>
          </label>
        ))}
      </div>
      {!!document?.source_refs.length && (
        <div className="hs-evidence-links">
          <span>기록 근거</span>
          {document.source_refs.map((source, index) => (
            <button
              key={`${source.source_id}-${index}`}
              onClick={() => setEvidence(source)}
              aria-expanded={evidence === source}
            >
              {index + 1}
              <span className="hs-sr-only">번 근거 보기</span>
            </button>
          ))}
        </div>
      )}
      {evidence && (
        <div className="hs-evidence-preview">
          <div>
            <Badge>
              {evidence.origin === "provided_case"
                ? "제공 사례"
                : evidence.origin === "synthetic_history"
                  ? "합성 이력"
                  : evidence.kind === "care_response"
                    ? "환자 응답"
                    : "기록 근거"}
            </Badge>
            <button
              className="hs-icon-button"
              onClick={() => setEvidence(null)}
              aria-label="근거 닫기"
            >
              ×
            </button>
          </div>
          <blockquote>{evidence.quote || "인용 구간 없음"}</blockquote>
          <p>{evidence.source_id}</p>
        </div>
      )}
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hs-save-notice" role="status">
          {notice}
        </p>
      )}
      <div className="hs-soap-footer">
        <span className="hs-muted">
          전사와 오늘 시행 내용을 대조한 뒤 승인하세요.
        </span>
        <div>
          {document?.status === "approved" && !dirty && (
            <button className="hs-button" onClick={copyApproved}>
              EMR 복사
            </button>
          )}
          <button
            className="hs-button"
            disabled={
              !!busy ||
              isEmpty ||
              (!dirty && !!document) ||
              (dirty && remoteChanged)
            }
            onClick={save}
          >
            {busy === "save" ? "저장 중…" : "초안 저장"}
          </button>
          <button
            className="hs-button hs-button-primary"
            disabled={
              !!busy ||
              dirty ||
              !document ||
              document.status === "approved" ||
              isEmpty
            }
            onClick={approve}
          >
            {busy === "approve"
              ? "승인 중…"
              : document?.status === "approved" && !dirty
                ? "승인 완료"
                : "검토 후 승인"}
          </button>
        </div>
      </div>
      {state.jobs.some(
        (job) =>
          job.visit_id === visit.id &&
          ["queued", "running"].includes(job.status),
      ) && (
        <p className="hs-muted hs-job-notice">
          음성 작업이 진행 중입니다. 현재 기록은 그대로 보존됩니다.
        </p>
      )}
    </div>
  );
}

function TranscriptEvidence({
  state,
  visitId,
}: {
  state: State;
  visitId: string;
}) {
  const transcripts = state.transcripts
    .filter((item) => item.visit_id === visitId)
    .sort((a, b) => b.revision - a.revision);
  const [selectedId, setSelectedId] = useState("");
  const transcript =
    transcripts.find((item) => item.id === selectedId) || transcripts[0];
  if (!transcript)
    return (
      <div className="hs-transcript-empty">
        <Empty title="아직 전사된 음성이 없어요">
          상단에서 녹음하거나 음성 파일을 업로드해 주세요.
        </Empty>
      </div>
    );
  const speakerLabels: Record<string, string> = {
    clinician: "의료진",
    patient: "환자",
    guardian: "보호자",
    unknown: "화자 미확인",
  };
  return (
    <div className="hs-transcript-view">
      <div className="hs-soap-toolbar">
        <div>
          <h2>전사 원문 대조</h2>
          <span>화자와 표현을 확인해 기록의 근거로 사용하세요.</span>
        </div>
        <label className="hs-select-label">
          <span className="hs-sr-only">전사 버전</span>
          <select
            value={transcript.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {transcripts.map((item) => (
              <option key={item.id} value={item.id}>
                v{item.revision} ·{" "}
                {item.status === "reviewed" ? "검토 전사" : "원문"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hs-transcript-segments">
        {transcript.segments.length ? (
          transcript.segments.map((segment) => (
            <div className="hs-transcript-segment" key={segment.id}>
              <div>
                <Badge
                  tone={segment.speaker === "clinician" ? "blue" : "neutral"}
                >
                  {speakerLabels[segment.speaker]}
                </Badge>
                {segment.start_ms !== null && (
                  <span>
                    {Math.floor(segment.start_ms / 60000)}:
                    {String(Math.floor(segment.start_ms / 1000) % 60).padStart(
                      2,
                      "0",
                    )}
                  </span>
                )}
              </div>
              <p>{segment.text}</p>
            </div>
          ))
        ) : (
          <p>{transcript.text}</p>
        )}
      </div>
    </div>
  );
}

function TreatmentPane({
  state,
  visit,
  act,
}: {
  state: State;
  visit: Visit;
  act: Act;
}) {
  const treatments = state.treatments.filter(
    (item) => item.visit_id === visit.id,
  );
  const candidates = state.live_events.filter(
    (item) => item.visit_id === visit.id && item.status === "suggested",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function update(treatment: Treatment, remove: boolean) {
    setBusy(treatment.id);
    setError("");
    try {
      await act(remove ? "treatment.remove" : "treatment.confirm", {
        treatmentId: treatment.id,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function reviewCandidate(eventId: string, dismiss: boolean) {
    setBusy(eventId);
    setError("");
    try {
      await act(dismiss ? "live.dismiss" : "live.accept", { eventId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="hs-panel hs-treatment-panel">
      {panelTitle(
        "오늘 시술",
        <Link
          className="hs-button hs-button-small"
          href={`/tablet/visits/${visit.id}`}
          target="_blank"
        >
          iPad 화면 열기 ↗
        </Link>,
      )}
      {treatments.length ? (
        <div className="hs-treatment-list">
          {treatments.map((treatment) => (
            <div className="hs-treatment-row" key={treatment.id}>
              <div className="hs-treatment-icon" aria-hidden="true">
                {treatment.modality === "pharmacopuncture"
                  ? "약"
                  : treatment.technique === "needle_knife"
                    ? "도"
                    : modalityLabels[treatment.modality]}
              </div>
              <div className="hs-treatment-main">
                <strong>
                  {treatment.technique === "needle_knife"
                    ? "도침"
                    : modalityLabels[treatment.modality]}
                  <span>
                    {sideLabels[treatment.laterality]}{" "}
                    {regionLabels[treatment.body_region] ||
                      treatment.body_region}
                  </span>
                </strong>
                <p>
                  {treatment.locations?.length
                    ? treatment.locations
                        .map(
                          (location) =>
                            location.label_ko || location.location_note,
                        )
                        .join(" · ")
                    : treatment.acupoints.length
                      ? treatment.acupoints
                          .map((point) => `${point.label_ko} ${point.code}`)
                          .join(" · ")
                      : "선택된 혈자리 없음"}
                </p>
                {treatment.notes && <small>{treatment.notes}</small>}
              </div>
              <div className="hs-treatment-actions">
                <Badge
                  tone={treatment.status === "confirmed" ? "green" : "amber"}
                >
                  {treatment.status === "confirmed" ? "시행 확인" : "확인 전"}
                </Badge>
                {treatment.status === "suggested" && (
                  <button
                    className="hs-text-button"
                    disabled={busy === treatment.id}
                    onClick={() => update(treatment, false)}
                  >
                    시행 확인
                  </button>
                )}
                <button
                  className="hs-text-button hs-remove-button"
                  disabled={busy === treatment.id}
                  onClick={() => update(treatment, true)}
                >
                  제외
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="아직 오늘 시술 기록이 없어요">
          iPad에서 부위와 혈자리를 선택하면 여기에 표시돼요.
        </Empty>
      )}
      {!!candidates.length && (
        <div className="hs-live-candidates">
          <span className="hs-overline">음성에서 감지한 시술 후보</span>
          {candidates.map((candidate) => (
            <div key={candidate.id}>
              <Badge tone="blue">
                {candidate.technique === "needle_knife"
                  ? "도침"
                  : modalityLabels[candidate.modality]}
              </Badge>
              <p>{candidate.text}</p>
              <span>
                {candidate.context === "planned"
                  ? "계획 발화"
                  : candidate.context === "past"
                    ? "과거 발화"
                    : candidate.context === "negated"
                      ? "시행하지 않는 발화"
                      : "시행 여부 확인 필요"}
              </span>
              <div className="hs-live-candidate-actions">
                {!["past", "negated"].includes(candidate.context) && (
                  <button
                    className="hs-text-button"
                    disabled={busy === candidate.id}
                    onClick={() => reviewCandidate(candidate.id, false)}
                  >
                    시술 후보에 추가
                  </button>
                )}
                <button
                  className="hs-text-button hs-remove-button"
                  disabled={busy === candidate.id}
                  onClick={() => reviewCandidate(candidate.id, true)}
                >
                  제외
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PendingChecks({
  state,
  patient,
  visit,
  act,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  act: Act;
}) {
  const items = state.followup_items.filter(
    (item) =>
      item.patient_id === patient.id &&
      item.status === "pending" &&
      item.source_visit_id !== visit.id &&
      (state.visits.find((source) => source.id === item.source_visit_id)
        ?.scheduled_at || "") < visit.scheduled_at,
  );
  const nextItems = state.followup_items.filter(
    (item) =>
      item.patient_id === patient.id &&
      item.status === "pending" &&
      item.source_visit_id === visit.id,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  async function resolve(item: FollowupItem) {
    setBusy(item.id);
    setError("");
    try {
      await act("followup.resolve", { itemId: item.id, visitId: visit.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function add() {
    if (!title.trim()) return;
    setBusy("new");
    setError("");
    try {
      await act("followup.create", {
        visitId: visit.id,
        title: title.trim(),
        item_key: "questions_concerns",
      });
      setTitle("");
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="hs-panel hs-checks-panel">
      {panelTitle(
        "오늘 확인할 것",
        <span className="hs-small-count">{items.length}</span>,
      )}
      {items.length ? (
        <ul className="hs-check-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                className="hs-check-control"
                aria-label={`${item.title} 확인 완료`}
                disabled={busy === item.id}
                onClick={() => resolve(item)}
              >
                <span aria-hidden="true" />
              </button>
              <div>
                <p>{item.title}</p>
                <span>
                  {itemLabels[item.item_key]} ·{" "}
                  {shortDate(
                    state.visits.find(
                      (source) => source.id === item.source_visit_id,
                    )?.scheduled_at || visit.scheduled_at,
                  )}{" "}
                  기록
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hs-muted hs-padding">남은 확인 항목이 없어요.</p>
      )}
      {nextItems.length > 0 && (
        <div className="hs-next-checks">
          <span className="hs-overline">다음 방문에 확인</span>
          {nextItems.map((item) => (
            <p key={item.id}>{item.title}</p>
          ))}
        </div>
      )}
      {adding ? (
        <div className="hs-add-check">
          <label htmlFor="next-check">다음 방문에 확인할 내용</label>
          <input
            id="next-check"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="확인할 내용을 입력하세요"
          />
          <div>
            <button className="hs-text-button" onClick={() => setAdding(false)}>
              취소
            </button>
            <button
              className="hs-button hs-button-small"
              disabled={!title.trim() || busy === "new"}
              onClick={add}
            >
              추가
            </button>
          </div>
        </div>
      ) : (
        <button className="hs-add-check-button" onClick={() => setAdding(true)}>
          ＋ 확인 항목 추가
        </button>
      )}
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function NrsPanel({
  state,
  patient,
  visit,
  act,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  act: Act;
}) {
  const measurements = state.observations
    .filter(
      (item) =>
        item.patient_id === patient.id &&
        item.instrument === "NRS" &&
        item.metric_key === "pain_intensity" &&
        item.body_region === "ankle" &&
        item.laterality === "right" &&
        item.activity_key === null &&
        item.measurement_context === "current_pain" &&
        new Date(item.measured_at).getTime() <=
          new Date(`${state.meta.demo_today}T23:59:59+09:00`).getTime(),
    )
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const observations = [
    ...new Map(measurements.map((item) => [item.visit_id, item])).values(),
  ];
  const today = observations.find((item) => item.visit_id === visit.id);
  const previous = observations
    .filter((item) => item.visit_id !== visit.id)
    .at(-1);
  const [value, setValue] = useState(today ? String(today.value) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (value === "") return;
    setBusy(true);
    setError("");
    try {
      await act("observation.save", {
        visitId: visit.id,
        value: Number(value),
        metric_key: "pain_intensity",
        instrument: "NRS",
        body_region: previous?.body_region || "ankle",
        laterality: previous?.laterality || "right",
        measurement_context: "current_pain",
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hs-panel hs-nrs-panel">
      {panelTitle(
        "통증 NRS",
        <Link
          href={`/clinic/patients/${patient.id}/progress`}
          className="hs-text-link"
        >
          경과 보기 ↗
        </Link>,
      )}
      <p className="hs-metric-context">오른쪽 발목 · 현재 통증</p>
      <div className="hs-nrs-summary">
        <div>
          <span>오늘</span>
          <strong>
            {today ? today.value : "—"}
            <small>/ 10</small>
          </strong>
        </div>
        <div>
          <span>직전 방문</span>
          <strong className="hs-prior-score">
            {previous ? previous.value : "—"}
            <small>
              {previous ? shortDate(previous.measured_at) : "미확인"}
            </small>
          </strong>
        </div>
      </div>
      <NrsSparkline
        points={observations.map((item) => ({
          value: item.value,
          label: shortDate(item.measured_at),
        }))}
      />
      <form
        className="hs-nrs-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label htmlFor="today-nrs">오늘 확인한 점수</label>
        <div>
          <input
            id="today-nrs"
            type="number"
            min="0"
            max="10"
            step="1"
            placeholder="미확인"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            className="hs-button hs-button-small"
            disabled={
              busy || value === "" || Number(value) < 0 || Number(value) > 10
            }
          >
            {busy ? "저장 중" : "저장"}
          </button>
        </div>
      </form>
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

type BriefingPoint = {
  text: string;
  source_soap_id: string;
  section: string;
  quote: string;
};

function BriefingResult({
  state,
  visit,
  aiAvailable,
  refresh,
}: {
  state: State;
  visit: Visit;
  aiAvailable: boolean;
  refresh: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BriefingPoint | null>(null);
  const jobs = state.jobs
    .filter(
      (job) =>
        job.visit_id === visit.id &&
        job.kind === "analysis" &&
        job.result?.task === "briefing",
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pending = jobs.find((job) =>
    ["queued", "running"].includes(job.status),
  );
  const completed = jobs.find((job) => job.status === "completed");
  const result = completed?.result;
  const points = (Array.isArray(result?.points) ? result.points : []).filter(
    (point): point is BriefingPoint =>
      !!point &&
      typeof point.text === "string" &&
      typeof point.source_soap_id === "string" &&
      typeof point.section === "string" &&
      typeof point.quote === "string",
  );
  const missing = (
    Array.isArray(result?.missing_information) ? result.missing_information : []
  ).filter((item): item is string => typeof item === "string");
  const sourceSoap = selected
    ? state.soap_documents.find((item) => item.id === selected.source_soap_id)
    : undefined;
  const sourceVisit = sourceSoap
    ? state.visits.find((item) => item.id === sourceSoap.visit_id)
    : undefined;
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/briefing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: visit.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : body.error?.message || "브리핑을 만들지 못했어요.",
        );
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hs-ai-briefing">
      <div className="hs-ai-briefing-toolbar">
        <span>과거 승인 기록 요약</span>
        <button
          className="hs-text-button"
          disabled={!aiAvailable || busy || !!pending}
          onClick={generate}
        >
          {busy || pending
            ? "요약 중…"
            : result
              ? "다시 요약"
              : "AI 브리핑 만들기"}
        </button>
      </div>
      {!aiAvailable && (
        <p className="hs-muted">AI 연결 후 과거 기록을 요약할 수 있어요.</p>
      )}
      {result && (
        <>
          <Badge tone="blue">AI 요약 · 의료진 검토</Badge>
          {typeof result.summary === "string" && (
            <p className="hs-ai-briefing-summary">{result.summary}</p>
          )}
          {points.length > 0 && (
            <ul>
              {points.map((point, index) => (
                <li key={`${point.source_soap_id}-${index}`}>
                  <button
                    onClick={() =>
                      setSelected(selected === point ? null : point)
                    }
                  >
                    {point.text}
                    <span aria-hidden="true">{index + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <div className="hs-briefing-quote">
              <span>
                {sourceVisit ? shortDate(sourceVisit.scheduled_at) : "이전"}{" "}
                승인 기록 · {selected.section.toUpperCase()}
              </span>
              <blockquote>{selected.quote}</blockquote>
              <button
                className="hs-text-button"
                onClick={() => setSelected(null)}
              >
                근거 닫기
              </button>
            </div>
          )}
          {missing.length > 0 && (
            <details>
              <summary>추가 확인 {missing.length}개</summary>
              {missing.map((item, index) => (
                <p key={index}>{item}</p>
              ))}
            </details>
          )}
        </>
      )}
      {jobs[0]?.status === "failed" && (
        <p className="hs-inline-error" role="alert">
          {jobs[0].error || "이전 요약에 실패했어요. 다시 시도해 주세요."}
        </p>
      )}
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PastVisitPanel({
  state,
  patient,
  visit,
  aiAvailable,
  refresh,
  needsContact,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  aiAvailable: boolean;
  refresh: () => unknown;
  needsContact: boolean;
}) {
  const history = state.visits
    .filter((item) => item.patient_id === patient.id && item.scheduled_at < visit.scheduled_at)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const [tab, setTab] = useState<"briefing" | "records">("briefing");
  const [selectedId, setSelectedId] = useState(history[0]?.id || "");
  const selectedVisit = history.find((item) => item.id === selectedId) || history[0];
  const document = selectedVisit
    ? state.soap_documents
        .filter((item) => item.visit_id === selectedVisit.id && item.status === "approved")
        .sort((a, b) => b.revision - a.revision)[0]
    : undefined;
  const hasSummary = state.jobs.some((job) =>
    job.visit_id === visit.id && job.kind === "analysis" && job.status === "completed" &&
    job.result?.task === "briefing" && typeof job.result.summary === "string" && !!job.result.summary.trim(),
  );
  const prefix = `past-${visit.id}`;
  return (
    <section className="hs-panel hs-past-panel">
      {panelTitle("진료 이력", <span className="hs-muted">이전 {history.length}회</span>)}
      <div
        className="hs-chart-tabs hs-past-tabs"
        role="tablist"
        aria-label="이전 진료와 재진 브리핑"
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" || event.key === "ArrowLeft"
            ? tab === "briefing" ? "records" : "briefing"
            : event.key === "Home" ? "briefing" : event.key === "End" ? "records" : null;
          if (next) {
            event.preventDefault();
            setTab(next);
            globalThis.document.getElementById(`${prefix}-tab-${next}`)?.focus();
          }
        }}
      >
        {(["briefing", "records"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${prefix}-tab-${value}`}
            aria-controls={`${prefix}-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "is-selected" : ""}
            onClick={() => setTab(value)}
          >
            {value === "briefing" ? "재진 브리핑" : "이전 진료"}
          </button>
        ))}
      </div>
      <div id={`${prefix}-panel-briefing`} role="tabpanel" aria-labelledby={`${prefix}-tab-briefing`} hidden={tab !== "briefing"}>
        <div className="hs-briefing-content">
          <span className="hs-overline">
            {history[0] ? `${shortDate(history[0].scheduled_at)} 마지막 진료` : "첫 방문"}
          </span>
          <h3>{patient.chief_complaint}</h3>
          {!hasSummary && <p>{history[0]?.summary || "이전 기록이 없어요. 오늘 들은 증상과 관찰 소견부터 기록하세요."}</p>}
          {history.length > 0 && <BriefingResult state={state} visit={visit} aiAvailable={aiAvailable} refresh={refresh} />}
        </div>
      </div>
      <div id={`${prefix}-panel-records`} role="tabpanel" aria-labelledby={`${prefix}-tab-records`} hidden={tab !== "records"}>
        {history.length ? <>
          <div className="hs-history-dates">
            {history.map((item) => <button
              type="button"
              key={item.id}
              aria-pressed={selectedVisit?.id === item.id}
              className={selectedVisit?.id === item.id ? "is-selected" : ""}
              onClick={() => setSelectedId(item.id)}
            >
              <span>{shortDate(item.scheduled_at)}</span>
              <span>{item.visit_no === 1 ? "초진" : "재진"}</span>
            </button>)}
          </div>
          <div className="hs-history-subtitle">
            <strong>{selectedVisit?.reason}</strong>
            {document && <Badge tone="green">승인 기록</Badge>}
          </div>
          <ReadOnlySoap document={document} />
        </> : <Empty title="이전 진료 기록이 없어요" />}
      </div>
      {needsContact && <div className="hs-past-contact">
        <Link href="/clinic/care" className="hs-contact-alert">
          <span>!</span>
          <div><strong>불편 응답 확인 필요</strong><p>최근 응답과 현재 상태를 확인해 주세요.</p></div>
          <span aria-hidden="true">↗</span>
        </Link>
      </div>}
    </section>
  );
}

function ContextRail({
  state,
  patient,
  visit,
  aiAvailable,
  refresh,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  aiAvailable: boolean;
  refresh: () => unknown;
}) {
  return (
    <aside className="hs-context-rail">
      <PastVisitPanel
        key={visit.id}
        state={state}
        patient={patient}
        visit={visit}
        aiAvailable={aiAvailable}
        refresh={refresh}
        needsContact={state.contact_tasks.some((item) => item.patient_id === patient.id && item.status === "open")}
      />
    </aside>
  );
}

function TodayFollowupPanels({
  state,
  patient,
  visit,
  act,
}: {
  state: State;
  patient: Patient;
  visit: Visit;
  act: Act;
}) {
  const responses = state.care_responses
    .filter((item) => item.patient_id === patient.id)
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
    .slice(0, 3);
  const responseLabels: Record<string, string> = {
    taking_well: "잘 복용하고 있어요",
    discomfort: "불편한 점이 있어요",
    improving: "나아지고 있어요",
    unsure: "잘 모르겠어요",
    will_book: "예약할게요",
    will_wait: "조금 더 지켜볼게요",
  };
  const responseDetails: Record<string, string> = {
    stomach_discomfort: "속이 불편해요",
    difficulty_taking: "복용하기 어려워요",
    other: "기타 불편",
  };
  return (
    <div className="hs-today-followup" aria-label="오늘 경과와 확인 사항">
      {patient.demo_key === "A" ? (
        <NrsPanel state={state} patient={patient} visit={visit} act={act} />
      ) : (
        <section className="hs-panel hs-child-metric">
          {panelTitle(
            "증상 경과",
            <Link
              href={`/clinic/patients/${patient.id}/progress`}
              className="hs-text-link"
            >
              경과 보기 ↗
            </Link>,
          )}
          <p>야뇨 횟수와 수면 변화를 각각 확인하세요.</p>
          <span className="hs-muted">
            지난 횟수는 오늘 값으로 채우지 않습니다.
          </span>
        </section>
      )}
      <PendingChecks state={state} patient={patient} visit={visit} act={act} />
      <section className="hs-panel hs-responses-panel">
        {panelTitle(
          "지난 환자 응답",
          <Link href="/clinic/care" className="hs-text-link">
            전체 보기 ↗
          </Link>,
        )}
        {responses.length ? (
          responses.map((response) => (
            <div className="hs-response" key={response.id}>
              <div>
                <span>{shortDate(response.received_at)}</span>
                <Badge
                  tone={response.option === "discomfort" ? "amber" : "neutral"}
                >
                  모의 응답
                </Badge>
              </div>
              <strong>
                {responseLabels[response.option] || response.option}
              </strong>
              {response.detail && (
                <p>{responseDetails[response.detail] || response.detail}</p>
              )}
            </div>
          ))
        ) : (
          <Empty title="아직 받은 응답이 없어요" />
        )}
      </section>
    </div>
  );
}

export default function VisitWorkspace({ visitId }: { visitId: string }) {
  const { data, loading, error, refresh, act } = useAppState();
  const [tab, setTab] = useState<"soap" | "transcript" | "followup">("soap");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  if (!data)
    return <LoadState loading={loading} error={error} retry={refresh} />;
  const state = data.state;
  const visit = state.visits.find((item) => item.id === visitId);
  const patient = state.patients.find((item) => item.id === visit?.patient_id);
  if (!visit || !patient)
    return (
      <div className="clinic-surface hs-load">
        <Empty title="진료 기록을 찾을 수 없어요" />
        <Link className="hs-button" href="/clinic">
          오늘 환자로 돌아가기
        </Link>
      </div>
    );
  const document = latestSoap(state, visitId);
  async function changeVisit() {
    if (!visit) return;
    setBusy(true);
    setActionError("");
    try {
      await act(
        visit.workflow_status === "waiting"
          ? "visit.start"
          : visit.workflow_status === "completed"
            ? "visit.reopen"
            : "visit.complete",
        { visitId },
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="clinic-surface hs-workspace">
      <header className="hs-visit-header">
        <div className="hs-visit-patient">
          <Link href="/clinic" className="hs-back" aria-label="오늘 환자 목록">
            ‹
          </Link>
          <Portrait patient={patient} size="small" />
          <div>
            <h1>
              {patient.display_name}
              <span>{demographics(patient, visit.scheduled_at)}</span>
            </h1>
            <p>
              {fullDate(visit.scheduled_at)}
              <span className="hs-separator">·</span>
              {visit.visit_no === 1 ? "초진" : `${visit.visit_no}번째 방문`}
            </p>
          </div>
          <WorkflowBadge status={visit.workflow_status} />
        </div>
        <div className="hs-visit-header-actions">
          <span className="hs-record-state">
            <span />
            {recordLabels[visit.record_status] || visit.record_status}
          </span>
          <button
            className={`hs-button ${visit.workflow_status === "waiting" ? "hs-button-primary" : ""}`}
            disabled={busy}
            onClick={changeVisit}
          >
            {busy
              ? "저장 중…"
              : visit.workflow_status === "waiting"
                ? "진료 시작"
                : visit.workflow_status === "completed"
                  ? "진료 다시 열기"
                  : "오늘 진료 마침"}
          </button>
        </div>
      </header>
      <div className="hs-audio-area">
        <AudioControls visitId={visitId} onChanged={refresh} />
      </div>
      {(actionError || error) && (
        <div className="hs-inline-error hs-workspace-error" role="alert">
          {actionError || error}
        </div>
      )}
      <div className="hs-workspace-grid">
        <PatientRail
          key={visitId}
          state={state}
          patient={patient}
          visit={visit}
          act={act}
        />
        <section className="hs-chart-main" aria-label="오늘 진료 차팅">
          <section className="hs-panel hs-chart-panel">
            <div
              className="hs-chart-tabs"
              role="tablist"
              aria-label="진료 기록"
              onKeyDown={(event) => {
                const tabs = ["soap", "transcript", "followup"] as const;
                const index = tabs.indexOf(tab);
                const next =
                  event.key === "ArrowRight"
                    ? tabs[(index + 1) % tabs.length]
                    : event.key === "ArrowLeft"
                      ? tabs[(index + tabs.length - 1) % tabs.length]
                      : event.key === "Home"
                        ? tabs[0]
                        : event.key === "End"
                          ? tabs[tabs.length - 1]
                          : null;
                if (next) {
                  event.preventDefault();
                  setTab(next);
                  globalThis.document.getElementById(`tab-${next}`)?.focus();
                }
              }}
            >
              <button
                role="tab"
                id="tab-soap"
                aria-controls="panel-soap"
                aria-selected={tab === "soap"}
                tabIndex={tab === "soap" ? 0 : -1}
                className={tab === "soap" ? "is-selected" : ""}
                onClick={() => setTab("soap")}
              >
                SOAP 기록
              </button>
              <button
                role="tab"
                id="tab-transcript"
                aria-controls="panel-transcript"
                aria-selected={tab === "transcript"}
                tabIndex={tab === "transcript" ? 0 : -1}
                className={tab === "transcript" ? "is-selected" : ""}
                onClick={() => setTab("transcript")}
              >
                전사 대조
                <span>
                  {
                    state.transcripts.filter(
                      (item) => item.visit_id === visitId,
                    ).length
                  }
                </span>
              </button>
              <button
                role="tab"
                id="tab-followup"
                aria-controls="panel-followup"
                aria-selected={tab === "followup"}
                tabIndex={tab === "followup" ? 0 : -1}
                className={tab === "followup" ? "is-selected" : ""}
                onClick={() => setTab("followup")}
              >
                재진 질문
              </button>
            </div>
            <div
              id="panel-soap"
              role="tabpanel"
              aria-labelledby="tab-soap"
              hidden={tab !== "soap"}
            >
              <SoapEditor
                key={visitId}
                document={document}
                visit={visit}
                state={state}
                act={act}
              />
            </div>
            <div
              id="panel-transcript"
              role="tabpanel"
              aria-labelledby="tab-transcript"
              hidden={tab !== "transcript"}
            >
              <TranscriptEvidence state={state} visitId={visitId} />
            </div>
            <div
              id="panel-followup"
              role="tabpanel"
              aria-labelledby="tab-followup"
              hidden={tab !== "followup"}
            >
              <FollowupEditor visitId={visitId} />
            </div>
          </section>
          <TreatmentPane state={state} visit={visit} act={act} />
          <TodayFollowupPanels
            key={visitId}
            state={state}
            patient={patient}
            visit={visit}
            act={act}
          />
        </section>
        <ContextRail
          state={state}
          patient={patient}
          visit={visit}
          aiAvailable={data.capabilities.ai}
          refresh={refresh}
        />
      </div>
    </div>
  );
}
