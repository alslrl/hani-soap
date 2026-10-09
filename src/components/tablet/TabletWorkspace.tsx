"use client";
import { Disclosure } from '@/components/ui/Disclosure';


import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Hand, History, NotebookPen, X, PenLine, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useAppState } from "@/lib/client";
import type { AnnotationStroke, AppState, StateEnvelope, Treatment, TreatmentLocation } from "@/lib/types";
import { BodyDiagram } from "./BodyDiagram";
import { AcupointReferenceDots } from "./AcupointReferenceDots";
import { RegionPicker } from "./RegionPicker";
import { inkPath, recognizeCheck, type InkPoint } from "@/lib/tablet/geometry";
import { mapBodyRegion, REGION_LABELS, SIDE_LABELS, type BodyRegion, type BodyView, type RegionMatch } from "@/lib/tablet/regions";
import { memoImage } from "@/lib/tablet/ink-image";
import { normalizeStrokes, restoreCanvasStrokes } from "@/lib/tablet/coordinates";
import { BODY_MAP_VERSIONS, BODY_MAP_LABELS, preferredBodyMapVersionForSex, historicalBodyMapVersions, type BodyMapVersion } from "@/lib/tablet/body-map-version";
import { bodyCanvasViewBox, svgViewBox } from "@/lib/tablet/viewport";
import { DrawingInput, type CanvasPointer } from "@/lib/tablet/drawing-input";
import "./tablet-input.css";

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
const layerKey = (tab: TabId, view: BodyView, version: BodyMapVersion) => `${version}:${tab}:${view}`;
const portraitQuery = "(orientation: portrait)";
const subscribeOrientation = (callback: () => void) => { const media = window.matchMedia(portraitQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
const portraitSnapshot = () => window.matchMedia(portraitQuery).matches;
const serverPortraitSnapshot = () => false;
const uid = () => crypto.randomUUID();
function ageAtVisit(birthDate: string, visitDate: string): number {
  const birth = birthDate.split("-").map(Number);
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(visitDate));
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const day = Number(parts.find(part => part.type === "day")?.value);
  return Math.max(0, year - birth[0] - (month < birth[1] || month === birth[1] && day < birth[2] ? 1 : 0));
}

const matchesTab = (row: Pick<Treatment, "modality" | "technique">, tab: typeof TABS[number]) => row.modality === tab.modality && row.technique === tab.technique;
function initialDrafts(state: AppState, visitId: string): Drafts {
  return Object.fromEntries(TABS.map(tab => {
    const row = state.treatments.find(t => t.visit_id === visitId && matchesTab(t, tab) && t.source === "manual");
    const locations = row?.locations || row?.acupoints.map(p => ({ location_type: "acupoint" as const, acupoint_code: p.code, label_ko: p.label_ko, body_region: row.body_region, laterality: row.laterality, location_note: "", annotation_id: null, finding_ref: null })) || [];
    return [tab.id, { id: row?.id || uid(), locations, notes: row?.notes || "", confirmed: row?.status === "confirmed", dirty: false }];
  })) as Drafts;
}
function initialLayers(state: AppState, visitId: string): Layers {
  return Object.fromEntries(BODY_MAP_VERSIONS.flatMap(version => TABS.flatMap(tab => (["front", "back"] as const).map(view => {
    const row = state.annotations.find(a => a.visit_id === visitId && matchesTab(a, tab) && a.view === view && a.coordinate_version === version);
    return [layerKey(tab.id, view, version), { id: row?.id || uid(), coordinateVersion: version, revision: row?.revision || 0, strokes: restoreCanvasStrokes(row?.strokes || []), dirty: false }];
  }))));
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
  const preferredVersion = preferredBodyMapVersionForSex(patient.sex);
  const [frameVersion, setFrameVersion] = useState<BodyMapVersion>(preferredVersion);
  const historicalVersions = historicalBodyMapVersions(state.annotations, visitId, preferredVersion);
  const isHistorical = frameVersion !== preferredVersion;
  const portrait = useSyncExternalStore(subscribeOrientation, portraitSnapshot, serverPortraitSnapshot);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [showFullCanvas, setShowFullCanvas] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const input = useRef(new DrawingInput());
  const strokeMatrix = useRef<DOMMatrix | null>(null);
  const tab = TABS.find(t => t.id === tabId)!;
  const key = layerKey(tabId, view, frameVersion);
  const layer = layers[key];
  const draft = drafts[tabId];
  const dirty = layer.dirty || drafts[tabId].dirty || layers[layerKey(tabId, view === "front" ? "back" : "front", frameVersion)].dirty;
  const annotation = state.annotations.find(a => a.id === layer.id);
  const audioSession = state.audioSessions.filter(a => a.visit_id === visitId).at(-1);
  const events = state.live_events.filter(e => e.visit_id === visitId && e.status === "suggested");
  const zoomBox = svgViewBox(bodyCanvasViewBox(portrait, zoom?.anchor || null, { originalPlane: isHistorical || showFullCanvas }));
  const hasInkOutsidePortrait = layer.strokes.some(stroke => stroke.points.some(p => p.x < 230 || p.x > 770));
  const sheetOpen = portrait && (Boolean(picker) || recordsOpen);
  const inspectorRef = useRef<HTMLElement>(null);
  const visibleLocations = draft.locations.map((location, index) => ({ location, index })).filter(({ location }) => !isHistorical || state.annotations.some(a => a.id === location.annotation_id && a.coordinate_version === frameVersion));
  useEffect(() => {
    const root = document.documentElement;
    const wasLocked = root.classList.contains("hani-tablet-drawing-active");
    const scroll = { x: window.scrollX, y: window.scrollY };
    root.classList.add("hani-tablet-drawing-active");
    const wrap = svgRef.current?.parentElement;
    const stopNativePan = (event: TouchEvent) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;
      if (event.cancelable) event.preventDefault();
    };
    wrap?.addEventListener("touchstart", stopNativePan, { passive: false });
    wrap?.addEventListener("touchmove", stopNativePan, { passive: false });
    return () => {
      wrap?.removeEventListener("touchstart", stopNativePan);
      wrap?.removeEventListener("touchmove", stopNativePan);
      if (!wasLocked) { root.classList.remove("hani-tablet-drawing-active"); window.scrollTo(scroll.x, scroll.y); }
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (Object.values(layers).some(l => l.dirty) || Object.values(drafts).some(d => d.dirty)) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [layers, drafts]);
  function changeDraft(update: Partial<Draft>) { if (isHistorical) return; setDrafts(d => ({ ...d, [tabId]: { ...d[tabId], ...update, dirty: true, confirmed: false } })); setMessage(""); }
  function changeInk(strokes: AnnotationStroke[]) { if (isHistorical) return; setLayers(l => ({ ...l, [key]: { ...l[key], strokes, dirty: true } })); setMessage(""); }
  function appendInk(stroke: AnnotationStroke) {
    if (isHistorical) return;
    setLayers(l => ({ ...l, [key]: { ...l[key], strokes: [...l[key].strokes, stroke], dirty: true } }));
    setMessage("");
  }
  function point(e: Pick<globalThis.PointerEvent, "clientX" | "clientY" | "pressure">): AnnotationStroke["points"][number] | null {
    const matrix = strokeMatrix.current;
    if (!matrix) return null;
    const x = matrix.a * e.clientX + matrix.c * e.clientY + matrix.e;
    const y = matrix.b * e.clientX + matrix.d * e.clientY + matrix.f;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(1000, y)), t: Date.now(), pressure: e.pressure || 0.5 };
  }
  function start(e: PointerEvent<SVGSVGElement>) {
    if (busy || isHistorical || sheetOpen) return;
    e.preventDefault();
    if (input.current.drawing) return;
    // Freeze the mapping for this contact so browser chrome cannot move the ink.
    if (!input.current.owns(e.pointerId)) {
      const matrix = svgRef.current?.getScreenCTM();
      if (!matrix) return;
      if (e.pointerType !== "touch") strokeMatrix.current = matrix.inverse();
      else strokeMatrix.current = matrix.inverse();
    }
    const p = point(e);
    if (!p) return;
    const kind = input.current.down(e, p, selectMode);
    if (!kind) return;
    if (kind === "select") {
      const match = mapBodyRegion(p, view, layer.coordinateVersion);
      if (match) { setPicker({ match }); setSelectMode(false); }
      return;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Window handlers finish a contact if capture is unavailable. */ }
    if (kind === "ink") { setSelectMode(false); setActiveInk([p]); }
  }
  type PointerSample = CanvasPointer & Pick<globalThis.PointerEvent, "pressure" | "preventDefault"> & { nativeEvent?: globalThis.PointerEvent };
  function move(e: PointerSample) {
    if (!input.current.owns(e.pointerId)) return;
    e.preventDefault();
    const samples = e.nativeEvent?.getCoalescedEvents?.() || [];
    let points: InkPoint[] | null = null;
    for (const sample of samples.length ? samples : [e]) {
      const p = point(sample);
      if (p) points = input.current.move(sample, p);
    }
    if (points) setActiveInk([...points]);
  }
  function end(e: PointerSample) {
    if (!input.current.owns(e.pointerId)) return;
    e.preventDefault();
    const p = point(e);
    if (!p) { cancel(e); return; }
    const result = input.current.up(e, p);
    if (!result) return;
    if (result.kind === "select") {
      const match = mapBodyRegion(result.point, view, layer.coordinateVersion);
      if (match) { setPicker({ match }); setSelectMode(false); }
      return;
    }
    setActiveInk([]);
    const check = recognizeCheck(result.points, layer.strokes);
    const match = check ? mapBodyRegion(check.anchor, view, layer.coordinateVersion) : null;
    const stroke: AnnotationStroke = { id: uid(), points: result.points, kind: match ? "check" : "memo", created_at: new Date().toISOString() };
    appendInk(stroke);
    if (match) setPicker({ match, strokeId: stroke.id });
  }
  function cancel(e: Pick<CanvasPointer, "pointerId">) {
    if (!input.current.owns(e.pointerId)) return;
    const points = input.current.cancel(e.pointerId);
    setActiveInk([]);
    if (points) appendInk({ id: uid(), points, kind: "memo", created_at: new Date().toISOString() });
  }
  const inputHandlers = useRef({ move, end, cancel });
  inputHandlers.current = { move, end, cancel };
  useEffect(() => {
    const outsideMove = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Node) || !svgRef.current?.contains(event.target)) inputHandlers.current.move(event); };
    const finish = (event: globalThis.PointerEvent) => inputHandlers.current.end(event);
    const interrupted = (event: globalThis.PointerEvent) => inputHandlers.current.cancel(event);
    window.addEventListener("pointermove", outsideMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", interrupted);
    return () => { window.removeEventListener("pointermove", outsideMove); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", interrupted); };
  }, []);
  function undo() { changeInk(layer.strokes.slice(0, -1)); setPicker(null); }
  function toMemo() {
    if (picker?.strokeId) changeInk(layer.strokes.map(s => s.id === picker.strokeId ? { ...s, kind: "memo" } : s));
    setPicker(null);
  }
  function addLocations(locations: TreatmentLocation[], match: RegionMatch) {
    const existing = draft.locations;
    const additions = locations.map(p => ({ ...p, annotation_id: layer.id })).filter(p => !existing.some(q => q.location_type === p.location_type && q.acupoint_code === p.acupoint_code && q.body_region === p.body_region && q.laterality === p.laterality && q.location_note === p.location_note && q.annotation_id === p.annotation_id));
    changeDraft({ locations: [...existing, ...additions] });
    setPicker(null); setMessage(`현재 시술에 ${additions.length}개 위치 추가`);
  }
  async function save(confirmed = false) {
    if (isHistorical) return;
    setBusy(true); setMessage("");
    try {
      for (const bodyView of ["front", "back"] as const) {
        const k = layerKey(tabId, bodyView, preferredVersion), current = layers[k];
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
    if (isHistorical) return;
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
    if (!annotation || isHistorical) return;
    setBusy(true);
    try { await act("annotation.review", { id: annotation.id, revision: layer.revision, extracted_text: reviewText ?? annotation.extracted_text ?? "" }); setMessage("검토한 필기 내용을 저장했습니다."); }
    catch (err) { setMessage(err instanceof Error ? err.message : "검토 저장에 실패했습니다."); }
    finally { setBusy(false); }
  }
  function switchTab(id: TabId) { if (busy) return; input.current.reset(); setTabId(id); setPicker(null); setZoom(null); setActiveInk([]); setReviewText(null); setMessage(""); }
  function changeFrame(version: BodyMapVersion) {
    if (busy) return;
    input.current.reset(); setFrameVersion(version); setShowFullCanvas(false); setPicker(null); setZoom(null); setRecordsOpen(false); setHistoryOpen(false); setSelectMode(false); setReviewText(null); setActiveInk([]);
  }
  function dismissPanel() {
    if (picker) toMemo();
    setRecordsOpen(false);
  }
  useEffect(() => {
    if (!picker && !recordsOpen && !historyOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); dismissPanel(); setHistoryOpen(false); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });
  useEffect(() => {
    if (!sheetOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = inspectorRef.current;
    panel?.querySelector<HTMLElement>("button, select, input, textarea")?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [sheetOpen]);
  return <main className={`tablet-app tablet-fixed-workspace ${portrait ? "is-portrait" : "is-landscape"} ${isHistorical ? "is-historical" : ""}`}>
    <header className="tablet-header" inert={sheetOpen || undefined}>
      <Link href="/tablet" className="tablet-brand">Hani<span>SOAP</span><small>시술 기록</small></Link>
      <div className="tablet-patient"><img src={`/demo/portraits/${patient.portrait_asset_key}.png`} alt="" /><div><strong>{patient.display_name} <span className="tablet-patient-demographics">{ageAtVisit(patient.birth_date, visit.scheduled_at)}세 · {{ female: "여", male: "남", unspecified: "성별 미기재" }[patient.sex]} · {visit.visit_no}회차</span></strong><p>{visit.reason || patient.chief_complaint}</p></div></div>
      <Link href="/tablet" className="tablet-change-visit">방문 변경 <ChevronDown size={15} /></Link>
    </header>
    <div className="tablet-statusbar" inert={sheetOpen || undefined}>
      <span><i className={audioSession?.status === "recording" ? "is-live" : ""} />{audioSession?.status === "recording" ? "PC에서 녹음 중" : "PC 녹음 대기"}</span>
      <span>{error ? "연결 확인 필요" : "PC와 같은 방문에 연결됨"}</span>
      <span className="tablet-save-indicator">{isHistorical ? "이전 원본 · 읽기 전용" : busy ? "처리 중…" : dirty ? "저장하지 않은 변경" : "저장된 기록"}</span>
    </div>
    <nav className="tablet-tabs" aria-label="시술 종류" role="tablist" inert={sheetOpen || undefined}>{TABS.map(t => <button type="button" key={t.id} role="tab" aria-selected={tabId === t.id} onClick={() => switchTab(t.id)} disabled={busy}>
      <span>{t.label}</span>{drafts[t.id].locations.length > 0 && <small>{drafts[t.id].locations.length}</small>}
      {!isHistorical && (drafts[t.id].dirty || layers[layerKey(t.id, "front", frameVersion)].dirty || layers[layerKey(t.id, "back", frameVersion)].dirty) && <i aria-label="저장 필요" />}
    </button>)}</nav>
    <div className="tablet-main">
      <section className="tablet-drawing" aria-label="인체 시술 기록" inert={sheetOpen || undefined}>
        <div className="tablet-canvas-header">
          <div><span className="tablet-eyebrow">{tab.detail} · {isHistorical ? "이전 도해 원본" : "위치와 필기 · 혈자리 참고점 (검수 전)"}</span><h1>{isHistorical ? "이전 도해 기록" : "시술한 부위를 표시하세요"}</h1></div>
          <div className="tablet-canvas-navigation">
            {historicalVersions.length > 0 && !isHistorical && <div className="tablet-history-control">
              <button type="button" className="tablet-history-toggle" aria-label="이전 도해 기록" onClick={() => historicalVersions.length === 1 ? changeFrame(historicalVersions[0]) : setHistoryOpen(value => !value)} disabled={busy}><History size={16}/><span>이전 도해 기록</span></button>
              {historyOpen && <div className="tablet-history-menu">{historicalVersions.map(version => <button type="button" key={version} onClick={() => changeFrame(version)}>{BODY_MAP_LABELS[version]}</button>)}</div>}
            </div>}
            <div className="tablet-view-toggle">{(["front", "back"] as const).map(v => <button key={v} type="button" aria-pressed={view === v} disabled={busy} onClick={() => { setView(v); setPicker(null); setZoom(null); setReviewText(null); }}>{v === "front" ? "앞면" : "뒷면"}</button>)}</div>
          </div>
        </div>
        {isHistorical && <div className="tablet-history-notice" data-testid="legacy-body-map-notice"><span>{BODY_MAP_LABELS[frameVersion]}에 저장된 원본입니다. 읽기 전용으로 표시합니다.</span>{!portrait && <button type="button" onClick={() => changeFrame(preferredVersion)}>현재 도해로 돌아가기 <ArrowRight size={15}/></button>}</div>}
        <div className="tablet-canvas-wrap">
          <svg ref={svgRef} className={`tablet-canvas ${selectMode ? "is-selecting" : ""}`} data-testid="treatment-canvas" data-coordinate-version={layer.coordinateVersion} data-readonly={isHistorical} viewBox={zoomBox} role="img" aria-label={`${view === "front" ? "앞면" : "뒷면"} 인체, ${isHistorical ? "이전 필기 읽기 전용" : "펜으로 체크하거나 메모하세요"}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={e => e.preventDefault()}>
            <defs><linearGradient id="tablet-body-fill" x1="0" x2="1"><stop offset="0" stopColor="#dcece9"/><stop offset=".48" stopColor="#eef6f3"/><stop offset="1" stopColor="#d8e9e7"/></linearGradient></defs>
            <BodyDiagram view={view} version={layer.coordinateVersion} />
            {!isHistorical && <AcupointReferenceDots view={view} version={layer.coordinateVersion} />}
            {layer.strokes.map(stroke => <path key={stroke.id} data-ink-kind={stroke.kind} d={inkPath(stroke.points)} className={`tablet-ink ${stroke.kind === "check" ? "tablet-check-ink" : ""}`} />)}
            {activeInk.length > 0 && <path d={inkPath(activeInk)} className="tablet-ink" />}
            {picker && picker.match.selectionSource !== "catalog" && <circle className="tablet-selection-ring" cx={picker.match.anchor.x} cy={picker.match.anchor.y} r="23" />}
          </svg>
          {portrait && !isHistorical && !zoom && (hasInkOutsidePortrait || showFullCanvas) && <button type="button" className="tablet-full-canvas-toggle" onClick={() => setShowFullCanvas(value => !value)}>{showFullCanvas ? "인체 크게 보기" : "전체 필기 보기"}</button>}
          {!zoom && !isHistorical && <div className="tablet-canvas-guide"><span className="tablet-check-sample">✓</span><strong>체크하면 부위 선택</strong><span>동그라미와 글씨는 그대로 메모</span></div>}
          <div className="tablet-canvas-corner"><PenLine size={14}/><span>{isHistorical ? `${layer.strokes.length}획 · 저장 당시 도해에 원본 표시` : "체크는 부위 선택 · 글씨와 동그라미는 메모"}</span></div>
          <div className="tablet-zoom-controls"><button type="button" className="tablet-icon-button" aria-label={zoom ? "전체 인체 보기" : "선택 부위 확대"} disabled={!zoom && (!picker || picker.match.selectionSource === "catalog")} onClick={() => setZoom(zoom ? null : picker?.match || null)}>{zoom ? <ZoomOut size={19}/> : <ZoomIn size={19}/>}</button>{zoom && <button type="button" className="tablet-icon-button" aria-label="확대 초기화" onClick={() => setZoom(null)}><RotateCcw size={17}/></button>}</div>
        </div>
        <div className="tablet-drawing-tools">
          {!isHistorical && <><button type="button" onClick={() => setSelectMode(value => !value)} aria-pressed={selectMode} disabled={busy}><Hand size={17}/><span>{selectMode ? "부위를 누르세요" : "부위 직접 선택"}</span></button><button type="button" className="tablet-manual-list" onClick={() => setPicker({ match: { region: "head", laterality: "not_applicable", anchor: { x: 500, y: 500 }, view, selectionSource: "catalog" } })} disabled={busy}>목록에서 선택</button><button type="button" className="tablet-undo" aria-label="마지막 필기 취소" disabled={!layer.strokes.length || busy} onClick={undo}><Undo2 size={18}/><span>되돌리기</span></button></>}
          <button type="button" className="tablet-records-toggle" aria-expanded={recordsOpen} onClick={() => setRecordsOpen(value => !value)}><NotebookPen size={18}/><span>기록</span>{draft.locations.length > 0 && <small>{draft.locations.length}</small>}</button>
          {!isHistorical && <button type="button" className="tablet-toolbar-save" onClick={() => void save(false)} disabled={busy}>초안 저장</button>}
          {isHistorical && <button type="button" className="tablet-toolbar-return" onClick={() => changeFrame(preferredVersion)}>현재 도해로 돌아가기</button>}
        </div>
      </section>
      {sheetOpen && <button type="button" className="tablet-sheet-backdrop" aria-label="패널 닫기" tabIndex={-1} onClick={dismissPanel}/>}
      <aside ref={inspectorRef} className={`tablet-inspector ${sheetOpen ? "is-sheet-open" : ""}`} aria-label="오늘 시술과 선택 후보" role={portrait && recordsOpen && !picker ? "dialog" : undefined} aria-modal={portrait && recordsOpen && !picker ? true : undefined}>
        {picker ? <RegionPicker key={`${key}:${picker.strokeId || `${picker.match.region}-${picker.match.laterality}`}`} match={picker.match} onClose={toMemo} onMemo={toMemo} onAdd={addLocations} modal={portrait} onZoom={() => { setZoom(picker.match); setPicker(null); }} /> : <>
          <div className="tablet-sheet-heading"><span>{isHistorical ? "이전 도해 기록" : "오늘 시술 기록"}</span><button type="button" className="tablet-icon-button" aria-label="기록 닫기" onClick={() => setRecordsOpen(false)}><X size={18}/></button></div>
          <div className="tablet-inspector-heading"><span className="tablet-eyebrow">{isHistorical ? "원본 보존 · 읽기 전용" : "오늘 시술"}</span><h2>{tab.detail}<span className={draft.confirmed ? "tablet-confirmed-badge" : "tablet-draft-badge"}>{isHistorical ? "이전 기록" : draft.confirmed ? "시행 확인" : "초안"}</span></h2><p>{isHistorical ? "이 도해에 연결된 필기와 위치를 확인하세요." : "선택한 위치를 확인하고 저장하세요."}</p></div>
          <div className="tablet-selected-locations">{visibleLocations.length ? visibleLocations.map(({ location, index }) => {
            const sourceFrame = state.annotations.find(a => a.id === location.annotation_id)?.coordinate_version;
            return <div className="tablet-location-row" key={`${location.acupoint_code}-${index}`}><span className="tablet-location-check"><Check size={15}/></span><div><strong>{location.label_ko} <small>{location.acupoint_code}</small></strong><p>{SIDE_LABELS[location.laterality]} {REGION_LABELS[location.body_region as BodyRegion] || location.body_region}{!isHistorical && sourceFrame && sourceFrame !== preferredVersion ? " · 이전 도해 위치" : ""}</p>{location.location_note && <p>{location.location_note}</p>}</div>{!isHistorical && <button type="button" className="tablet-remove" aria-label={`${location.label_ko} 삭제`} onClick={() => changeDraft({ locations: draft.locations.filter((_, i) => i !== index) })} disabled={busy}>×</button>}</div>;
          }) : <div className="tablet-empty-locations"><span>✓</span><strong>{isHistorical ? "이 도해에 연결된 위치가 없습니다" : "아직 선택한 위치가 없어요"}</strong><p>{isHistorical ? "원본 필기는 인체 화면에서 확인하세요." : "인체에 체크하거나 부위를 직접 선택해 주세요."}</p></div>}</div>
          {!isHistorical && <><label className="tablet-note-field tablet-treatment-note">시술 메모<textarea value={draft.notes} onChange={e => changeDraft({ notes: e.target.value })} placeholder="확인한 내용을 간단히 남겨주세요" rows={3} disabled={busy}/></label><div className="tablet-save-actions"><button type="button" className="tablet-secondary" onClick={() => void save(false)} disabled={busy}>초안 저장</button><button type="button" className="tablet-primary" onClick={() => void save(true)} disabled={busy || !draft.locations.length}><CheckCheck size={17}/>오늘 시행 확인</button></div><p className="tablet-field-help">위치 선택은 초안입니다. 실제 시행한 시술만 확인하세요.</p></>}
          <Disclosure className="tablet-memo-details"><summary><PenLine size={16}/>필기 원본 · {layer.strokes.filter(s => s.kind === "memo").length}획<ChevronDown size={15}/></summary><p className="tablet-field-help">{tab.detail} · {view === "front" ? "앞면" : "뒷면"} 필기 원본을 보존합니다.</p>{!isHistorical && <button type="button" className="tablet-secondary tablet-wide" onClick={() => void extractMemo()} disabled={busy || dirty || !layer.revision || !layer.strokes.some(s => s.kind === "memo")}>필기 텍스트 추출</button>}{annotation?.extracted_text != null && <><label className="tablet-note-field">{annotation.extraction_reviewed ? "검토한 텍스트" : "AI 텍스트 후보 · 검토 필요"}<textarea value={reviewText ?? annotation.extracted_text} readOnly={isHistorical} rows={4} onChange={e => setReviewText(e.target.value)} /></label>{!isHistorical && <button type="button" className="tablet-secondary tablet-wide" disabled={busy || dirty} onClick={() => void reviewMemo()}>필기 내용 검토 확인</button>}</>}</Disclosure>
        </>}
        {!isHistorical && events.length > 0 && <section className="tablet-live-candidates"><span className="tablet-eyebrow">PC 음성에서 온 후보</span>{events.slice(-3).map(event => <div key={event.id}><small>{{ current: "현재 발화", planned: "계획", past: "과거", negated: "부정", unclear: "확인 필요" }[event.context]}</small><p>“{event.text}”</p><div>{event.context !== "past" && event.context !== "negated" && <button type="button" disabled={busy} onClick={() => { void act("live.accept", { eventId: event.id }).then(() => setMessage("음성 후보를 추가했습니다. 부위와 시행 여부를 따로 확인해 주세요.")).catch(() => {}); }}>후보 보관</button>}<button type="button" disabled={busy} onClick={() => { void act("live.dismiss", { eventId: event.id }).catch(() => {}); }}>제외</button></div></div>)}<p className="tablet-field-help">시술과 방문은 자동으로 전환되지 않습니다.</p></section>}
        <div className="tablet-sheet-footer"><Link href={`/clinic/visits/${visitId}`}>PC 진료 화면</Link>{frameVersion !== "body-map-v1" && <a href="/demo/anatomy/ATTRIBUTION.html" target="_blank" rel="noreferrer">{frameVersion === "body-map-v3-female" ? "여성 도해 · HRA / CC BY" : "인체 도해 · Z-Anatomy / CC BY-SA"}</a>}</div>
      </aside>
    </div>
    <footer className="tablet-footer" inert={sheetOpen || undefined}><Link href={`/clinic/visits/${visitId}`}><ArrowLeft size={14}/> PC 진료 화면</Link><span>{TABS.filter(t => drafts[t.id].locations.length).map(t => `${t.label} ${drafts[t.id].locations.length}`).join(" · ") || "선택한 시술 위치가 여기에 모입니다"}</span><span className="tablet-footer-source">{frameVersion !== "body-map-v1" && <a href="/demo/anatomy/ATTRIBUTION.html" target="_blank" rel="noreferrer">{frameVersion === "body-map-v3-female" ? "여성 도해 · HRA / CC BY" : "인체 도해 · Z-Anatomy / CC BY-SA"}</a>}<span>가상 진료 데모</span></span></footer>
    {(message || error) && <div className={`tablet-toast ${error ? "is-error" : ""}`} role="status">{message || error}<button type="button" aria-label="알림 닫기" onClick={() => setMessage("")}>×</button></div>}
  </main>;
}
