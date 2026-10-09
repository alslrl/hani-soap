'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Mic, Square, Upload, RotateCcw, Check, FileText, Download } from 'lucide-react';
import type { RuntimeJob, RuntimeRecording, Transcript } from '@/lib/types';
import { audioStore, closeRecoveredSession, commitLiveTurn, startRecording, stopRecording, startTranscriptionJob, uploadAudio } from '@/lib/audio/client';
import { listRecoveries, readRecovery, removeRecovery, type RecoveryMetadata } from '@/lib/audio/recovery';
import { applyAcceptedCorrections, type ValidatedCorrection } from '@/lib/ai/correction';
import styles from './AudioControls.module.css';

type Props = { visitId: string; onChanged?: () => void };
type JobsResponse = { jobs: RuntimeJob[]; recordings: RuntimeRecording[]; transcripts: Transcript[] };
const stageLabels: Record<string, string> = { queued: '작업 대기', transcribing: '화자 분리 전사 중', dictionary_correction: '사전 용어 검토 중', soap_draft: 'SOAP 초안 생성 중', review_needed: '의료진 검토 대기', stale_input: '이전 전사로 생성한 결과 보관', failed: '처리 실패' };
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
    {ownerHere && (audio.liveText || audio.partialText) && <div className={styles.live} aria-live="polite">{audio.liveText}{audio.partialText && <span className={styles.partial}>{'\n'}{audio.partialText}</span>}</div>}
    {pending.map((job) => <div key={job.id} className={styles.job}><span className={styles.jobName}>{stageLabels[job.stage] || job.stage}</span><span>{job.status === 'failed' ? job.error : '실제 AI 작업'}</span></div>)}
    {data.jobs.filter((job) => job.stage === 'stale_input').map((job) => <p className={styles.notice} key={job.id}>생성 중 전사가 변경되어 이전 입력의 SOAP는 별도로 보관했습니다. 최신 전사를 검토한 뒤 다시 생성해 주세요.</p>)}
    {retryableFiles.map((recording) => <div key={recording.id} className={styles.job}><span className={`${styles.jobName} ${styles.filename}`}>{recording.filename}</span><button className={styles.button} disabled={busy} onClick={() => void execute(async () => { await startTranscriptionJob(visitId, recording.id); })}><RotateCcw size={12} /> 전사 실행</button></div>)}
    {recoveries.filter((item) => item.visitId === visitId && item.id !== (active ? audio.audioSessionId : null)).length > 0 && <details className={styles.details}><summary>브라우저에 남은 녹음 복구본</summary>{recoveries.filter((item) => item.visitId === visitId).map((item) => <div className={styles.job} key={item.id}><span className={styles.jobName}>{new Date(item.createdAt).toLocaleString('ko-KR')}</span><button className={styles.button} disabled={busy || active} onClick={() => void execute(async () => { const recovery = await readRecovery(item.id); if (recovery.audioSessionId) await closeRecoveredSession(recovery.visitId, recovery.audioSessionId); await saveAndProcess(recovery.blob, recovery.filename, recovery.visitId, recovery.audioSessionId, undefined, recovery.id); })}><Upload size={12} /> 복구 후 처리</button><button className={styles.button} onClick={() => void execute(async () => { const recovery = await readRecovery(item.id); const url = URL.createObjectURL(recovery.blob); const a = document.createElement('a'); a.href = url; a.download = recovery.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}><Download size={12} /> 다운로드</button></div>)}</details>}
    {latestJob && transcript && <TranscriptReview key={`${latestJob.id}:${latestJob.result?.reviewedTranscriptId || 'raw'}`} job={latestJob} transcript={transcript} reviewedTranscript={data.transcripts.find((item) => item.id === latestJob.result?.reviewedTranscriptId)} latestRevision={latestRevision} onSaved={() => { void refresh(); callback.current?.(); }} />}
    <details className={styles.details} onToggle={(event) => {
      if (event.currentTarget.open && !reference) void api<typeof reference>(`/api/jobs/reference?visitId=${encodeURIComponent(visitId)}`).then(setReference).catch((failure: Error) => setError(failure.message));
    }}><summary>초진 사례 검수 자료 미리보기 · 읽기 전용</summary>{reference && <><p className={styles.notice}>{reference.notice}</p><div className={styles.preview}>{Object.entries(reference.sections || {}).map(([key, value]) => <span key={key} style={{ display: 'contents' }}><strong>{key.toUpperCase()}</strong><span>{value}</span></span>)}</div></>}</details>
  </section>;
}

export function TranscriptReview({ job, transcript, reviewedTranscript, latestRevision, onSaved }: { job: RuntimeJob; transcript: Transcript; reviewedTranscript?: Transcript; latestRevision: number; onSaved: () => void }) {
  const candidates = (job.result?.corrections || []) as ValidatedCorrection[];
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [manualText, setManualText] = useState<string | null>(reviewedTranscript?.text ?? null);
  const [speakers, setSpeakers] = useState<Record<string, string>>(() => reviewedTranscript?.segments.length === transcript.segments.length ? Object.fromEntries(transcript.segments.map((segment, index) => [segment.id, reviewedTranscript.segments[index].speaker])) : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const corrected = applyAcceptedCorrections(transcript.text, candidates.map((candidate) => ({ ...candidate, review_status: decisions[candidate.span_id] || candidate.review_status })));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const result = await api<{ transcriptId: string }>('/api/jobs/review', { jobId: job.id, decisions: Object.entries(decisions).map(([span_id, status]) => ({ span_id, status })), ...(manualText !== null ? { manualText } : {}), speakers, expectedTranscriptRevision: latestRevision });
      await api('/api/jobs', { visitId: transcript.visit_id, transcriptId: result.transcriptId, kind: 'soap' });
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '전사 검토 저장 실패'); }
    finally { setBusy(false); }
  };
  return <details className={styles.details}><summary><FileText size={12} style={{ display: 'inline', marginRight: 5 }} /> 전사 원문과 용어 제안 검토</summary><div className={styles.review}>
    <p className={styles.notice}>전사 원문을 보존합니다. 용어 후보는 개별 수락 후 새 전사 버전에 반영하며, 화자 A/B는 의료진·환자 역할을 자동 확정하지 않습니다.</p>
    {Array.isArray(job.result?.warnings) && job.result.warnings.map((warning, index) => <p key={index} className={styles.notice}>검토할 내용: {String(warning)}</p>)}
    <details><summary>보존된 전사 원문</summary><p className={styles.notice} style={{ whiteSpace: 'pre-wrap' }}>{transcript.text}</p></details>
    {candidates.map((candidate) => <div key={candidate.span_id} className={styles.correction}><strong>{candidate.original}</strong>{candidate.replacement && <> → <strong>{candidate.replacement}</strong> {candidate.candidate?.hanja}</>}<p>{candidate.reason}</p>{candidate.candidate && <p className={styles.notice}>사전 근거: {candidate.candidate.sources.map((source) => `${source.title} · ${source.original}`).join(' / ')}</p>}<div className={styles.controls}>{candidate.decision === 'suggest' && <button className={`${styles.button} ${decisions[candidate.span_id] === 'accepted' ? styles.selected : ''}`} disabled={manualText !== null && manualText !== corrected} onClick={() => { setDecisions((current) => ({ ...current, [candidate.span_id]: 'accepted' })); setManualText(null); }}>후보 수락</button>}<button className={`${styles.button} ${decisions[candidate.span_id] === 'rejected' ? styles.selected : ''}`} disabled={manualText !== null && manualText !== corrected} onClick={() => { setDecisions((current) => ({ ...current, [candidate.span_id]: 'rejected' })); setManualText(null); }}>원문 유지</button></div></div>)}
    {transcript.segments.map((segment, index) => <div className={styles.speaker} key={segment.id}><span>구간 {index + 1}</span><select className={styles.select} aria-label={`구간 ${index + 1} 화자 역할`} value={speakers[segment.id] || segment.speaker} onChange={(event) => setSpeakers((current) => ({ ...current, [segment.id]: event.target.value }))}><option value="unknown">역할 미확인</option><option value="clinician">의료진</option><option value="patient">환자</option><option value="guardian">보호자</option></select><p>{segment.text}</p></div>)}
    <label>검토 전사<textarea className={styles.text} value={manualText ?? corrected} onChange={(event) => setManualText(event.target.value)} /></label>
    {job.result?.reviewedTranscriptId ? <p className={styles.notice}>검토 버전이 저장되어 있습니다. 다시 저장하면 새 버전을 추가합니다.</p> : null}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <div><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => void save()}><Check size={13} /> {busy ? '저장과 생성 중' : '전사 검토 저장 · SOAP 다시 생성'}</button></div>
  </div></details>;
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
