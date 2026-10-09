"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  LockKeyhole,
  FileText,
  Stethoscope,
  HeartHandshake,
} from "lucide-react";
import "./access.css";

export default function AccessForm({ local }: { local: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const pinInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) pinInput.current?.focus();
  }, [ready]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy || pin.length !== 4) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "PIN을 확인해 주세요.");
      const requested = new URLSearchParams(window.location.search).get("next");
      const safe =
        requested &&
        /^\/(clinic|tablet|settings)(\/|$)/.test(requested) &&
        !requested.includes("\\")
          ? requested
          : "/clinic";
      window.location.assign(safe);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
      setBusy(false);
    }
  }
  return (
    <main className="access-screen">
      <aside className="access-identity">
        <div className="access-brand">
          <span>
            <Activity size={24} />
          </span>
          <div>
            Hani<strong>SOAP</strong>
            <small>CLINICAL WORKSPACE</small>
          </div>
        </div>
        <div className="access-workflow">
          <span>진료 지원 시스템</span>
          <h2>진료 기록 시스템</h2>
          <div>
            <FileText size={19} />
            <span>
              <strong>진료 기록</strong>
              <small>음성과 SOAP 검토</small>
            </span>
          </div>
          <div>
            <Stethoscope size={19} />
            <span>
              <strong>시술 입력</strong>
              <small>PC·iPad 같은 방문 기록</small>
            </span>
          </div>
          <div>
            <HeartHandshake size={19} />
            <span>
              <strong>후속 관리</strong>
              <small>안내와 환자 응답 확인</small>
            </span>
          </div>
        </div>
        <p className="access-identity-foot">HaniSOAP · 가상 진료 데모</p>
      </aside>
      <section className="access-main">
        <div className="access-form">
          <div className="access-icon">
            <LockKeyhole size={25} />
          </div>
          <p className="access-eyebrow">진료실 접속</p>
          <h1>PIN을 입력해 주세요</h1>
          <p>공유받은 4자리 번호로 진료실에 접속합니다.</p>
          <form onSubmit={submit}>
            <label htmlFor="pin">접근 PIN</label>
            <input
              ref={pinInput}
              id="pin"
              name="pin"
              disabled={!ready || busy}
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              aria-describedby="pin-error"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
            />
            <p id="pin-error" role="alert" className="access-error">
              {error}
            </p>
            <button type="submit" disabled={!ready || pin.length !== 4 || busy}>
              {busy ? "확인 중…" : "진료실 입장"}
              <ArrowRight size={18} />
            </button>
          </form>
          {local && <p className="access-local">로컬 개발 PIN: 1234</p>}
          <footer>
            <span>가상 환자 데모</span>환자 프로필과 응답 이력은 합성
            데이터입니다.
          </footer>
        </div>
      </section>
    </main>
  );
}
