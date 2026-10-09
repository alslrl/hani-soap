import type { SelectedLocationDisplay } from "@/lib/tablet/selected-locations";
import { SIDE_LABELS, type BodyView } from "@/lib/tablet/regions";
import type { CanvasViewBox } from "@/lib/tablet/viewport";
import "./selected-locations.css";

export function SelectedLocationOverlay({ entries, view, focusedIndex, viewport }: {
  entries: readonly SelectedLocationDisplay[];
  view: BodyView;
  focusedIndex: number | null;
  viewport: CanvasViewBox;
}) {
  return <g className="tablet-selected-overlay" pointerEvents="none" aria-hidden="true" data-testid="selected-location-overlay">
    {entries.flatMap(entry => entry.dots[view].map(dot => {
      const focused = entry.index === focusedIndex;
      const rightLabel = dot.x <= 500;
      const labelX = Math.max(viewport.x + 8, Math.min(viewport.x + viewport.width - 8, dot.x + (rightLabel ? 15 : -15)));
      const labelY = Math.max(viewport.y + 15, Math.min(viewport.y + viewport.height - 10, dot.y - 15));
      return <g key={`${entry.index}:${dot.side}`} data-selected-code={entry.location.acupoint_code || ""} data-selected-side={dot.side} data-selected-number={entry.number} className={focused ? "is-focused" : undefined}>
        <circle className="tablet-selected-halo" cx={dot.x} cy={dot.y} r={focused ? 13 : 11}/>
        <circle className="tablet-selected-dot" cx={dot.x} cy={dot.y} r="7"/>
        <text className="tablet-selected-number" x={dot.x} y={dot.y} dy=".35em" textAnchor="middle">{entry.number}</text>
        {focused && <text className="tablet-selected-label" x={labelX} y={labelY} textAnchor={rightLabel ? "start" : "end"}>{entry.location.label_ko} {entry.location.acupoint_code} · {SIDE_LABELS[dot.side as keyof typeof SIDE_LABELS]}</text>}
      </g>;
    }))}
  </g>;
}

export function SelectedLocationLegend({ entries, view, focusedIndex, procedure, disabled, onFocus }: {
  entries: readonly SelectedLocationDisplay[];
  view: BodyView;
  focusedIndex: number | null;
  procedure: string;
  disabled: boolean;
  onFocus: (entry: SelectedLocationDisplay) => void;
}) {
  if (!entries.length) return null;
  return <section className="tablet-selection-legend" aria-label={`${procedure} 선택 위치`} data-testid="selected-location-legend">
    <div className="tablet-selection-legend-heading"><strong>{procedure} · 선택 {entries.length}개</strong><span>번호로 확인 · 대략 위치</span></div>
    <div className="tablet-selection-chips">
      {entries.map(entry => <button type="button" key={entry.index} data-location-number={entry.number} aria-pressed={entry.index === focusedIndex} disabled={disabled} onClick={() => onFocus(entry)}>
        <span className="tablet-selection-chip-number">{entry.number}</span>
        <span><strong>{entry.location.label_ko || "선택 위치"} <small>{entry.location.acupoint_code}</small></strong><span>{SIDE_LABELS[entry.location.laterality]} · {entry.unavailable || (entry.dots[view].length ? "현재 화면" : `${entry.views[0] === "front" ? "앞면" : "뒷면"}에서 보기`)}</span></span>
      </button>)}
    </div>
  </section>;
}
