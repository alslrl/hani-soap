'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Mic, Square, Upload, RotateCcw, Check, FileText, Download, ArrowRight } from 'lucide-react';
import { effectiveSpeaker, isSpeakerRole, speakerRoleLabels, withRawSpeakerGroups } from '@/lib/audio/speaker-roles';
import type { RuntimeJob, RuntimeRecording, Transcript, SpeakerRole } from '@/lib/types';
import { audioStore, closeRecoveredSession, commitLiveTurn, startRecording, stopRecording, startTranscriptionJob, uploadAudio } from '@/lib/audio/client';
import { listRecoveries, readRecovery, removeRecovery, type RecoveryMetadata } from '@/lib/audio/recovery';
import { applyAcceptedCorrections, type CorrectionSpan, type ValidatedCorrection } from '@/lib/ai/correction';
import styles from './AudioControls.module.css';

type Props = { visitId: string; onChanged?: () => void };
type JobsResponse = { jobs: RuntimeJob[]; recordings: RuntimeRecording[]; transcripts: Transcript[] };
const stageLabels: Record<string, string> = { queued: '작업 대기', transcribing: '화자 분리 전사 중', speaker_roles: '대화 문맥으로 화자 역할 추론 중', dictionary_correction: '사전 용어 검토 중', correction_review_needed: '용어 제안 검토 대기', soap_draft: 'SOAP 초안 생성 중', review_needed: '의료진 검토 대기', stale_input: '이전 전사로 생성한 결과 보관', failed: '처리 실패' };
const time = (milliseconds: number) => `${Math.floor(milliseconds / 60_000).toString().padStart(2, '0')}:${Math.floor(milliseconds / 1000 % 60).toString().padStart(2, '0')}`;
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data as T;
}

