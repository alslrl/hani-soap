'use client';
import { useState } from 'react';
import { useAppState } from '@/lib/client';
import type { AnalysisCandidate } from '@/lib/ai/clinical-analysis';
import { matchesTranscriptNrsCandidate, type NrsPanelTarget, type TranscriptAnswerDraftBinding } from '@/lib/ai/clinical-analysis-drafts';
import type { AppState } from '@/lib/types';
import { QUESTION_GROUPS } from './questions';
import styles from './ClinicalAnalysisReview.module.css';
const signalLabels = { worry: '직접 표현한 걱정', effect_question: '효과에 대한 질문', understanding_gap: '설명 이해 확인', practice_difficulty: '관리 실천 어려움', open_question: '미해결 질문' };
const units: Record<string,string> = { score: '점', count_per_night: '회/밤', count_per_day: '회/일', episodes_per_night: '회/밤' };
export function ClinicalAnalysisReview({ visitId, disabled = false, nrsTarget }: { visitId: string; disabled?: boolean; nrsTarget?: NrsPanelTarget }) {
  const { data, refresh } = useAppState();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, { text?: string; value?: string }>>({});
  const [conflicts, setConflicts] = useState<Record<string, { targetHash: string; current: string }>>({});
  const state = data?.state;
  const visit = state?.visits.find(item => item.id === visitId);
  const latest = state?.transcripts.filter(item => item.visit_id === visitId).sort((a,b) => b.revision-a.revision)[0];
  const job = state?.jobs.filter(item => item.visit_id === visitId && item.result?.task === 'clinical_analysis').sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
  const stale = Boolean(job && (!latest || latest.id !== job.result?.transcriptId || latest.revision !== job.result?.input_transcript_revision || job.result?.stale_input));
  const candidates = (job?.result?.candidates ?? []) as AnalysisCandidate[];
  const missing = (job?.result?.missing_questions ?? []) as { item_key: string; subitem_key: string; question: string }[];
  if (!state || !visit) return null;
  const generate = async () => {
    if (!latest) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/clinical-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitId, patientId: visit.patient_id, transcriptId: latest.id, expectedTranscriptRevision: latest.revision }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? '분석을 시작하지 못했습니다.');
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '분석을 시작하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const review = async (candidate: AnalysisCandidate, decision: 'confirm' | 'reject', replace = false) => {
    if (!job || !latest) return;
    const draft = edits[candidate.id];
    const edit = draft && decision === 'confirm' ? { ...(draft.text !== undefined && draft.text !== candidate.text ? { text: draft.text } : {}), ...(candidate.kind === 'measurement' && draft.value !== undefined && Number(draft.value) !== candidate.value ? { value: draft.value.trim() ? Number(draft.value) : null } : {}) } : undefined;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/clinical-analysis/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, candidateId: candidate.id, visitId, patientId: visit.patient_id, expectedTranscriptRevision: latest.revision, decision, ...(edit && Object.keys(edit).length ? { edit } : {}), ...(replace ? { allowOverwrite: true, expectedTargetHash: conflicts[candidate.id]?.targetHash } : {}) }) });
      const body = await response.json();
      if (!response.ok) {
        if (body.code === 'ANALYSIS_ENTRY_CONFLICT' && body.details?.targetHash) { setConflicts(current => ({ ...current, [candidate.id]: body.details })); await refresh(); return; }
        throw new Error(body.error ?? '후보 검토를 저장하지 못했습니다.');
      }
      setConflicts(current => { const next = { ...current }; delete next[candidate.id]; return next; });
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '후보 검토를 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const active = job && ['queued','running'].includes(job.status);
  return <details className={styles.root} open={Boolean(candidates.length && !stale)}>
    <summary>전사 기반 진료 분석 {candidates.length > 0 && <span>후보 {candidates.filter(item => item.status === 'pending').length}개</span>}</summary>
    <header><p>전사에서 답변·현재 측정값·직접 표현을 찾습니다. 확인한 후보만 오늘 기록에 반영됩니다.</p>{(!job || stale || job.status === 'failed') && <button type="button" disabled={busy || disabled || !latest || !data.capabilities.ai} onClick={() => void generate()}>{busy ? '분석 시작 중…' : job ? '최신 전사 다시 분석' : '저장된 전사 분석'}</button>}</header>
    {!latest && <p>녹음을 전사하거나 전사 검토를 저장한 뒤 사용할 수 있습니다.</p>}
    {disabled && <p>편집 중인 오늘 답변을 먼저 저장해 주세요.</p>}
    {active && <p role="status">대화 근거를 분석하고 있습니다. 전사와 SOAP는 계속 확인할 수 있습니다.</p>}
    {stale && <p role="status">새 전사가 있어 이전 후보를 확인할 수 없습니다. 최신 전사로 다시 분석해 주세요.</p>}
    {job?.error && <p role="alert">{job.error}</p>}
    {error && <p role="alert">{error}</p>}
    {!stale && candidates.map(candidate => {
      const group = candidate.kind !== 'signal' ? QUESTION_GROUPS.find(group => group.key === candidate.item_key) : undefined;
      const label = candidate.kind === 'signal' ? signalLabels[candidate.category] : `${group?.title ?? candidate.item_key} · ${group?.subitems.find(item => item.key === candidate.subitem_key)?.label ?? candidate.subitem_key}`;
      const conflict = conflicts[candidate.id];
      const linkedNrs = Boolean(nrsTarget && matchesTranscriptNrsCandidate(candidate,{...nrsTarget,instrument:'NRS'}));
      return <article key={candidate.id} className={styles.candidate} aria-label={label}>
        <div className={styles.heading}><strong>{label}</strong><span>{candidate.role === 'guardian' ? '보호자 보고' : candidate.role === 'clinician' ? '의료진 측정' : '환자 발화'}{candidate.temporal === 'recent' ? ' · 최근 보고' : ''} · {candidate.status === 'confirmed' ? '확인 완료' : candidate.status === 'rejected' ? '제외' : '검토 필요'}</span></div>
        {candidate.kind === 'measurement' && <p className={styles.measurement}>{candidate.instrument === 'NRS' ? '현재 통증 NRS' : candidate.instrument === 'FREQUENCY' ? '현재 횟수' : '현재 불편 점수'} {candidate.manual_review?.value ?? candidate.value}{units[candidate.unit] ?? candidate.unit}</p>}
        {candidate.evidence.map((ref, i) => <blockquote key={i}>{ref.quote}</blockquote>)}
        {candidate.manual_review && <p>의료진 검토: {candidate.manual_review.text}</p>}
        {candidate.status === 'pending' && linkedNrs && <button type="button" aria-controls={nrsTarget?.inputId} onClick={() => { const input = nrsTarget ? document.getElementById(nrsTarget.inputId) : null; if (!(input instanceof HTMLInputElement)) return; input.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); input.focus({preventScroll:true}); }}>통증 NRS 입력으로 이동</button>}
        {candidate.status === 'pending' && !linkedNrs && <>
          <details><summary>후보 직접 수정</summary><label>검토할 내용<textarea aria-label={`${label} 후보 내용`} value={edits[candidate.id]?.text ?? candidate.text} onChange={event => setEdits(current => ({ ...current, [candidate.id]: { ...current[candidate.id], text: event.target.value } }))} /></label>{candidate.kind === 'measurement' && <label>검토 측정값<input type="number" aria-label={`${label} 후보 측정값`} min="0" max={candidate.instrument === 'FREQUENCY' ? undefined : '10'} step="1" value={edits[candidate.id]?.value ?? String(candidate.value)} onChange={event => setEdits(current => ({ ...current, [candidate.id]: { ...current[candidate.id], value: event.target.value } }))} /></label>}<p>수정 내용은 원래 인용 근거와 수기 출처를 함께 보존합니다.</p></details>
          {conflict && <div className={styles.conflict}><p>기존 의료진 기록: {conflict.current || '확인 상태가 저장되어 있습니다.'}</p><p>현재 기록을 보존하거나, 검토한 후보로 명시적으로 교체할 수 있습니다.</p><button type="button" disabled={busy || disabled} onClick={() => void review(candidate, 'confirm', true)}>현재 기록을 후보로 교체</button></div>}
          <div className={styles.actions}><button type="button" disabled={busy || disabled} onClick={() => void review(candidate, 'confirm')}>확인 후 반영</button><button type="button" disabled={busy || disabled} onClick={() => void review(candidate, 'reject')}>후보 제외</button></div>
        </>}
      </article>;
    })}
    {!stale && missing.length > 0 && <details><summary>아직 전사 답변이 없는 항목 {missing.length}개</summary><ul>{missing.map(field => <li key={`${field.item_key}:${field.subitem_key}`}>{field.question}</li>)}</ul></details>}
    {!active && !stale && job && candidates.length === 0 && !job.error && <p>확인 가능한 답변 후보가 없습니다. 미확인 항목을 직접 질문해 주세요.</p>}
  </details>;
}

export function TranscriptAnswerDraftBadge({ state, binding, edited = false }: { state: AppState; binding: TranscriptAnswerDraftBinding; edited?: boolean }) {
  const candidate = (state.jobs.find(job => job.id === binding.jobId)?.result?.candidates as AnalysisCandidate[] | undefined)?.find(candidate => candidate.id === binding.candidateId && candidate.kind === 'answer');
  if (!candidate) return null;
  return <div className={styles.draftBadge} role="note" aria-label="전사 기반 AI 초안"><strong>전사 기반 AI 초안 · 검토 전{edited ? ' · 의료진 편집' : ''}</strong><details><summary>원문 인용 근거</summary>{candidate.evidence.map((evidence,index) => <blockquote key={index}>{evidence.quote}</blockquote>)}</details></div>;
}
