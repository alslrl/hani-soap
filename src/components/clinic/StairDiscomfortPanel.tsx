"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getTranscriptStairProposal } from '@/lib/ai/clinical-analysis-drafts';
import { STAIR_ASCENT_METRIC, stairAscentMeasurements } from '@/lib/progress/stair-discomfort';
import { NrsSparkline, panelTitle, shortDate, errorMessage, type State, type Patient, type Visit } from './shared';
import { useAppState } from '@/lib/client';
import './stair-discomfort.css';

type Act = ReturnType<typeof useAppState>['act'];
export function StairDiscomfortPanel({ state, patient, visit, act }: { state: State; patient: Patient; visit: Visit; act: Act }) {
  const observations = stairAscentMeasurements(state, visit);
  const today = observations.find(row => row.visit_id === visit.id);
  const previous = observations.filter(row => row.visit_id !== visit.id).at(-1);
  const [value, setValue] = useState(today ? String(today.value) : '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const currentVisit = useRef(visit.id);
  const { refresh } = useAppState();
  const proposal = getTranscriptStairProposal(state,visit.id);
  const [aiBinding,setAiBinding] = useState<NonNullable<typeof proposal>|null>(null);
  const [conflict,setConflict] = useState<{targetHash:string;current:string}|null>(null);
  useEffect(() => {
    if (currentVisit.current !== visit.id) {
      currentVisit.current = visit.id; setValue(today ? String(today.value) : ''); setDirty(false); setError(''); setNotice(''); setAiBinding(null); setConflict(null);
    } else if (!dirty) { setValue(today ? String(today.value) : proposal ? String(proposal.candidate.value) : ''); setAiBinding(today ? null : proposal ?? null); }
  }, [visit.id, today?.id, today?.value, dirty, proposal?.candidate.id,proposal?.candidate.value,proposal?.transcriptRevision]);
  const score = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(score) && score >= 0 && score <= 10;
  async function save(replace=false) {
    if (!valid || busy) return;
    const submittedVisit = visit.id;
    setBusy(true); setError(''); setNotice('');
    try {
      if (aiBinding) {
        const response=await fetch('/api/clinical-analysis/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:aiBinding.jobId,candidateId:aiBinding.candidate.id,visitId:submittedVisit,patientId:patient.id,expectedTranscriptRevision:aiBinding.transcriptRevision,decision:'confirm',edit:{value:score},...(replace&&conflict?{allowOverwrite:true,expectedTargetHash:conflict.targetHash}:{})})});
        const result=await response.json();
        if(!response.ok){if(result.code==='ANALYSIS_ENTRY_CONFLICT')setConflict(result.details);throw new Error(result.error||'점수를 저장하지 못했어요.');}
        await refresh();
      } else await act('observation.save', { visitId: submittedVisit, ...STAIR_ASCENT_METRIC, value: score });
      setAiBinding(null);setConflict(null);
      if (currentVisit.current === submittedVisit) { setDirty(false); setNotice('계단 오를 때 불편함을 저장했어요.'); }
    } catch (error) { if (currentVisit.current === submittedVisit) setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="hs-panel hs-nrs-panel hs-stair-panel" aria-label="계단 오를 때 불편함">
    {panelTitle('계단 오를 때 불편함', <Link href={`/clinic/patients/${patient.id}/progress`} className="hs-text-link">경과 보기 ↗</Link>)}
    <p className="hs-metric-context">오른쪽 발목 · 계단 오르기 · 자체 기능 불편 점수</p>
    <div className="hs-nrs-summary">
      <div><span>오늘</span><strong>{today ? today.value : '—'}<small>/ 10</small></strong></div>
      <div><span>직전 방문</span><strong className="hs-prior-score">{previous ? previous.value : '—'}<small>{previous ? shortDate(previous.measured_at) : '미확인'}</small></strong></div>
    </div>
    <NrsSparkline label="계단 오를 때 불편함" emptyTitle="아직 확인한 계단 오르기 점수가 없어요" points={observations.map(row => ({ value: row.value, label: shortDate(row.measured_at) }))}/>
    <p className="hs-stair-endpoints">0 불편 없음<span>10 가장 심한 불편</span></p>
    {aiBinding && <div className="hs-evidence" role="note" aria-label="전사 기반 계단 점수 초안"><strong>전사 기반 AI 초안 · 검토 전</strong>{aiBinding.candidate.source_refs.map((ref,index)=><p key={index}>“{ref.quote}”</p>)}<button type="button" className="hs-text-link" onClick={()=>{setAiBinding(null);setDirty(true);setConflict(null);}}>수기 입력으로 변경</button></div>}
    <form className="hs-nrs-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="today-stair-ascent">오늘 확인한 불편 점수</label>
      <div><input id="today-stair-ascent" type="number" inputMode="numeric" min={0} max={10} step={1} placeholder="미확인" value={value} disabled={busy} onChange={event => { setValue(event.target.value); setDirty(true); setNotice(''); }}/><button className="hs-button hs-button-small" disabled={busy || !valid || !dirty && !aiBinding}>{busy ? '저장 중' : '저장'}</button></div>
    </form>
    {conflict && <div className="hs-inline-error" role="alert"><p>다른 입력에서 저장한 현재 점수: {conflict.current}</p><button className="hs-button hs-button-small" disabled={busy} onClick={()=>void save(true)}>현재 기록 확인 후 입력값 저장</button></div>}
    {error && <p className="hs-inline-error" role="alert">{error}</p>}
    {notice && <p className="hs-save-notice" role="status">{notice}</p>}
  </section>;
}