export function AudioControls({ visitId, onChanged }: Props) {
  const audio = useSyncExternalStore(audioStore.subscribe, audioStore.getSnapshot, audioStore.getServerSnapshot);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [data, setData] = useState<JobsResponse>({ jobs: [], recordings: [], transcripts: [] });
  const [recoveries, setRecoveries] = useState<RecoveryMetadata[]>([]);
  const [reference, setReference] = useState<{ label: string; notice: string; sections: Record<string, string> | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const callback = useRef(onChanged); callback.current = onChanged;
  const active = audio.status !== 'idle';
  const ownerHere = audio.visitId === visitId;
  const refresh = useCallback(async () => {
    try { setData(await api<JobsResponse>(`/api/jobs?visitId=${encodeURIComponent(visitId)}`)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '작업 상태 조회 실패'); }
  }, [visitId]);
  const recover = useCallback(() => { if (typeof indexedDB !== 'undefined') void listRecoveries().then(setRecoveries).catch(() => {}); }, []);
  useEffect(() => {
    let cancelled = false;
    void refresh(); recover();
    void api<{ configured: boolean }>('/api/audio/config').then((result) => { if (!cancelled) setConfigured(result.configured); }).catch(() => {});
    const enumerate = () => navigator.mediaDevices?.enumerateDevices().then((items) => { if (!cancelled) setDevices(items.filter((item) => item.kind === 'audioinput')); }).catch(() => {});
    void enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', enumerate);
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => { cancelled = true; clearInterval(interval); navigator.mediaDevices?.removeEventListener('devicechange', enumerate); };
  }, [visitId, refresh, recover]);
  const execute = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); callback.current?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '음성 처리를 완료하지 못했습니다.'); }
    finally { setBusy(false); recover(); }
  };
  const saveAndProcess = async (file: File | Blob, filename: string, ownedVisit = visitId, audioSessionId?: string, durationMs?: number, recoveryId?: string) => {
    const recordingId = await uploadAudio(file, { visitId: ownedVisit, filename, audioSessionId, durationMs });
    if (recoveryId) await removeRecovery(recoveryId).catch(() => {});
    // Save file even when model configuration is missing. A later retry uses this recording ID.
    await startTranscriptionJob(ownedVisit, recordingId);
  };
  const latestJob = [...data.jobs].reverse().find((job) => job.kind === 'transcription' && job.result?.transcriptId);
  const transcript = data.transcripts.find((item) => item.id === latestJob?.result?.transcriptId);
  const latestRevision = Math.max(0, ...data.transcripts.map((item) => item.revision));
  const pending = data.jobs.filter((job) => ['queued', 'running', 'failed'].includes(job.status));
  const retryableFiles = data.recordings.filter((recording) => ['uploaded', 'failed'].includes(recording.status) && !data.jobs.some((job) => job.recording_id === recording.id && ['queued', 'running'].includes(job.status)));

  return <section className={styles.root} aria-label="녹음과 음성 처리">
    <div className={styles.controls}>
      <select className={styles.select} aria-label="입력 마이크" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={active}>
        <option value="">기본 마이크</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `마이크 ${index + 1}`}</option>)}
      </select>
      {audio.status === 'recording' ? <button className={`${styles.button} ${styles.stop}`} disabled={busy} onClick={() => void execute(async () => {
        const result = await stopRecording();
        const filename = `consultation-${result.recoveryId}.${result.blob.type.includes('mp4') ? 'm4a' : 'webm'}`;
        await saveAndProcess(result.blob, filename, result.visitId, result.audioSessionId, result.durationMs, result.recoveryId);
      })}><Square size={13} fill="currentColor" /> 녹음 종료</button>
        : <button className={`${styles.button} ${styles.primary}`} disabled={active || busy} onClick={() => void execute(async () => { await startRecording(visitId, deviceId || undefined); })}><Mic size={15} /> {audio.status === 'starting' ? '마이크 연결 중' : audio.status === 'stopping' ? '녹음 저장 중' : '녹음 시작'}</button>}
      <button className={styles.button} disabled={busy || active} onClick={() => input.current?.click()}><Upload size={14} /> 음성 파일</button>
      <input ref={input} type="file" accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm" hidden onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void execute(() => saveAndProcess(file, file.name));
      }} />
      {active && <span className={styles.status}><span className={styles.dot} /> {time(audio.elapsed)} <span className={styles.meter}><span style={{ width: `${audio.level * 100}%` }} /></span></span>}
      {active && <span className={styles.status}>전체 녹음 {audio.status === 'recording' ? '진행 중' : '준비/저장 중'} · 실시간 {({ off: '꺼짐', connecting: '연결 중', connected: '연결됨', failed: '연결 실패' })[audio.liveStatus]}</span>}
      {audio.status === 'recording' && audio.liveStatus === 'connected' && <button className={styles.button} onClick={commitLiveTurn}>발화 확정</button>}
      {!active && !pending.length && <span className={styles.status}>PC 마이크 한 번으로 전체 녹음과 실시간 전사</span>}
    </div>
    {active && !ownerHere && <div className={styles.error}>다른 방문의 녹음이 진행 중입니다. 종료한 음성은 원래 방문에 저장됩니다.</div>}
    {active && <p className={styles.notice}>로컬 복구본: {({ ready: '준비 중', saved: '브라우저에 저장됨', failed: '저장 실패' })[audio.recoveryStatus]} · 아이패드는 별도로 녹음하지 않습니다.</p>}
    {configured === false && <p className={styles.notice}>AI가 아직 연결되지 않았습니다. 파일은 저장할 수 있고, 연결 후 전사할 수 있습니다. <Link href="/settings">연결 설정</Link></p>}
    {(error || (active && audio.error)) && <div role="alert" className={styles.error}>{error || audio.error}</div>}
    {ownerHere && (audio.liveText || audio.partialText) && <section className={styles.liveSection} aria-label="실시간 전사"><header><strong>실시간 전사</strong><span>발화 순서대로 표시됩니다.</span></header><div className={styles.live} aria-live="polite">{audio.liveText.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}{audio.partialText && <p className={styles.partial}><span>인식 중</span>{audio.partialText}</p>}</div></section>}
    {pending.map((job) => <div key={job.id} className={styles.job}><span className={styles.jobName}>{stageLabels[job.stage] || job.stage}</span><span>{job.status === 'failed' ? job.error : '실제 AI 작업'}</span></div>)}
    {data.jobs.filter((job) => job.stage === 'stale_input').map((job) => <p className={styles.notice} key={job.id}>생성 중 전사가 변경되어 이전 입력의 SOAP는 별도로 보관했습니다. 최신 전사를 검토한 뒤 다시 생성해 주세요.</p>)}
    {retryableFiles.map((recording) => <div key={recording.id} className={styles.job}><span className={`${styles.jobName} ${styles.filename}`}>{recording.filename}</span><button className={styles.button} disabled={busy} onClick={() => void execute(async () => { await startTranscriptionJob(visitId, recording.id); })}><RotateCcw size={12} /> 전사 실행</button></div>)}
    {recoveries.filter((item) => item.visitId === visitId && item.id !== (active ? audio.audioSessionId : null)).length > 0 && <details className={styles.details}><summary>브라우저에 남은 녹음 복구본</summary>{recoveries.filter((item) => item.visitId === visitId).map((item) => <div className={styles.job} key={item.id}><span className={styles.jobName}>{new Date(item.createdAt).toLocaleString('ko-KR')}</span><button className={styles.button} disabled={busy || active} onClick={() => void execute(async () => { const recovery = await readRecovery(item.id); if (recovery.audioSessionId) await closeRecoveredSession(recovery.visitId, recovery.audioSessionId); await saveAndProcess(recovery.blob, recovery.filename, recovery.visitId, recovery.audioSessionId, undefined, recovery.id); })}><Upload size={12} /> 복구 후 처리</button><button className={styles.button} onClick={() => void execute(async () => { const recovery = await readRecovery(item.id); const url = URL.createObjectURL(recovery.blob); const a = document.createElement('a'); a.href = url; a.download = recovery.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}><Download size={12} /> 다운로드</button></div>)}</details>}
    {latestJob && transcript && <TranscriptReview key={`${latestJob.id}:${latestJob.result?.reviewedTranscriptId || 'raw'}`} job={latestJob} transcript={transcript} reviewedTranscript={data.transcripts.find((item) => item.id === latestJob.result?.reviewedTranscriptId)} latestRevision={latestRevision} recheckEnabled={configured === true && !active && !data.jobs.some(item => ['queued', 'running'].includes(item.status))} onSaved={() => { void refresh(); callback.current?.(); }} />}
    <details className={styles.details} onToggle={(event) => {
      if (event.currentTarget.open && !reference) void api<typeof reference>(`/api/jobs/reference?visitId=${encodeURIComponent(visitId)}`).then(setReference).catch((failure: Error) => setError(failure.message));
    }}><summary>초진 사례 검수 자료 미리보기 · 읽기 전용</summary>{reference && <><p className={styles.notice}>{reference.notice}</p><div className={styles.preview}>{Object.entries(reference.sections || {}).map(([key, value]) => <span key={key} style={{ display: 'contents' }}><strong>{key.toUpperCase()}</strong><span>{value}</span></span>)}</div></>}</details>
  </section>;
}

export function TranscriptReview({ job, transcript, reviewedTranscript, latestRevision, recheckEnabled = false, onSaved }: { job: RuntimeJob; transcript: Transcript; reviewedTranscript?: Transcript; latestRevision: number; recheckEnabled?: boolean; onSaved: () => void }) {
  const candidates = (job.result?.corrections || []) as ValidatedCorrection[];
  const retrieved = (job.result?.correction_spans || []) as CorrectionSpan[];
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [manualText, setManualText] = useState<string | null>(reviewedTranscript?.text ?? null);
  const roleTranscript = withRawSpeakerGroups(reviewedTranscript ?? transcript, (job.result?.rawSpeakers ?? {}) as Record<string, string>, transcript);
  const [speakers, setSpeakers] = useState<Record<string, SpeakerRole | null>>({});
  const [speakerGroups, setSpeakerGroups] = useState<Record<string, SpeakerRole>>({});
  const groupNames = [...new Set(roleTranscript.segments.flatMap(segment => segment.raw_speaker ? [segment.raw_speaker] : []))];
  const currentRoles = { ...roleTranscript.speaker_roles, ...Object.fromEntries(Object.entries(speakerGroups).map(([group, role]) => [group, { role, source: 'human' as const }])) };
  const currentRole = (segment: Transcript['segments'][number]) => {
    const change = speakers[segment.id];
    return change === null ? effectiveSpeaker({ ...segment, speaker_override: undefined }, currentRoles) : change ?? effectiveSpeaker(segment, currentRoles);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<'terms' | 'speakers' | 'text'>(() => candidates.length ? 'terms' : transcript.segments.length ? 'speakers' : 'text');
  const effectiveCorrections = candidates.map((candidate): ValidatedCorrection => {
    const selected = retrieved.find(span => span.id === candidate.span_id)?.candidates.find(term => term.id === selections[candidate.span_id]);
    return { ...candidate, ...(selected ? { decision: 'suggest' as const, candidate_id: selected.id, candidate: selected, replacement: selected.matched_form ?? selected.term } : {}), review_status: decisions[candidate.span_id] || (selections[candidate.span_id] !== undefined ? 'pending' : candidate.review_status) };
  });
  const corrected = applyAcceptedCorrections(transcript.text, effectiveCorrections);
  const edited = Object.keys(decisions).length > 0 || Object.keys(selections).length > 0 || (manualText !== null && manualText !== (reviewedTranscript?.text ?? corrected)) || Object.keys(speakers).length > 0 || Object.keys(speakerGroups).length > 0;
  const recheck = async () => {
    setBusy(true); setError(null);
    try { await api('/api/jobs', { visitId: transcript.visit_id, transcriptId: reviewedTranscript?.id ?? transcript.id, kind: 'correction' }); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '용어 재검사 실패'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const result = await api<{ transcriptId: string }>('/api/jobs/review', { jobId: job.id, decisions: effectiveCorrections.map(item => ({ span_id: item.span_id, status: item.review_status === 'accepted' ? 'accepted' : 'rejected', ...(item.review_status === 'accepted' && selections[item.span_id] ? { candidate_id: selections[item.span_id] } : {}) })), ...(manualText !== null ? { manualText } : {}), speakers, speakerGroups, expectedTranscriptRevision: latestRevision });
      await api('/api/jobs', { visitId: transcript.visit_id, transcriptId: result.transcriptId, kind: 'soap' });
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '전사 검토 저장 실패'); }
    finally { setBusy(false); }
  };
  const acceptedCount = effectiveCorrections.filter(item => item.review_status === 'accepted').length;
  const pendingCount = effectiveCorrections.filter(item => item.review_status === 'pending').length;
  return <details className={`${styles.details} ${styles.reviewDisclosure}`}>
    <summary><FileText size={15} /> <span>전사 원문과 용어 제안 검토</span><span className={styles.summaryCount}>{candidates.length ? `용어 ${candidates.length}건` : '전사 확인'}</span></summary>
    <div className={styles.review}>
      <header className={styles.reviewHeader}>
        <div><h2>전사 검토</h2><p>원문을 확인하고 용어와 화자 역할을 검토해 주세요.</p></div>
        <button className={styles.button} disabled={busy || edited || !recheckEnabled} onClick={() => void recheck()}><RotateCcw size={14} /> 저장된 전사로 용어 다시 검사</button>
      </header>
      {edited && <p className={styles.notice}>편집·선택한 내용을 먼저 저장한 뒤 용어를 다시 검사해 주세요.</p>}
      {typeof job.result?.speaker_role_note === 'string' && <p className={styles.notice}>{job.result.speaker_role_note}</p>}
      {typeof job.result?.correction_note === 'string' && <p className={styles.notice}>{job.result.correction_note}</p>}
      {Array.isArray(job.result?.warnings) && job.result.warnings.map((warning, index) => <p key={index} className={styles.reviewWarning}>검토할 내용: {String(warning)}</p>)}
      <div className={styles.reviewTabs} role="group" aria-label="전사 검토 단계">
        <button type="button" aria-pressed={reviewTab === 'terms'} onClick={() => setReviewTab('terms')}>용어 검토 <span>{candidates.length}</span></button>
        <button type="button" aria-pressed={reviewTab === 'speakers'} onClick={() => setReviewTab('speakers')}>화자 확인 <span>{transcript.segments.length}</span></button>
        <button type="button" aria-pressed={reviewTab === 'text'} onClick={() => setReviewTab('text')}>전사 편집</button>
      </div>
      {reviewTab === 'terms' && <section className={styles.reviewPanel} aria-label="용어 검토">
        <div className={styles.panelIntro}><p>수락한 후보만 검토 전사에 반영됩니다.</p><span>수락 {acceptedCount} · 검토 필요 {pendingCount}</span></div>
        {candidates.length ? <div className={styles.corrections}>{candidates.map((candidate, index) => {
          const options = retrieved.find(span => span.id === candidate.span_id)?.candidates ?? (candidate.candidate ? [candidate.candidate] : []);
          const chosen = options.find(term => term.id === (selections[candidate.span_id] ?? candidate.candidate_id));
          const form = chosen?.matched_form ?? chosen?.term;
          const status = effectiveCorrections[index].review_status;
          const manuallyEdited = manualText !== null && manualText !== corrected;
          return <article key={candidate.span_id} className={styles.correction}>
            <header className={styles.correctionHeader}><div><span className={styles.originalTerm}>{candidate.original}</span>{form && <><ArrowRight size={15} /><strong>{form}</strong>{chosen?.hanja && <small>{chosen.hanja}</small>}</>}</div><span className={styles.decisionState}>{status === 'accepted' ? '수락' : status === 'rejected' ? '원문 유지' : '검토 필요'}</span></header>
            <p className={styles.correctionReason}>{candidate.reason}</p>
            <div className={styles.correctionActions}>
              {options.length > 0 && <label>사전 후보<select className={styles.select} aria-label={`사전 후보 ${candidate.original}`} value={selections[candidate.span_id] ?? candidate.candidate_id ?? ''} disabled={manuallyEdited} onChange={event => { const value = event.target.value; setSelections(current => ({ ...current, [candidate.span_id]: value })); setDecisions(current => { const next = { ...current }; delete next[candidate.span_id]; return next; }); setManualText(null); }}><option value="">선택하지 않음</option>{options.map(term => <option key={term.id} value={term.id}>{term.matched_form ?? term.term}{term.hanja ? ` · ${term.hanja}` : ''}</option>)}</select></label>}
              <div className={styles.controls}>{chosen && <button className={`${styles.button} ${status === 'accepted' ? styles.selected : ''}`} aria-pressed={status === 'accepted'} disabled={manuallyEdited} onClick={() => { setDecisions(current => ({ ...current, [candidate.span_id]: 'accepted' })); setManualText(null); }}>선택 후보 수락</button>}<button className={`${styles.button} ${status === 'rejected' ? styles.selected : ''}`} aria-pressed={status === 'rejected'} disabled={manuallyEdited} onClick={() => { setDecisions(current => ({ ...current, [candidate.span_id]: 'rejected' })); setManualText(null); }}>원문 유지</button></div>
            </div>
            {chosen && <details className={styles.source}><summary>사전 명칭·출처 확인</summary><strong>{chosen.term}</strong>{chosen.sources.map((source, sourceIndex) => <p key={sourceIndex}>{source.title} · {source.original}</p>)}</details>}
          </article>;
        })}</div> : <p className={styles.empty}>검토할 용어 제안이 없습니다. 화자와 전사 내용을 확인해 주세요.</p>}
      </section>}
      {reviewTab === 'speakers' && <section className={styles.reviewPanel} aria-label="화자 확인">
        <div className={styles.panelIntro}><p>전체 대화로 역할을 추론했습니다. 그룹 역할을 바꾸면 해당 발화 전체에 반영됩니다. 개별 수정은 그룹을 다시 바꿔도 유지되며, 그룹 역할로 되돌릴 수 있습니다.</p></div>
        <div className={styles.speakerGroups}>{groupNames.map(group => <label key={group}>화자 {group}<select className={styles.select} aria-label={`화자 ${group} 그룹 역할`} value={currentRoles[group]?.role ?? 'unknown'} onChange={event => { if (isSpeakerRole(event.target.value)) setSpeakerGroups(current => ({ ...current, [group]: event.target.value as SpeakerRole })); }}>{Object.entries(speakerRoleLabels).map(([role, label]) => <option key={role} value={role}>{label} · {group}</option>)}</select></label>)}</div>
        <div className={styles.speakerList}>{roleTranscript.segments.length ? roleTranscript.segments.map((segment, index) => <article className={styles.speaker} key={segment.id}>
          <header><div><strong>{speakerRoleLabels[currentRole(segment)]}{segment.raw_speaker ? ` · ${segment.raw_speaker}` : ''}</strong><span>구간 {String(index + 1).padStart(2, '0')}</span>{segment.start_ms !== null && <time>{time(segment.start_ms)}</time>}</div><select className={styles.select} aria-label={`구간 ${index + 1} 화자 역할`} value={currentRole(segment)} onChange={(event) => setSpeakers((current) => ({ ...current, [segment.id]: event.target.value as SpeakerRole }))}><option value="unknown">역할 미확인</option><option value="clinician">의료진</option><option value="patient">환자</option><option value="guardian">보호자</option></select>{(speakers[segment.id] !== null && (speakers[segment.id] !== undefined || segment.speaker_override !== undefined)) && <button type="button" className={styles.button} onClick={() => setSpeakers(current => ({ ...current, [segment.id]: null }))}>그룹 역할로 되돌리기</button>}</header>
          <p>{segment.text}</p>
        </article>) : <p className={styles.empty}>화자별 구간이 없는 전사입니다. 전사 편집에서 전체 내용을 확인해 주세요.</p>}</div>
      </section>}
      {reviewTab === 'text' && <section className={styles.reviewPanel} aria-label="전사 편집"><div className={styles.panelIntro}><p>수락한 용어가 반영된 내용입니다. 필요한 부분을 직접 수정할 수 있습니다.</p></div><label className={styles.editorLabel}>검토 전사<textarea className={styles.text} aria-label="검토 전사" value={manualText ?? corrected} onChange={(event) => setManualText(event.target.value)} /></label></section>}
      <details className={styles.original}><summary>보존된 전사 원문</summary><div>{transcript.text.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></details>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <footer className={styles.reviewFooter}><p>{job.result?.reviewedTranscriptId ? '저장하면 새 검토 버전을 추가합니다.' : '전사 원문은 보존되며, 검토 결과를 새 버전으로 저장합니다.'}</p><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => void save()}><Check size={14} /> {busy ? '저장과 생성 중' : '전사 검토 저장 · SOAP 다시 생성'}</button></footer>
    </div>
  </details>;
}

export default AudioControls;

export function ActiveRecordingBanner() {
  const audio = useSyncExternalStore(audioStore.subscribe, audioStore.getSnapshot, audioStore.getServerSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (audio.status === 'idle') return null;
  const finish = async () => {
    setBusy(true); setError(null);
    try {
      const result = await stopRecording();
      const recordingId = await uploadAudio(result.blob, { visitId: result.visitId, audioSessionId: result.audioSessionId, durationMs: result.durationMs, filename: `consultation-${result.recoveryId}.${result.blob.type.includes('mp4') ? 'm4a' : 'webm'}` });
      await removeRecovery(result.recoveryId).catch(() => {});
      await startTranscriptionJob(result.visitId, recordingId);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '녹음 저장 실패'); }
    finally { setBusy(false); }
  };
  return <div className={styles.root} role="status"><div className={styles.controls}><span className={styles.dot} /><strong>PC 녹음 진행 중 · {time(audio.elapsed)}</strong><Link href={`/clinic/visits/${audio.visitId}`} className={styles.button}>녹음 중인 진료로 이동</Link><button className={`${styles.button} ${styles.stop}`} disabled={busy || audio.status !== 'recording'} onClick={() => void finish()}><Square size={12} /> {busy ? '녹음 저장 중' : '종료 후 저장'}</button></div>{error && <div className={styles.error}>{error}</div>}</div>;
}
