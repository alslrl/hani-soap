"use client";
import { AppSelect } from '@/components/ui/AppSelect';


import { useState } from "react";
import type { TreatmentLocation } from "@/lib/types";
import { REGION_LABELS, SIDE_LABELS, type BodyRegion, type Laterality, type RegionMatch } from "@/lib/tablet/regions";
import { getCatalogPoint, resolvePointLaterality } from "@/lib/tablet/acupoint-catalog";
import { AcupointCatalogSelector } from "./AcupointCatalogSelector";

export function RegionPicker({ match, onAdd, onClose, onMemo, onZoom, modal = false }: {
  match: RegionMatch;
  onAdd: (locations: TreatmentLocation[], match: RegionMatch) => void;
  onClose: () => void;
  onMemo: () => void;
  onZoom?: () => void;
  modal?: boolean;
}) {
  const catalogMode = match.selectionSource === "catalog";
  const [region, setRegion] = useState<BodyRegion | "">(catalogMode ? "" : match.region);
  const [side, setSide] = useState(match.laterality);
  const [type, setType] = useState<TreatmentLocation["location_type"]>("acupoint");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const selectedPoints = selected.flatMap(code => { const point = getCatalogPoint(code); return point ? [point] : []; });
  const needsSide = selectedPoints.some(point => resolvePointLaterality(point, side) === null);
  const canAdd = type === "acupoint" ? selectedPoints.length > 0 && !needsSide : note.trim().length > 0 && Boolean(region) && side !== "not_applicable";
  function add() {
    if (!canAdd) return;
    const common = { annotation_id: null, finding_ref: null };
    const locations: TreatmentLocation[] = type === "acupoint" ? selectedPoints.map(point => ({
      ...common, body_region: region && point.regions.includes(region) ? region : point.region, laterality: resolvePointLaterality(point, side)!, location_type: "acupoint", acupoint_code: point.code, label_ko: point.label_ko, location_note: note.trim(),
    })) : [{ ...common, body_region: region as BodyRegion, laterality: side, location_type: type, acupoint_code: null, label_ko: type === "ashi" ? "아시혈" : "압통점", location_note: note.trim() }];
    onAdd(locations, { ...match, region: region || selectedPoints[0]?.region || match.region, laterality: side });
  }
  return <section className="tablet-region-picker" role="dialog" aria-modal={modal} aria-label="부위별 위치 선택">
    <div className="tablet-picker-heading">
      <div><span className="tablet-eyebrow">{catalogMode ? "혈자리 목록" : "표시한 부위"}</span><h2>{catalogMode ? "전신 혈자리 선택" : `${SIDE_LABELS[side]} ${region ? REGION_LABELS[region] : ""}`}</h2></div>
      <button type="button" className="tablet-icon-button" onClick={onClose} aria-label="후보 닫기">×</button>
    </div>
    {onZoom && !catalogMode && <button type="button" className="tablet-picker-zoom" onClick={onZoom}>이 부위 확대 보기</button>}
    <div className="tablet-picker-fields">
      <label>부위<AppSelect aria-label="선택 부위" value={region} onChange={e => setRegion(e.target.value as BodyRegion)}>
        {catalogMode && <option value="">부위를 선택하세요</option>}
        {Object.entries(REGION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </AppSelect></label>
      <label>환자 기준 좌우<AppSelect aria-label="환자 기준 좌우" value={side} onChange={e => setSide(e.target.value as Laterality)}>
        {Object.entries(SIDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </AppSelect></label>
    </div>
    <div className="tablet-location-types" role="tablist" aria-label="위치 유형">
      {([['acupoint', '경혈'], ['ashi', '아시혈'], ['tenderness_point', '압통점']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={type === key} onClick={() => setType(key)}>{label}</button>)}
    </div>
    {type === "acupoint" ? <><AcupointCatalogSelector region={region || undefined} view={match.view} selected={selected} onSelected={setSelected} initialScope={catalogMode ? "all" : "region"} />{needsSide && <p className="tablet-field-help" role="status">양측 혈자리를 선택했어요. 환자 기준 좌측·우측·양측 중 하나를 확인해 주세요. 정중선 혈자리는 정중선으로 저장됩니다.</p>}</> : <p className="tablet-field-help">경혈 코드 없이 위치와 설명을 저장합니다.{type === "tenderness_point" ? " 압통 관찰과 실제 시술 시행은 별도로 확인합니다." : ""}</p>}
    <label className="tablet-note-field">{type === "acupoint" ? "위치 메모 (선택)" : "위치·구조물 설명"}
      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={type === "acupoint" ? "추가로 남길 내용" : "예: 우측 외측 발목 전거비인대 부위"} />
    </label>
    <button type="button" className="tablet-primary tablet-wide" onClick={add} disabled={!canAdd}>이 부위 추가{selected.length && type === "acupoint" ? ` · ${selected.length}` : ""}</button>
    <button type="button" className="tablet-text-button tablet-wide" onClick={catalogMode ? onClose : onMemo}>{catalogMode ? "목록 닫기" : "체크를 메모로 되돌리기"}</button>
  </section>;
}
