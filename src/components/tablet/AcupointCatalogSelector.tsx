"use client";
import { ActionArrow } from '@/components/ui/ActionArrow';

import { useState } from "react";
import { ACUPOINT_CATALOG, CATALOG_VIEW_LABELS, getCatalogPoint, searchAcupoints } from "@/lib/tablet/acupoint-catalog";
import type { BodyRegion, BodyView } from "@/lib/tablet/regions";
import "./acupoint-catalog.css";

export function AcupointCatalogSelector({ region, view, selected, onSelected, initialScope = "region" }: {
  region?: BodyRegion; view: BodyView; selected: string[]; onSelected: (codes: string[]) => void; initialScope?: "region" | "all";
}) {
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState("");
  const candidates = scope === "region" && !region ? [] : searchAcupoints({ region: region || "head", view, scope, query });
  return <div className="tablet-catalog" data-testid="acupoint-catalog">
    <div className="tablet-catalog-scopes" role="group" aria-label="혈자리 검색 범위">
      <button type="button" disabled={!region} aria-pressed={scope === "region"} onClick={() => setScope("region")}>이 부위</button>
      <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>전신 검색 · {ACUPOINT_CATALOG.length}</button>
    </div>
    <label className="tablet-catalog-search">혈명·코드 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 합곡, LI4, 신수" autoComplete="off" /></label>
    <p className="tablet-catalog-count" aria-live="polite">{scope === "all" ? "전신" : "부위별"} 후보 {candidates.length}개 · 선택 {selected.length}개</p>
    {selected.length > 0 && <div className="tablet-catalog-selected" aria-label="선택한 혈자리">{selected.map(code => <button type="button" key={code} onClick={() => onSelected(selected.filter(value => value !== code))} aria-label={`${getCatalogPoint(code)?.label_ko || code} 선택 해제`}>{getCatalogPoint(code)?.label_ko} {code}<span aria-hidden="true">×</span></button>)}</div>}
    <div className="tablet-catalog-list">
      {candidates.map(point => <div className="tablet-catalog-row" key={point.code}>
        <label className="tablet-point-option"><input type="checkbox" checked={selected.includes(point.code)} onChange={event => onSelected(event.target.checked ? [...selected, point.code] : selected.filter(code => code !== point.code))} />
          <span><strong>{point.label_ko} <small>{point.code}</small></strong><span className="tablet-catalog-detail">{point.source_region_label} · {CATALOG_VIEW_LABELS[point.source_view]}{point.laterality === "midline" ? " · 정중선" : ""}</span></span>
        </label>
        <a href={point.reference_url} target="_blank" rel="noreferrer" aria-label={`${point.label_ko} ${point.code} 위치 참고`}>위치 참고 <ActionArrow direction="up-right" /></a>
      </div>)}
      {!candidates.length && <div className="tablet-empty-small">일치하는 후보가 없어요.{scope === "region" && <button type="button" className="tablet-text-button tablet-wide" onClick={() => setScope("all")}>전신에서 검색</button>}</div>}
    </div>
    <p className="tablet-field-help">위치 참고에서 실제 위치를 확인한 뒤 선택하세요. <a href="/demo/acupoints/ATTRIBUTION.html" target="_blank" rel="noreferrer">자료 출처</a></p>
  </div>;
}
