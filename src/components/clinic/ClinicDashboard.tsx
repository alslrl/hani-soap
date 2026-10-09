"use client";
import { ActionArrow } from '@/components/ui/ActionArrow';


import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppState } from "@/lib/client";
import { SupplementalPatientProfile, SupplementalPatientRow, supplementalPatients, type SupplementalPatient } from "./SupplementalPatient";
import {
  Badge,
  dayKey,
  demographics,
  Empty,
  fullDate,
  LoadState,
  Portrait,
  visitTime,
  WorkflowBadge,
  workflowLabels,
} from "./shared";
import "./clinic.css";

export default function ClinicDashboard() {
  const { data, loading, error, refresh } = useAppState();
  const [query, setQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<SupplementalPatient | null>(null);
  const visibleVisits = useMemo(() => {
    if (!data) return [];
    return data.state.visits
      .filter(
        (visit) => dayKey(visit.scheduled_at) === data.state.meta.demo_today,
      )
      .filter((visit) => {
        const patient = data.state.patients.find(
          (item) => item.id === visit.patient_id,
        );
        return (
          patient &&
          `${patient.display_name} ${patient.chief_complaint}`.includes(
            query.trim(),
          )
        );
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [data, query]);
  if (!data)
    return <LoadState loading={loading} error={error} retry={refresh} />;
  const state = data.state;
  const visibleProfiles = supplementalPatients.filter(patient => `${patient.display_name} ${patient.chief_complaint}`.includes(query.trim()));
  const tasks = state.contact_tasks.filter((task) => task.status === "open");
  return (
    <div className="clinic-surface hs-dashboard">
      <header className="hs-page-header">
        <div>
          <div className="hs-overline">
            진료실 <span> / </span>{" "}
            {fullDate(`${state.meta.demo_today}T00:00:00+09:00`)}
          </div>
          <h1>
            오늘 환자{" "}
            <span className="hs-title-count">
              {
                state.visits.filter(
                  (visit) =>
                    dayKey(visit.scheduled_at) === state.meta.demo_today,
                ).length + supplementalPatients.length
              }
            </span>
          </h1>
        </div>
        <div className="hs-header-actions">
          <Link className="hs-button" href="/clinic/care">
            연락 필요 <span className="hs-button-count">{tasks.length}</span>
          </Link>
          <button
            className="hs-icon-button"
            onClick={() => refresh()}
            aria-label="환자 목록 새로고침"
          >
            ↻
          </button>
        </div>
      </header>
      <div className="hs-dashboard-toolbar">
        <label className="hs-search">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
          <input
            type="search"
            placeholder="환자 이름 또는 증상 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="hs-muted">
          환자를 선택하면 진료 기록을 확인할 수 있어요.
        </span>
        <Badge tone="blue">가상 환자 데모</Badge>
      </div>
      {error && (
        <p className="hs-inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="hs-board">
        {(["waiting", "in_progress", "completed"] as const).map((status) => {
          const visits = visibleVisits.filter(
            (visit) => visit.workflow_status === status,
          );
          const profiles = visibleProfiles.filter(patient => patient.workflow_status === status);
          const rows = [
            ...visits.map(visit => ({ key: visit.id, time: visitTime(visit.scheduled_at), visit, profile: null })),
            ...profiles.map(profile => ({ key: profile.id, time: profile.scheduled_time, visit: null, profile })),
          ].sort((a, b) => a.time.localeCompare(b.time));
          return (
            <section
              className={`hs-board-column hs-board-${status}`}
              key={status}
            >
              <div className="hs-board-heading">
                <h2>
                  <span className="hs-state-dot" />
                  {workflowLabels[status]}
                </h2>
                <span>{rows.length}</span>
              </div>
              <div className="hs-board-list">
                {rows.length ? (
                  rows.map(({ visit, profile, key }) => {
                    if (profile) return <SupplementalPatientRow key={key} patient={profile} date={state.meta.demo_today} onSelect={() => setSelectedProfile(profile)}/>;
                    if (!visit) return null;
                    const patient = state.patients.find(
                      (item) => item.id === visit.patient_id,
                    )!;
                    const contact = tasks.some(
                      (task) => task.patient_id === patient.id,
                    );
                    return (
                      <Link
                        className="hs-patient-row"
                        key={visit.id}
                        href={`/clinic/visits/${visit.id}`}
                      >
                        <div className="hs-patient-row-top">
                          <Portrait patient={patient} />
                          <div className="hs-patient-row-identity">
                            <strong>{patient.display_name}</strong>
                            <span>
                              {demographics(patient, visit.scheduled_at)}{" "}
                              <span className="hs-separator">·</span>{" "}
                              {visit.visit_no === 1
                                ? "초진"
                                : `${visit.visit_no}번째 방문`}
                            </span>
                          </div>
                          <span className="hs-visit-time">
                            {visitTime(visit.scheduled_at)}
                          </span>
                        </div>
                        <p className="hs-chief-complaint">
                          {patient.chief_complaint}
                        </p>
                        <div className="hs-patient-row-bottom">
                          <span>차트 {patient.demo_key}</span>
                          {contact ? (
                            <Badge tone="amber">연락 필요</Badge>
                          ) : (
                            <span
                              className="hs-patient-row-arrow"
                              aria-hidden="true"
                            >
                              진료실 열기 <ActionArrow direction="up-right" />
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <Empty
                    title={
                      query
                        ? "검색 결과가 없어요"
                        : status === "waiting"
                          ? "대기 중인 환자가 없어요"
                          : status === "in_progress"
                            ? "진료를 시작하면 여기에 표시돼요"
                            : "마친 진료가 여기에 표시돼요"
                    }
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
      <SupplementalPatientProfile patient={selectedProfile} date={state.meta.demo_today} onClose={() => setSelectedProfile(null)}/>
      <section className="hs-work-note">
        <div className="hs-work-note-label">오늘 확인할 업무</div>
        {tasks.length ? (
          tasks.map((task) => (
            <Link key={task.id} href="/clinic/care" className="hs-task-row">
              <span className="hs-task-marker">!</span>
              <div>
                <strong>
                  {
                    state.patients.find(
                      (patient) => patient.id === task.patient_id,
                    )?.display_name
                  }{" "}
                  · 불편 응답 확인
                </strong>
                <p>{task.reason}</p>
              </div>
              <span aria-hidden="true"><ActionArrow /></span>
            </Link>
          ))
        ) : (
          <p className="hs-muted">현재 열린 연락 업무가 없어요.</p>
        )}
      </section>
      <footer className="hs-page-footnote">
        합성 프로필·방문 이력으로 구성한 데모입니다. 실제 진료와 발송 기록은
        포함하지 않습니다.
      </footer>
    </div>
  );
}
