"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  HeartHandshake,
  Settings2,
  LogOut,
  Stethoscope,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Tablet,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/client";
import { ActiveRecordingBanner } from "@/components/audio/AudioControls";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { error, data } = useAppState();
  const [compact, setCompact] = useState(false);
  const activeVisit = path.startsWith("/clinic/visits/")
    ? path.split("/")[3]
    : data?.state.visits.find((v) => v.workflow_status === "in_progress")?.id ||
      data?.state.scenario_inputs[0]?.current_visit_id;
  const section =
    path === "/settings"
      ? "기기 및 연결"
      : path === "/clinic/care"
        ? "후속 관리"
        : path.includes("/progress")
          ? "환자 경과"
          : path.includes("/patients/")
            ? "환자 이력"
            : path.includes("/visits/")
              ? "진료실"
              : "환자 현황";
  const contactCount =
    data?.state.contact_tasks.filter((task) => task.status === "open").length ||
    0;
  async function logout() {
    await fetch("/api/access/logout", { method: "POST" });
    window.location.assign("/access");
  }
  return (
    <div className={`app-frame ${compact ? "app-frame-compact" : ""}`}>
      <aside className="app-rail">
        <Link
          href="/clinic"
          className="app-brand"
          aria-label="HaniSOAP 오늘 환자"
        >
          <span className="app-logo">
            <Activity size={23} strokeWidth={2.3} />
          </span>
          <span className="app-brand-name">
            Hani<span>SOAP</span>
            <small>CLINICAL WORKSPACE</small>
          </span>
        </Link>
        <div className="rail-group-label">진료 업무</div>
        <nav aria-label="주 메뉴">
          <Link
            className={`rail-link ${path === "/clinic" ? "active" : ""}`}
            href="/clinic"
            title="오늘 환자"
          >
            <CalendarDays size={19} />
            <span>오늘 환자</span>
          </Link>
          {activeVisit && (
            <Link
              className={`rail-link ${path.includes("/visits/") || path.includes("/patients/") ? "active" : ""}`}
              href={`/clinic/visits/${activeVisit}`}
              title="진료실"
            >
              <Stethoscope size={19} />
              <span>진료실</span>
            </Link>
          )}
          <Link
            className={`rail-link ${path === "/clinic/care" ? "active" : ""}`}
            href="/clinic/care"
            title="후속 관리"
          >
            <HeartHandshake size={19} />
            <span>후속 관리</span>
            {contactCount > 0 && <b className="rail-count">{contactCount}</b>}
          </Link>
          {activeVisit && (
            <Link
              className="rail-link"
              href={`/tablet/visits/${activeVisit}`}
              title="iPad 시술 기록"
            >
              <Tablet size={19} />
              <span>iPad 시술 기록</span>
            </Link>
          )}
        </nav>
        <div className="rail-bottom">
          <div className="rail-clinic">
            <span className="rail-clinic-mark">H</span>
            <div>
              <strong>HaniSOAP 한의원</strong>
              <small>가상 진료 환경</small>
            </div>
          </div>
          <Link
            className={`rail-link ${path === "/settings" ? "active" : ""}`}
            href="/settings"
            title="설정"
          >
            <Settings2 size={18} />
            <span>기기 및 연결</span>
          </Link>
          <button
            className="rail-link rail-lock"
            onClick={logout}
            aria-label="잠금"
            title="화면 잠금"
          >
            <LogOut size={18} />
            <span>화면 잠금</span>
          </button>
          <button
            className="rail-collapse"
            onClick={() => setCompact((value) => !value)}
            aria-label={compact ? "메뉴 펼치기" : "메뉴 접기"}
          >
            {compact ? (
              <PanelLeftOpen size={18} />
            ) : (
              <>
                <PanelLeftClose size={18} />
                <span>메뉴 접기</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <div className="app-breadcrumb">
            <span>진료 지원</span>
            <ChevronRight size={14} />
            <strong>{section}</strong>
          </div>
          <div className="app-topbar-status">
            <span className={`connection-state ${error ? "is-error" : ""}`}>
              <i />
              {error ? "연결 확인 필요" : data ? "진료실 연결됨" : "연결 중"}
            </span>
            <span className="app-demo-label">DEMO</span>
          </div>
        </header>
        <main className="app-main">
          <ActiveRecordingBanner />
          {children}
        </main>
      </div>
      {error && (
        <div role="status" className="connection-toast">
          {error}
        </div>
      )}
    </div>
  );
}
