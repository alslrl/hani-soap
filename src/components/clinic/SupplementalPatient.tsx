"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";
import roster from "../../../data/demo/supplemental-patients.json";
import { Badge, workflowLabels } from "./shared";
import "./supplemental-patients.css";

export type SupplementalPatient = (typeof roster.patients)[number];
export const supplementalPatients = roster.patients;

function profileAge(patient: SupplementalPatient, date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [birthYear, birthMonth, birthDay] = patient.birth_date.split("-").map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
}
const demographics = (patient: SupplementalPatient, date: string) =>
  `${profileAge(patient, date)}세 · ${patient.sex === "female" ? "여" : "남"}`;

export function SupplementalPatientRow({ patient, date, onSelect }: {
  patient: SupplementalPatient;
  date: string;
  onSelect: () => void;
}) {
  return <button type="button" className="hs-patient-row hs-supplemental-row" onClick={onSelect} data-roster-patient={patient.id}>
    <div className="hs-patient-row-top">
      <Image className="hs-portrait hs-portrait-normal" src={`/demo/portraits/${patient.portrait_asset_key}.png`} alt={`${patient.display_name} 프로필`} loading="lazy" width={46} height={52} sizes="46px"/>
      <div className="hs-patient-row-identity"><strong>{patient.display_name}</strong><span>{demographics(patient, date)} <span className="hs-separator">·</span> {patient.visit_no === 1 ? "초진" : `${patient.visit_no}번째 방문`}</span></div>
      <span className="hs-visit-time">{patient.scheduled_time}</span>
    </div>
    <p className="hs-chief-complaint">{patient.chief_complaint}</p>
    <div className="hs-patient-row-bottom"><span>차트 {patient.chart_number}</span><span className="hs-patient-row-arrow" aria-hidden="true">기본 정보 보기 ↗</span></div>
  </button>;
}

export function SupplementalPatientProfile({ patient, date, onClose }: {
  patient: SupplementalPatient | null;
  date: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (patient && element && !element.open) element.showModal();
    if (!patient && element?.open) element.close();
  }, [patient]);
  return <dialog ref={dialog} className="hs-roster-dialog" aria-labelledby={titleId} onCancel={onClose} onClose={onClose}>
    {patient && <>
      <header className="hs-roster-dialog-header"><span>환자 기본 정보</span><button type="button" onClick={() => dialog.current?.close()} aria-label="환자 정보 닫기">×</button></header>
      <div className="hs-roster-profile-heading"><Image src={`/demo/portraits/${patient.portrait_asset_key}.png`} alt={`${patient.display_name} 프로필`} width={90} height={120} sizes="90px"/><div><h2 id={titleId}>{patient.display_name}</h2><p>{demographics(patient, date)} · 차트 {patient.chart_number}</p></div></div>
      <dl className="hs-roster-profile-fields"><div><dt>생년월일</dt><dd>{patient.birth_date}</dd></div><div><dt>상담 내용</dt><dd>{patient.chief_complaint}</dd></div><div><dt>방문</dt><dd>{patient.visit_no === 1 ? "초진" : `${patient.visit_no}번째 방문`} · {patient.scheduled_time}</dd></div><div><dt>상태</dt><dd>{workflowLabels[patient.workflow_status]}</dd></div></dl>
      <p className="hs-roster-profile-note">{patient.profile_note}</p>
      <footer className="hs-roster-profile-footer">이 환자는 기본 프로필만 준비되어 있어요. 진료 시연은 김서연·이도윤을 선택해 주세요.</footer>
    </>}
  </dialog>;
}
