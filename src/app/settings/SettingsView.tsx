"use client";
import Link from "next/link";
import {
  Database,
  Mic,
  Tablet,
  ArrowUpRight,
  Monitor,
  Info,
} from "lucide-react";
import { useAppState } from "@/lib/client";
import "./settings.css";
export default function SettingsView() {
  const { data, loading } = useAppState();
  if (loading || !data)
    return <div className="state-loader">연결 상태를 확인하고 있습니다.</div>;
  return (
    <div className="emr-settings">
      <header>
        <span>환경 설정</span>
        <h1>기기 및 연결</h1>
        <p>기기별 진료 화면과 저장·음성 처리 상태를 확인합니다.</p>
      </header>
      <div className="emr-settings-grid">
        <section className="emr-setting-section">
          <h2>
            <Monitor size={18} />
            연결 상태
          </h2>
          <div className="emr-setting-row">
            <Database size={18} />
            <div>
              <strong>진료 데이터 저장</strong>
              <p>
                {data.storage === "supabase"
                  ? "연결된 서버에 진료 기록을 저장합니다."
                  : "로컬 미리보기 환경에 진료 기록을 저장합니다."}
              </p>
            </div>
            <span className="emr-config-status">
              {data.storage === "supabase" ? "서버 연결" : "로컬 저장"}
            </span>
          </div>
          <div className="emr-setting-row">
            <Mic size={18} />
            <div>
              <strong>음성·AI 처리</strong>
              <p>
                {data.capabilities.ai
                  ? "음성 처리 결과와 작업 상태는 각 진료 화면에서 확인할 수 있습니다."
                  : "실제 전사와 기록 생성을 사용하려면 연결 설정이 필요합니다."}
              </p>
            </div>
            <span
              className={`emr-config-status ${!data.capabilities.ai ? "is-pending" : ""}`}
            >
              {data.capabilities.ai ? "설정 완료" : "설정 필요"}
            </span>
          </div>
          <div className="emr-setting-foot">
            저장 버전 <strong>{data.version}</strong>
            <span>진료실 공통 환경</span>
          </div>
        </section>
        <section className="emr-setting-section">
          <h2>
            <Tablet size={18} />
            iPad 시술 기록
          </h2>
          <p className="emr-setting-intro">
            같은 방문을 선택하면 시술과 필기를 PC에서 함께 확인할 수 있습니다.
          </p>
          {data.state.scenario_inputs.map((s) => {
            const p = data.state.patients.find((p) => p.id === s.patient_id);
            return (
              <Link
                key={s.patient_id}
                className="emr-device-visit"
                href={`/tablet/visits/${s.current_visit_id}`}
              >
                <img
                  alt=""
                  src={`/demo/portraits/${p?.portrait_asset_key}.png`}
                  width={34}
                  height={42}
                />
                <div>
                  <strong>{p?.display_name}</strong>
                  <span>{p?.chief_complaint}</span>
                </div>
                <ArrowUpRight size={17} />
              </Link>
            );
          })}
          <div className="emr-setting-foot">
            iPad에서도 동일한 PIN으로 접속합니다.
          </div>
        </section>
      </div>
      <section className="emr-setting-scope">
        <Info size={18} />
        <div>
          <strong>데모 사용 범위</strong>
          <p>
            김서연·이도윤 사례에서 기록 검토와 시술 입력을 시연할 수 있습니다.
            환자 안내 발송과 응답은 모의 처리이며, 승인된 기록을 EMR용 텍스트로
            복사할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
