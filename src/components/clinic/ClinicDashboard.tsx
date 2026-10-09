"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BellRing,
  ClipboardCheck,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
import { useAppState } from "@/lib/client";
import {
  SupplementalPatientProfile,
  supplementalPatients,
  type SupplementalPatient,
} from "./SupplementalPatient";
import {
  dayKey,
  demographics,
  fullDate,
  LoadState,
  visitTime,
  workflowLabels,
} from "./shared";
import "./clinic.css";

type Filter = "all" | "waiting" | "in_progress" | "completed";
export default function ClinicDashboard() {
  const { data, loading, error, refresh } = useAppState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedProfile, setSelectedProfile] =
    useState<SupplementalPatient | null>(null);
  const rows = useMemo(() => {
    if (!data) return [];
    const { state } = data;
    const current = state.visits
      .filter((visit) => dayKey(visit.scheduled_at) === state.meta.demo_today)
      .map((visit) => {
        const patient = state.patients.find(
          (item) => item.id === visit.patient_id,
        )!;
        return {
          id: visit.id,
          name: patient.display_name,
          portrait: patient.portrait_asset_key,
          detail: demographics(patient, visit.scheduled_at),
          chart: patient.demo_key,
          time: visitTime(visit.scheduled_at),
          status: visit.workflow_status,
          visitNo: visit.visit_no,
          reason: patient.chief_complaint,
          visitId: visit.id,
          profile: null as SupplementalPatient | null,
          contact: state.contact_tasks.some(
            (task) => task.patient_id === patient.id && task.status === "open",
          ),
        };
      });
    const profiles = supplementalPatients.map((profile) => {
      const [year, month, day] = state.meta.demo_today.split("-").map(Number);
      const [by, bm, bd] = profile.birth_date.split("-").map(Number);
      const age =
        year - by - (month < bm || (month === bm && day < bd) ? 1 : 0);
      return {
        id: profile.id,
        name: profile.display_name,
        portrait: profile.portrait_asset_key,
        detail: `${age}세 · ${profile.sex === "female" ? "여" : "남"}`,
        chart: profile.chart_number,
        time: profile.scheduled_time,
        status: profile.workflow_status,
        visitNo: profile.visit_no,
        reason: profile.chief_complaint,
        visitId: null,
        profile,
        contact: false,
      };
    });
    return [...current, ...profiles].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
  }, [data]);
  if (!data)
    return <LoadState loading={loading} error={error} retry={refresh} />;
  const { state } = data;
  const visible = rows.filter(
    (row) =>
      (filter === "all" || row.status === filter) &&
      `${row.name} ${row.reason} ${row.chart}`.includes(query.trim()),
  );
  const contacts = state.contact_tasks.filter((task) => task.status === "open");
  const pending = state.followup_items.filter(
    (item) => item.status === "pending",
  );
  const count = (key: Filter) =>
    key === "all"
      ? rows.length
      : rows.filter((row) => row.status === key).length;
  return (
    <div className="clinic-surface hs-dashboard emr-dashboard">
      <header className="hs-page-header">
        <div>
          <div className="hs-overline">
            {fullDate(`${state.meta.demo_today}T00:00:00+09:00`)}
          </div>
          <h1>
            오늘 환자 <span className="hs-title-count">{rows.length}</span>
          </h1>
        </div>
        <div className="hs-header-actions">
          <span className="emr-day-label">
            <i />
            진료 현황
          </span>
          <button
            className="hs-button"
            onClick={() => refresh()}
            aria-label="환자 목록 새로고침"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </header>
      <div className="emr-dashboard-layout">
        <section className="emr-register" aria-label="오늘 환자 목록">
          <div className="emr-register-toolbar">
            <div
              className="emr-status-tabs"
              role="group"
              aria-label="진료 상태 필터"
            >
              {(["all", "waiting", "in_progress", "completed"] as Filter[]).map(
                (key) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                  >
                    {key === "all" ? "전체" : workflowLabels[key]}
                    <b>{count(key)}</b>
                  </button>
                ),
              )}
            </div>
            <label className="emr-register-search">
              <Search size={16} />
              <input
                aria-label="환자 이름 또는 증상 검색"
                placeholder="이름 · 차트번호 · 주소증"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {error && (
            <p className="hs-inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="emr-table-scroll">
            <table className="emr-patient-table">
              <thead>
                <tr>
                  <th scope="col">순서</th>
                  <th scope="col">상태</th>
                  <th scope="col">시간</th>
                  <th scope="col">환자</th>
                  <th scope="col">차트번호</th>
                  <th scope="col">내원</th>
                  <th scope="col">주소증</th>
                  <th scope="col">확인 사항</th>
                  <th scope="col">
                    <span className="hs-sr-only">열기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={row.id}
                    className={row.visitId ? "emr-case-row" : ""}
                  >
                    <td className="emr-row-number">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td>
                      <span className={`emr-state emr-state-${row.status}`}>
                        <i />
                        {workflowLabels[row.status]}
                      </span>
                    </td>
                    <td className="emr-time">{row.time}</td>
                    <td>
                      <div className="emr-person">
                        <img
                          src={`/demo/portraits/${row.portrait}.png`}
                          alt=""
                          width="36"
                          height="44"
                        />
                        <div>
                          {row.visitId ? (
                            <Link
                              href={`/clinic/visits/${row.visitId}`}
                              className="emr-patient-name"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <button
                              className="emr-patient-name"
                              onClick={() => setSelectedProfile(row.profile)}
                            >
                              {row.name}
                            </button>
                          )}
                          <span>{row.detail}</span>
                        </div>
                      </div>
                    </td>
                    <td className="emr-chart-number">{row.chart}</td>
                    <td>
                      <span className="emr-visit-type">
                        {row.visitNo === 1 ? "초진" : "재진"}
                      </span>
                      <small className="emr-visit-number">
                        {row.visitNo}회
                      </small>
                    </td>
                    <td className="emr-complaint">{row.reason}</td>
                    <td>
                      {row.contact ? (
                        <span className="emr-attention">연락 필요</span>
                      ) : row.visitId ? (
                        <span className="emr-case-label">진료 시연</span>
                      ) : (
                        <span className="emr-profile-label">프로필 데모</span>
                      )}
                    </td>
                    <td>
                      {row.visitId ? (
                        <Link
                          href={`/clinic/visits/${row.visitId}`}
                          className="emr-open-record"
                          aria-label="진료 기록 열기"
                        >
                          차트 <ArrowUpRight size={14} />
                        </Link>
                      ) : (
                        <button
                          onClick={() => setSelectedProfile(row.profile)}
                          className="emr-open-record"
                        >
                          정보 <ArrowUpRight size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={9} className="emr-empty-table">
                      <UsersRound size={24} />
                      <strong>해당하는 환자가 없습니다.</strong>
                      <span>검색어나 진료 상태를 변경해 주세요.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="emr-table-footer">
            <span>
              전체 {rows.length}명 중 {visible.length}명 표시
            </span>
            <span>
              실제 진료 기능은 김서연·이도윤 사례에서 확인할 수 있습니다.
            </span>
          </footer>
        </section>
        <aside className="emr-worklist" aria-label="오늘 확인할 업무">
          <section>
            <header>
              <BellRing size={17} />
              <h2>연락 확인</h2>
              <b>{contacts.length}</b>
            </header>
            {contacts.length ? (
              contacts.map((task) => (
                <Link
                  className="emr-contact-item"
                  href="/clinic/care"
                  key={task.id}
                >
                  <div>
                    <strong>
                      {
                        state.patients.find(
                          (patient) => patient.id === task.patient_id,
                        )?.display_name
                      }
                    </strong>
                    <span>확인 필요</span>
                  </div>
                  <p>복용·치료 후 불편 응답</p>
                  <small>응답과 안내 내역을 대조해 주세요.</small>
                  <em>
                    후속 관리 열기 <ArrowUpRight size={13} />
                  </em>
                </Link>
              ))
            ) : (
              <p className="emr-worklist-empty">남은 연락 업무가 없습니다.</p>
            )}
          </section>
          <section>
            <header>
              <ClipboardCheck size={17} />
              <h2>재진 확인 항목</h2>
              <b>{pending.length}</b>
            </header>
            {state.scenario_inputs.map((scenario) => {
              const patient = state.patients.find(
                (patient) => patient.id === scenario.patient_id,
              )!;
              const items = pending.filter(
                (item) => item.patient_id === patient.id,
              );
              return (
                <Link
                  className="emr-review-item"
                  key={patient.id}
                  href={`/clinic/visits/${scenario.current_visit_id}`}
                >
                  <div>
                    <strong>{patient.display_name}</strong>
                    <span>{items.length}개</span>
                  </div>
                  <p>
                    {items
                      .slice(0, 2)
                      .map((item) => item.title)
                      .join(" · ")}
                  </p>
                </Link>
              );
            })}
          </section>
          <div className="emr-demo-note">
            <strong>가상 진료 데모</strong>
            <p>합성 환자 프로필과 방문 이력으로 구성된 시연 환경입니다.</p>
          </div>
        </aside>
      </div>
      <SupplementalPatientProfile
        patient={selectedProfile}
        date={state.meta.demo_today}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}
