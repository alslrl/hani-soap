"use client";

import { useState } from "react";
import type { TreatmentLocation } from "@/lib/types";
import { REGION_LABELS, SIDE_LABELS, regionCandidates, type BodyRegion, type Laterality, type RegionMatch } from "@/lib/tablet/regions";

export function RegionPicker({ match, onAdd, onClose, onMemo }: {
  match: RegionMatch;
  onAdd: (locations: TreatmentLocation[], match: RegionMatch) => void;
  onClose: () => void;
  onMemo: () => void;
}) {
  const [region, setRegion] = useState(match.region);
  const [side, setSide] = useState(match.laterality);
  const [type, setType] = useState<TreatmentLocation["location_type"]>("acupoint");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const candidates = regionCandidates(region, match.view);
  const canAdd = type === "acupoint" ? selected.length > 0 : note.trim().length > 0;
  function add() {
    if (!canAdd) return;
    const common = { body_region: region, laterality: side, annotation_id: null, finding_ref: null };
    const locations: TreatmentLocation[] = type === "acupoint" ? candidates.filter(p => selected.includes(p.code)).map(p => ({
      ...common, location_type: "acupoint", acupoint_code: p.code, label_ko: p.label_ko, location_note: note.trim(),
    })) : [{ ...common, location_type: type, acupoint_code: null, label_ko: type === "ashi" ? "아시혈" : "압통점", location_note: note.trim() }];
    onAdd(locations, { ...match, region, laterality: side });
  }
  return <section className="tablet-region-picker" role="dialog" aria-modal="false" aria-label="부위별 위치 선택">
    <div className="tablet-picker-heading">
      <div><span className="tablet-eyebrow">표시한 부위</span><h2>{SIDE_LABELS[side]} {REGION_LABELS[region]}</h2></div>
      <button type="button" className="tablet-icon-button" onClick={onClose} aria-label="후보 닫기">×</button>
    </div>
    <div className="tablet-picker-fields">
      <label>부위<select aria-label="선택 부위" value={region} onChange={e => { setRegion(e.target.value as BodyRegion); setSelected([]); }}>
        {Object.entries(REGION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>환자 기준 좌우<select aria-label="환자 기준 좌우" value={side} onChange={e => setSide(e.target.value as Laterality)}>
        {Object.entries(SIDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <div className="tablet-location-types" role="tablist" aria-label="위치 유형">
      {([['acupoint', '경혈'], ['ashi', '아시혈'], ['tenderness_point', '압통점']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={type === key} onClick={() => setType(key)}>{label}</button>)}
    </div>
    {type === "acupoint" ? <div className="tablet-candidate-list">
      {candidates.length ? candidates.map(point => <label className="tablet-point-option" key={point.code}>
        <input type="checkbox" checked={selected.includes(point.code)} onChange={e => setSelected(value => e.target.checked ? [...value, point.code] : value.filter(code => code !== point.code))} />
        <span>{point.label_ko} <small>{point.code}</small></span>
        <span className="tablet-point-area">{{ outer: "외측", inner: "내측", front: "앞쪽", back: "뒤쪽" }[point.area]}</span>
      </label>) : <p className="tablet-empty-small">이 부위의 검수된 경혈 목록이 없습니다. 아시혈·압통점으로 직접 위치를 기록할 수 있습니다.</p>}
      <p className="tablet-field-help">표시한 영역의 기록 후보입니다. 선택한 항목만 추가됩니다.</p>
    </div> : <p className="tablet-field-help">경혈 코드 없이 위치와 설명을 저장합니다.{type === "tenderness_point" ? " 압통 관찰과 실제 시술 시행은 별도로 확인합니다." : ""}</p>}
    <label className="tablet-note-field">{type === "acupoint" ? "위치 메모 (선택)" : "위치·구조물 설명"}
      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={type === "acupoint" ? "추가로 남길 내용" : "예: 우측 외측 발목 전거비인대 부위"} />
    </label>
    <button type="button" className="tablet-primary tablet-wide" onClick={add} disabled={!canAdd}>이 부위 추가{selected.length && type === "acupoint" ? ` · ${selected.length}` : ""}</button>
    <button type="button" className="tablet-text-button tablet-wide" onClick={onMemo}>체크를 메모로 되돌리기</button>
  </section>;
}
