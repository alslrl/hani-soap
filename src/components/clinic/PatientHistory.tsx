"use client";

import Link from "next/link";
import { displayRecordText } from "@/lib/presentation";
import { useState } from "react";
import { useAppState } from "@/lib/client";
import {
  Badge,
  demographics,
  Empty,
  fullDate,
  LoadState,
  NrsSparkline,
  panelTitle,
  Portrait,
  shortDate,
  WorkflowBadge,
} from "./shared";
import "./clinic.css";

export default function PatientHistory({ patientId }: { patientId: string }) {
  const { data, loading, error, refresh } = useAppState();
  const [selectedId, setSelectedId] = useState("");
  if (!data)
    return <LoadState loading={loading} error={error} retry={refresh} />;
  const state = data.state;
  const patient = state.patients.find((item) => item.id === patientId);
  if (!patient)
    return (
      <div className="clinic-surface hs-load">
        <Empty title="환자를 찾을 수 없어요" />
        <Link className="hs-button" href="/clinic">
          오늘 환자로 돌아가기
        </Link>
      </div>
    );
  const visits = state.visits
    .filter((visit) => visit.patient_id === patientId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const selected = visits.find((visit) => visit.id === selectedId) || visits[0];
  const document = state.soap_documents
    .filter(
      (item) => item.visit_id === selected?.id && item.status === "approved",
    )
    .sort((a, b) => b.revision - a.revision)[0];
  const current = visits[0];
  const primaryNrs = state.observations.find(
    (item) =>
      item.patient_id === patientId &&
      item.instrument === "NRS" &&
      item.metric_key === "pain_intensity",
  );
  const nrsMeasurements = state.observations
    .filter(
      (item) =>
        item.patient_id === patientId &&
        item.instrument === "NRS" &&
        item.series_key === primaryNrs?.series_key,
    )
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const nrs = [
    ...new Map(nrsMeasurements.map((item) => [item.visit_id, item])).values(),
  ];
  const messages = state.care_messages
    .filter((item) => item.patient_id === patientId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const responses = state.care_responses.filter(
    (item) => item.patient_id === patientId,
  );
  const responseLabels: Record<string, string> = {
    taking_well: "잘 복용하고 있어요",
    discomfort: "불편한 점이 있어요",
    improving: "나아지고 있어요",
    unsure: "잘 모르겠어요",
    will_book: "예약할게요",
    will_wait: "조금 더 지켜볼게요",
  };
  return (
    <div className="clinic-surface hs-patient-history-page">
      <header className="hs-page-header">
        <div>
          <div className="hs-overline">
            <Link href="/clinic">오늘 환자</Link> <span> / </span> 환자 이력
          </div>
          <h1>
            {patient.display_name}
            <span className="hs-page-name-detail">
              {demographics(patient, `${state.meta.demo_today}T00:00:00+09:00`)}
            </span>
          </h1>
        </div>
        <div className="hs-header-actions">
          <Link
            className="hs-button"
            href={`/clinic/patients/${patientId}/progress`}
          >
            경과 보기 ↗
          </Link>
          {current && (
            <Link
              className="hs-button hs-button-primary"
              href={`/clinic/visits/${current.id}`}
            >
              오늘 진료 열기
            </Link>
          )}
        </div>
      </header>
      <div className="hs-history-page-grid">
        <aside className="hs-history-patient">
          <section className="hs-panel hs-identity-panel">
            <div className="hs-identity">
              <Portrait patient={patient} size="large" />
              <div>
                <strong>{patient.display_name}</strong>
                <span>차트 {patient.demo_key}</span>
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
                  <dd>{patient.guardian.display_name}</dd>
                </div>
              )}
              <div>
                <dt>총 방문</dt>
                <dd>{visits.length}회</dd>
              </div>
            </dl>
          </section>
          <section className="hs-panel">
            {panelTitle("진료 이력")}
            <div className="hs-visit-timeline">
              {visits.map((visit) => (
                <button
                  key={visit.id}
                  className={selected?.id === visit.id ? "is-selected" : ""}
                  onClick={() => setSelectedId(visit.id)}
                >
                  <span className="hs-timeline-dot" />
                  <div>
                    <strong>{fullDate(visit.scheduled_at)}</strong>
                    <p>
                      {visit.visit_no === 1
                        ? "초진"
                        : `${visit.visit_no}번째 방문`}{" "}
                      · {visit.reason}
                    </p>
                    <WorkflowBadge status={visit.workflow_status} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>
        <section
          className="hs-history-document hs-panel"
          aria-label="선택한 진료 기록"
        >
          <div className="hs-history-document-head">
            <div>
              <span className="hs-overline">
                {selected ? fullDate(selected.scheduled_at) : "진료 기록"}
              </span>
              <h2>{selected?.reason || "방문 이력"}</h2>
            </div>
            {document ? (
              <Badge tone="green">의료진 승인본</Badge>
            ) : (
              <Badge>기록 전</Badge>
            )}
          </div>
          {document ? (
            <>
              <div className="hs-history-document-sections">
                {(
                  [
                    { key: "s", label: "증상·경과" },
                    { key: "o", label: "관찰·검사" },
                    { key: "a", label: "평가" },
                    { key: "p", label: "치료·계획" },
                  ] as const
                ).map((section) => (
                  <section key={section.key}>
                    <div>
                      <span>{section.key.toUpperCase()}</span>
                      <h3>{section.label}</h3>
                    </div>
                    <p>{document.sections[section.key] || "기록 없음"}</p>
                  </section>
                ))}
              </div>
              {!!document.source_refs.length && (
                <details className="hs-history-source">
                  <summary>기록 근거 {document.source_refs.length}개</summary>
                  {document.source_refs.map((source, index) => (
                    <blockquote key={index}>
                      <p>{source.quote || "인용 없음"}</p>
                      <cite>{source.source_id}</cite>
                    </blockquote>
                  ))}
                </details>
              )}
              <div className="hs-history-record-footer">
                <span>
                  버전 {document.revision} ·{" "}
                  {document.origin === "synthetic_history"
                    ? "이전 진료 기록"
                    : "진료 기록"}
                </span>
                <Link
                  href={`/clinic/visits/${selected.id}`}
                  className="hs-text-link"
                >
                  진료 화면 열기 ↗
                </Link>
              </div>
            </>
          ) : (
            <div className="hs-history-no-document">
              <Empty title="아직 승인된 진료 기록이 없어요">
                진료실에서 기록을 작성하고 검토 후 승인하세요.
              </Empty>
              {selected && (
                <Link
                  className="hs-button hs-button-primary"
                  href={`/clinic/visits/${selected.id}`}
                >
                  진료 화면 열기
                </Link>
              )}
            </div>
          )}
        </section>
        <aside className="hs-history-context">
          {nrs.length > 0 && (
            <section className="hs-panel hs-nrs-panel">
              {panelTitle(
                "통증 NRS 경과",
                <Link
                  href={`/clinic/patients/${patientId}/progress`}
                  className="hs-text-link"
                >
                  크게 보기 ↗
                </Link>,
              )}
              <div className="hs-history-last-score">
                <strong>
                  {nrs.at(-1)?.value}
                  <small>/ 10</small>
                </strong>
                <span>{shortDate(nrs.at(-1)!.measured_at)} 최근 확인</span>
              </div>
              <NrsSparkline
                points={nrs.map((item) => ({
                  value: item.value,
                  label: shortDate(item.measured_at),
                }))}
              />
            </section>
          )}
          <section className="hs-panel hs-history-care">
            {panelTitle(
              "안내·응답 이력",
              <Link href="/clinic/care" className="hs-text-link">
                후속 관리 ↗
              </Link>,
            )}
            {messages.length ? (
              messages.map((message) => {
                const response = responses.find(
                  (item) => item.message_id === message.id,
                );
                return (
                  <article key={message.id}>
                    <div>
                      <span>{shortDate(message.scheduled_at)}</span>
                      <Badge>
                        {message.status === "sent" ? "발송 이력" : "안내 초안"}
                      </Badge>
                    </div>
                    <p>{displayRecordText(message.approved_body || message.draft_body)}</p>
                    {response && (
                      <div className="hs-history-care-response">
                        <span>↳</span>
                        <strong>
                          {responseLabels[response.option] || response.option}
                        </strong>
                        {response.detail === "stomach_discomfort" && (
                          <p>속이 불편해요</p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <Empty title="안내와 응답 이력이 없어요" />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
