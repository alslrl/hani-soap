"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Hand, PenLine, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useAppState } from "@/lib/client";
import type { AnnotationStroke, AppState, StateEnvelope, Treatment, TreatmentLocation } from "@/lib/types";
import { BodyDiagram } from "./BodyDiagram";
import { RegionPicker } from "./RegionPicker";
import { inkPath, recognizeCheck, type InkPoint } from "@/lib/tablet/geometry";
import { mapBodyRegion, REGION_LABELS, SIDE_LABELS, type BodyRegion, type BodyView, type RegionMatch } from "@/lib/tablet/regions";
import { memoImage } from "@/lib/tablet/ink-image";
import { normalizeStrokes, restoreCanvasStrokes } from "@/lib/tablet/coordinates";
import { bodyMapVersionForVisit, type BodyMapVersion } from "@/lib/tablet/body-map-version";

const TABS = [
  { id: "needle", label: "침", detail: "일반 침", modality: "acupuncture", technique: "standard_acupuncture" },
  { id: "knife", label: "도침", detail: "도침", modality: "acupuncture", technique: "needle_knife" },
  { id: "pharma", label: "약침", detail: "약침", modality: "pharmacopuncture", technique: null },
  { id: "moxa", label: "뜸", detail: "뜸", modality: "moxibustion", technique: null },
  { id: "cupping", label: "부항", detail: "부항", modality: "cupping", technique: null },
] as const;
type TabId = typeof TABS[number]["id"];
type Layer = { id: string; coordinateVersion: BodyMapVersion; revision: number; strokes: AnnotationStroke[]; dirty: boolean };
type Draft = { id: string; locations: TreatmentLocation[]; notes: string; confirmed: boolean; dirty: boolean };
type Layers = Record<string, Layer>;
type Drafts = Record<TabId, Draft>;
const layerKey = (tab: TabId, view: BodyView) => `${tab}:${view}`;
const uid = () => crypto.randomUUID();
const matchesTab = (row: Pick<Treatment, "modality" | "technique">, tab: typeof TABS[number]) => row.modality === tab.modality && row.technique === tab.technique;
function initialDrafts(state: AppState, visitId: string): Drafts {
  return Object.fromEntries(TABS.map(tab => {
    const row = state.treatments.find(t => t.visit_id === visitId && matchesTab(t, tab) && t.source === "manual");
    const locations = row?.locations || row?.acupoints.map(p => ({ location_type: "acupoint" as const, acupoint_code: p.code, label_ko: p.label_ko, body_region: row.body_region, laterality: row.laterality, location_note: "", annotation_id: null, finding_ref: null })) || [];
    return [tab.id, { id: row?.id || uid(), locations, notes: row?.notes || "", confirmed: row?.status === "confirmed", dirty: false }];
  })) as Drafts;
}
function initialLayers(state: AppState, visitId: string): Layers {
  const visitVersion = bodyMapVersionForVisit(state.annotations, visitId);
  return Object.fromEntries(TABS.flatMap(tab => (["front", "back"] as const).map(view => {
    const row = state.annotations.find(a => a.visit_id === visitId && matchesTab(a, tab) && a.view === view);
    return [layerKey(tab.id, view), { id: row?.id || uid(), coordinateVersion: row?.coordinate_version || visitVersion, revision: row?.revision || 0, strokes: restoreCanvasStrokes(row?.strokes || []), dirty: false }];
  })));
}
export function TabletVisitList() {
  const { data, loading, error } = useAppState();
  if (!data) return <div className="state-loader">{error || (loading ? "방문을 불러오는 중…" : "연결을 확인해 주세요.")}</div>;
  return <main className="tablet-visit-list"><Link href="/" className="tablet-brand">Hani<span>SOAP</span></Link><span className="tablet-eyebrow">IPAD · 시술 기록</span><h1>연결할 방문을 선택하세요</h1><p>선택한 방문의 시술과 필기를 PC에서 함께 확인할 수 있습니다.</p><div className="tablet-visit-rows">{data.state.scenario_inputs.map(s => {
    const patient = data.state.patients.find(p => p.id === s.patient_id)!;
    const visit = data.state.visits.find(v => v.id === s.current_visit_id)!;
    return <Link key={visit.id} href={`/tablet/visits/${visit.id}`}><img src={`/demo/portraits/${patient.portrait_asset_key}.png`} alt="" /><div><strong>{patient.display_name}</strong><span>{visit.reason}</span></div><small>{visit.visit_no}회차</small><ArrowRight size={20} /></Link>;
  })}</div><p className="tablet-field-help">가상 환자로 구성한 데모입니다.</p></main>;
}
export function TabletWorkspace({ visitId }: { visitId: string }) {
  const app = useAppState();
  if (!app.data) return <div className="state-loader">{app.error || "시술 기록을 불러오는 중…"}</div>;
  if (!app.data.state.visits.some(v => v.id === visitId)) return <main className="tablet-visit-list"><h1>방문을 찾을 수 없습니다</h1><Link href="/tablet">방문 다시 선택</Link></main>;
  return <Workspace key={visitId} visitId={visitId} envelope={app.data} error={app.error} act={app.act} refresh={app.refresh} />;
}
function Workspace({ visitId, envelope, error, act, refresh }: {
  visitId: string; envelope: StateEnvelope; error: string | null;
  act: (type: string, payload: Record<string, unknown>) => Promise<StateEnvelope>;
  refresh: () => Promise<StateEnvelope | null>;
}) {
  const state = envelope.state;
  const visit = state.visits.find(v => v.id === visitId)!;
  const patient = state.patients.find(p => p.id === visit.patient_id)!;
  const [tabId, setTabId] = useState<TabId>("needle");
  const [view, setView] = useState<BodyView>("front");
  const [layers, setLayers] = useState<Layers>(() => initialLayers(state, visitId));
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(state, visitId));
  const [picker, setPicker] = useState<{ match: RegionMatch; strokeId?: string } | null>(null);
  const [activeInk, setActiveInk] = useState<InkPoint[]>([]);
  const [zoom, setZoom] = useState<RegionMatch | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewText, setReviewText] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointer = useRef<{ id: number; points: AnnotationStroke["points"] } | null>(null);
  const tab = TABS.find(t => t.id === tabId)!;
  const key = layerKey(tabId, view);
  const layer = layers[key];
  const draft = drafts[tabId];
  const dirty = layer.dirty || drafts[tabId].dirty || layers[layerKey(tabId, view === "front" ? "back" : "front")].dirty;
  const annotation = state.annotations.find(a => a.id === layer.id);
  const audioSession = state.audioSessions.filter(a => a.visit_id === visitId).at(-1);
  const events = state.live_events.filter(e => e.visit_id === visitId && e.status === "suggested");
  const zoomBox = zoom ? `${Math.max(0, Math.min(640, zoom.anchor.x - 180))} ${Math.max(0, Math.min(640, zoom.anchor.y - 180))} 360 360` : "0 0 1000 1000";
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (Object.values(layers).some(l => l.dirty) || Object.values(drafts).some(d => d.dirty)) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [layers, drafts]);
  function changeDraft(update: Partial<Draft>) { setDrafts(d => ({ ...d, [tabId]: { ...d[tabId], ...update, dirty: true, confirmed: false } })); setMessage(""); }
  function changeInk(strokes: AnnotationStroke[]) { setLayers(l => ({ ...l, [key]: { ...l[key], strokes, dirty: true } })); setMessage(""); }
  function point(e: PointerEvent<SVGSVGElement>): AnnotationStroke["points"][number] {
    const matrix = svgRef.current?.getScreenCTM();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix?.inverse());
    return { x: Math.max(0, Math.min(1000, p.x)), y: Math.max(0, Math.min(1000, p.y)), t: Date.now(), pressure: e.pressure || 0.5 };
  }
  function start(e: PointerEvent<SVGSVGElement>) {
    if (busy || e.button !== 0 || pointer.current || !e.isPrimary) return;
    e.preventDefault();
    const p = point(e);
    if (selectMode || e.pointerType === "touch") {
      const match = mapBodyRegion(p, view, layer.coordinateVersion);
      if (match) { setPicker({ match }); setSelectMode(false); }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { id: e.pointerId, points: [p] };
    setActiveInk([p]);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!pointer.current || pointer.current.id !== e.pointerId) return;
    e.preventDefault();
    pointer.current.points.push(point(e));
    setActiveInk([...pointer.current.points]);
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    const current = pointer.current;
    if (!current || current.id !== e.pointerId) return;
    current.points.push(point(e)); pointer.current = null; setActiveInk([]);
    const check = recognizeCheck(current.points, layer.strokes);
    const match = check ? mapBodyRegion(check.anchor, view, layer.coordinateVersion) : null;
    const stroke: AnnotationStroke = { id: uid(), points: current.points, kind: match ? "check" : "memo", created_at: new Date().toISOString() };
    changeInk([...layer.strokes, stroke]);
    if (match) setPicker({ match, strokeId: stroke.id });
  }
  function undo() { changeInk(layer.strokes.slice(0, -1)); setPicker(null); }
  function toMemo() {
    if (picker?.strokeId) changeInk(layer.strokes.map(s => s.id === picker.strokeId ? { ...s, kind: "memo" } : s));
    setPicker(null);
  }
  function addLocations(locations: TreatmentLocation[], match: RegionMatch) {
    const existing = draft.locations;
    const additions = locations.map(p => ({ ...p, annotation_id: layer.id })).filter(p => !existing.some(q => q.location_type === p.location_type && q.acupoint_code === p.acupoint_code && q.body_region === p.body_region && q.laterality === p.laterality && q.location_note === p.location_note));
    changeDraft({ locations: [...existing, ...additions] });
    setPicker(null); setMessage(`${SIDE_LABELS[match.laterality]} ${REGION_LABELS[match.region]} · ${additions.length}개 위치 추가`);
  }
  async function save(confirmed = false) {
    setBusy(true); setMessage("");
    try {
      for (const bodyView of ["front", "back"] as const) {
        const k = layerKey(tabId, bodyView), current = layers[k];
        // Persist linked layers even when a location was chosen using touch.
        if (!current.dirty && (current.revision > 0 || !draft.locations.some(p => p.annotation_id === current.id))) continue;
        const result = await act("annotation.save", { visitId, annotation: { id: current.id, scope: "treatment", modality: tab.modality, technique: tab.technique, view: bodyView, coordinate_space: "normalized", coordinate_version: current.coordinateVersion, canvas_size: { width: 1000, height: 1000 }, strokes: normalizeStrokes(current.strokes), revision: current.revision } });
        const saved = result.state.annotations.find(a => a.id === current.id)!;
        setLayers(l => ({ ...l, [k]: { ...l[k], revision: saved.revision, dirty: false } }));
      }
      if (draft.locations.length || draft.notes || state.treatments.some(t => t.id === draft.id)) {
        const regions = [...new Set(draft.locations.map(p => p.body_region))];
        const sides = [...new Set(draft.locations.map(p => p.laterality))];
        await act("treatment.save", { visitId, treatment: { id: draft.id, modality: tab.modality, technique: tab.technique, body_region: regions.join(", "), laterality: sides.length === 1 ? sides[0] : sides.length ? "bilateral" : "not_applicable", acupoints: draft.locations.filter(p => p.location_type === "acupoint").map(p => ({ code: p.acupoint_code!, label_ko: p.label_ko! })), locations: draft.locations, notes: draft.notes || null, status: confirmed ? "confirmed" : "suggested", source: "manual" } });
      }
      setDrafts(d => ({ ...d, [tabId]: { ...d[tabId], dirty: false, confirmed } }));
      setMessage(confirmed ? `${tab.detail} · 오늘 시행을 확인했습니다` : `${tab.detail} · 초안을 저장했습니다`);
    } catch (err) { setMessage(err instanceof Error ? err.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  async function extractMemo() {
    if (dirty) { setMessage("필기 초안을 먼저 저장해 주세요."); return; }
    const image = memoImage(layer.strokes); if (!image) return;
    setBusy(true); setMessage("필기 텍스트 후보를 추출하는 중…");
    try {
      const response = await fetch("/api/jobs/handwriting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ annotationId: layer.id, revision: layer.revision, image }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "필기 인식 요청에 실패했습니다.");
      await refresh(); setMessage("필기 인식을 요청했습니다. 원본은 저장되어 있습니다.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "필기 인식에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function reviewMemo() {
    if (!annotation) return;
    setBusy(true);
    try { await act("annotation.review", { id: annotation.id, revision: layer.revision, extracted_text: reviewText ?? annotation.extracted_text ?? "" }); setMessage("검토한 필기 내용을 저장했습니다."); }
    catch (err) { setMessage(err instanceof Error ? err.message : "검토 저장에 실패했습니다."); }
    finally { setBusy(false); }
  }
  function switchTab(id: TabId) { if (busy) return; setTabId(id); setPicker(null); setZoom(null); setActiveInk([]); pointer.current = null; setReviewText(null); setMessage(""); }
  return <main className="tablet-app">
    <header className="tablet-header"><Link href="/tablet" className="tablet-brand">Hani<span>SOAP</span><small>시술 기록</small></Link><div className="tablet-patient"><img src={`/demo/portraits/${patient.portrait_asset_key}.png`} alt="" /><div><strong>{patient.display_name} <span>가상 환자</span></strong><p>{visit.visit_no}회차 · {visit.reason}</p></div></div><Link href="/tablet" className="tablet-change-visit">방문 변경 <ChevronDown size={15} /></Link></header>
    <div className="tablet-statusbar"><span><i className={audioSession?.status === "recording" ? "is-live" : ""} />{audioSession?.status === "recording" ? "PC에서 녹음 중" : "PC 녹음 대기"}</span><span>{error ? "연결 확인 필요" : "PC와 같은 방문에 연결됨"}</span><span className="tablet-save-indicator">{busy ? "처리 중…" : dirty ? "저장하지 않은 변경" : "저장된 기록"}</span></div>
    <nav className="tablet-tabs" aria-label="시술 종류" role="tablist">{TABS.map(t => <button type="button" key={t.id} role="tab" aria-selected={tabId === t.id} onClick={() => switchTab(t.id)} disabled={busy}><span>{t.label}</span>{drafts[t.id].locations.length > 0 && <small>{drafts[t.id].locations.length}</small>}{(drafts[t.id].dirty || layers[layerKey(t.id, "front")].dirty || layers[layerKey(t.id, "back")].dirty) && <i aria-label="저장 필요" />}</button>)}</nav>
    <div className="tablet-main">
      <section className="tablet-drawing" aria-label="인체 시술 기록">
        <div className="tablet-canvas-header"><div><span className="tablet-eyebrow">{tab.detail} · 위치와 필기</span><h1>시술한 부위를 표시하세요</h1>{layer.coordinateVersion === "body-map-v1" && <p className="tablet-field-help" data-testid="legacy-body-map-notice">이전 도해로 저장된 필기가 있어 원본 그림을 표시합니다.</p>}</div><div className="tablet-view-toggle">{(["front", "back"] as const).map(v => <button key={v} type="button" aria-pressed={view === v} disabled={busy} onClick={() => { setView(v); setPicker(null); setZoom(null); setReviewText(null); }}>{v === "front" ? "앞면" : "뒷면"}</button>)}</div></div>
        <div className="tablet-canvas-wrap">
          <svg ref={svgRef} className={`tablet-canvas ${selectMode ? "is-selecting" : ""}`} data-testid="treatment-canvas" data-coordinate-version={layer.coordinateVersion} viewBox={zoomBox} role="img" aria-label={`${view === "front" ? "앞면" : "뒷면"} 인체, 펜으로 체크하거나 메모하세요`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { pointer.current = null; setActiveInk([]); }}>
            <defs><linearGradient id="tablet-body-fill" x1="0" x2="1"><stop offset="0" stopColor="#dcece9"/><stop offset=".48" stopColor="#eef6f3"/><stop offset="1" stopColor="#d8e9e7"/></linearGradient></defs>
            <BodyDiagram view={view} version={layer.coordinateVersion} />
            {layer.strokes.map(stroke => <path key={stroke.id} data-ink-kind={stroke.kind} d={inkPath(stroke.points)} className={`tablet-ink ${stroke.kind === "check" ? "tablet-check-ink" : ""}`} />)}
            {activeInk.length > 0 && <path d={inkPath(activeInk)} className="tablet-ink" />}
            {picker && <circle className="tablet-selection-ring" cx={picker.match.anchor.x} cy={picker.match.anchor.y} r="23" />}
          </svg>
          {!zoom && <div className="tablet-canvas-guide"><span className="tablet-check-sample">✓</span><strong>체크하면 부위 선택</strong><span>동그라미와 글씨는 그대로 메모</span></div>}
          <div className="tablet-canvas-corner"><PenLine size={14}/><span>인체 밖의 여백에도 필기할 수 있어요</span></div>
          <div className="tablet-zoom-controls"><button type="button" className="tablet-icon-button" aria-label={zoom ? "전체 인체 보기" : "선택 부위 확대"} disabled={!zoom && !picker} onClick={() => setZoom(zoom ? null : picker?.match || null)}>{zoom ? <ZoomOut size={19}/> : <ZoomIn size={19}/>}</button>{zoom && <button type="button" className="tablet-icon-button" aria-label="확대 초기화" onClick={() => setZoom(null)}><RotateCcw size={17}/></button>}</div>
        </div>
        <div className="tablet-drawing-tools"><button type="button" onClick={() => setSelectMode(v => !v)} aria-pressed={selectMode} disabled={busy}><Hand size={17}/> {selectMode ? "인체에서 부위를 누르세요" : "부위 직접 선택"}</button><button type="button" onClick={() => setPicker({ match: { region: "ankle", laterality: "right", anchor: { x: 450, y: 880 }, view } })} disabled={busy}>목록에서 선택</button><button type="button" aria-label="마지막 필기 취소" disabled={!layer.strokes.length || busy} onClick={undo}><Undo2 size={18}/><span>되돌리기</span></button></div>
      </section>
      <aside className="tablet-inspector" aria-label="오늘 시술과 선택 후보">
        {picker ? <RegionPicker key={`${key}:${picker.strokeId || `${picker.match.region}-${picker.match.laterality}`}`} match={picker.match} onClose={() => setPicker(null)} onMemo={toMemo} onAdd={addLocations} /> : <>
          <div className="tablet-inspector-heading"><span className="tablet-eyebrow">오늘 시술</span><h2>{tab.detail}<span className={draft.confirmed ? "tablet-confirmed-badge" : "tablet-draft-badge"}>{draft.confirmed ? "시행 확인" : "초안"}</span></h2><p>선택한 위치를 확인하고 저장하세요.</p></div>
          <div className="tablet-selected-locations">{draft.locations.length ? draft.locations.map((location, i) => <div className="tablet-location-row" key={`${location.acupoint_code}-${i}`}><span className="tablet-location-check"><Check size={15}/></span><div><strong>{location.label_ko} <small>{location.acupoint_code}</small></strong><p>{SIDE_LABELS[location.laterality]} {REGION_LABELS[location.body_region as BodyRegion] || location.body_region}</p>{location.location_note && <p>{location.location_note}</p>}</div><button type="button" className="tablet-remove" aria-label={`${location.label_ko} 삭제`} onClick={() => changeDraft({ locations: draft.locations.filter((_, index) => i !== index) })} disabled={busy}>×</button></div>) : <div className="tablet-empty-locations"><span>✓</span><strong>아직 선택한 위치가 없어요</strong><p>인체에 체크하거나<br/>부위를 직접 선택해 주세요.</p></div>}</div>
          <label className="tablet-note-field tablet-treatment-note">시술 메모<textarea value={draft.notes} onChange={e => changeDraft({ notes: e.target.value })} placeholder="확인한 내용을 간단히 남겨주세요" rows={3} disabled={busy}/></label>
          <div className="tablet-save-actions"><button type="button" className="tablet-secondary" onClick={() => void save(false)} disabled={busy}>초안 저장</button><button type="button" className="tablet-primary" onClick={() => void save(true)} disabled={busy || !draft.locations.length}><CheckCheck size={17}/>오늘 시행 확인</button></div>
          <p className="tablet-field-help">위치 선택은 초안입니다. 실제 시행한 시술만 확인하세요.</p>
          <details className="tablet-memo-details"><summary><PenLine size={16}/>필기 원본 · {layer.strokes.filter(s => s.kind === "memo").length}획<ChevronDown size={15}/></summary><p className="tablet-field-help">{tab.detail} · {view === "front" ? "앞면" : "뒷면"} 필기 원본을 보존합니다.</p><button type="button" className="tablet-secondary tablet-wide" onClick={() => void extractMemo()} disabled={busy || dirty || !layer.revision || !layer.strokes.some(s => s.kind === "memo")}>필기 텍스트 추출</button>{annotation?.extracted_text != null && <><label className="tablet-note-field">{annotation.extraction_reviewed ? "검토한 텍스트" : "AI 텍스트 후보 · 검토 필요"}<textarea value={reviewText ?? annotation.extracted_text} rows={4} onChange={e => setReviewText(e.target.value)} /></label><button type="button" className="tablet-secondary tablet-wide" disabled={busy || dirty} onClick={() => void reviewMemo()}>필기 내용 검토 확인</button></>}</details>
        </>}
        {events.length > 0 && <section className="tablet-live-candidates"><span className="tablet-eyebrow">PC 음성에서 온 후보</span>{events.slice(-3).map(event => <div key={event.id}><small>{{ current: "현재 발화", planned: "계획", past: "과거", negated: "부정", unclear: "확인 필요" }[event.context]}</small><p>“{event.text}”</p><div>{event.context !== "past" && event.context !== "negated" && <button type="button" disabled={busy} onClick={() => { void act("live.accept", { eventId: event.id }).then(() => setMessage("음성 후보를 추가했습니다. 부위와 시행 여부를 따로 확인해 주세요.")).catch(() => {}); }}>후보 보관</button>}<button type="button" disabled={busy} onClick={() => { void act("live.dismiss", { eventId: event.id }).catch(() => {}); }}>제외</button></div></div>)}<p className="tablet-field-help">시술과 방문은 자동으로 전환되지 않습니다.</p></section>}
      </aside>
    </div>
    <footer className="tablet-footer"><Link href={`/clinic/visits/${visitId}`}><ArrowLeft size={14}/> PC 진료 화면</Link><span>{TABS.filter(t => drafts[t.id].locations.length).map(t => `${t.label} ${drafts[t.id].locations.length}`).join(" · ") || "선택한 시술 위치가 여기에 모입니다"}</span><span className="tablet-footer-source">{layer.coordinateVersion === "body-map-v2" && <a href="/demo/anatomy/ATTRIBUTION.html" target="_blank" rel="noreferrer">인체 도해 · Z-Anatomy / CC BY-SA</a>}<span>가상 진료 데모</span></span></footer>
    {(message || error) && <div className={`tablet-toast ${error ? "is-error" : ""}`} role="status">{message || error}<button type="button" aria-label="알림 닫기" onClick={() => setMessage("")}>×</button></div>}
  </main>;
}
