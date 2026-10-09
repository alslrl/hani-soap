'use client';
import { Check, LoaderCircle, Circle, TriangleAlert, RotateCcw } from 'lucide-react';
import { Disclosure } from '@/components/ui/Disclosure';
import { AUDIO_STEPS,durationLabel,sourceLabel,workDescription,workFailed,workRunning,workStep,workTitle,type AudioWork } from '@/lib/audio/progress';
import type { AudioSnapshot } from '@/lib/audio/client';
import styles from './AudioControls.module.css';
export type LocalAudioWork={phase:'saving'|'starting_ai'|'failed';startedAt:number;finishedAt?:number;durationMs?:number;recordingId?:string;error?:string};
export function AudioProgress({work,local,audio,now,busy,onRetry,onNewRecording,onPickFile}:{work?:AudioWork;local?:LocalAudioWork|null;audio?:AudioSnapshot;now:number;busy:boolean;onRetry:(id:string)=>void;onNewRecording?:()=>void;onPickFile?:()=>void}) {
 const recording=audio && audio.status!=='idle';
 const failure=!recording && (local?.phase==='failed' || work && workFailed(work));
 const step=recording ? 0 : local ? local.phase==='starting_ai' || local.recordingId ? 2 : 1 : work ? workStep(work) : 0;
 const running=recording || local && local.phase!=='failed' || work && workRunning(work);
 const title=recording ? audio.status==='starting' ? '마이크 연결 중' : audio.status==='stopping' ? '녹음을 마무리하는 중' : '녹음 중' : local ? local.phase==='failed' ? '음성 처리 중단' : local.phase==='starting_ai' ? '음성 저장 완료 · 전사 시작 중' : '음성 파일 저장 중' : work ? workTitle(work) : '';
 const detail=recording ? '전체 음성을 녹음하고 있어요. 종료하면 최종 전사와 진료 기록 정리를 시작해요.' : local ? local.error || (local.phase==='starting_ai' ? '파일을 저장했어요. 최종 전사 작업을 시작하고 있어요.' : '녹음한 음성을 안전하게 저장하고 있어요.') : work ? workDescription(work) : '';
 const started=local?.startedAt ?? (work?.primary ? Date.parse(work.primary.created_at) : null);
 const ended=work?.primary && !workRunning(work) ? Date.parse(work.primary.updated_at) : now;
 const elapsed=started && Number.isFinite(started) ? durationLabel((local?.finishedAt ?? ended)-started) : null;
 const failureInfo=work?.primary?.result?.failure as {code?:string;retryable?:boolean}|undefined;
 const noSpeech=failureInfo?.code==='TRANSCRIPTION_EMPTY';
 const retryId=local?.recordingId || work?.recording?.id;
 return <section className={styles.processing} aria-label="현재 음성 처리" data-processing-state={failure?'failed':running?'running':'review'}>
  <header className={styles.processingHeader}><div><span className={styles.processingEyebrow}>{recording ? '현재 녹음' : work ? sourceLabel(work) : `방금 녹음${local?.durationMs != null ? ` · ${durationLabel(local.durationMs)}`:''}`}</span><h2>{recording ? <span className={styles.dot}/> : failure ? <TriangleAlert size={17}/> : running ? <LoaderCircle className={styles.spinner} size={17}/> : <Check size={17}/>} {title}</h2></div><span className={styles.processingTime}>{recording ? durationLabel(audio.elapsed) : elapsed ? `처리 시간 ${elapsed}` : ''}</span></header>
  <p className={styles.processingDescription} role="status" aria-live="polite">{detail}</p>
  <ol className={styles.processingSteps} aria-label="음성 처리 단계">{AUDIO_STEPS.map((label,index)=>{
   const state=(step<0 ? index<2 : index<step)?'done':index===step?failure?'failed':running?'current':'ready':'waiting';
   return <li key={label} data-step-state={state} aria-current={state==='current'?'step':undefined}>{state==='done'?<Check size={13}/>:state==='current'?<LoaderCircle className={styles.spinner} size={13}/>:state==='failed'?<TriangleAlert size={13}/>:<Circle size={10}/>}<span>{label}</span></li>;
  })}</ol>
  {recording && <div className={styles.liveState}><strong>실시간 전사</strong><span>{({off:'꺼짐',connecting:'연결 중',connected:audio.liveText||audio.partialText?'대화를 실시간으로 표시 중':'연결됨 · 발화를 기다리는 중',failed:'연결 중단 · 전체 녹음은 계속 중'})[audio.liveStatus]}</span><span>브라우저 복구본 {audio.recoveryStatus==='saved'?'저장됨':audio.recoveryStatus==='failed'?'저장 실패':'준비 중'}</span></div>}
  {!recording && !local && work?.primary?.stage==='transcribing' && <div className={styles.transcriptionParts}><span>{work.primary.result?.contentTranscriptId?'✓ 본문 인식 완료':'● 본문 인식 중'}</span><span>{work.primary.result?.diarizedTranscriptId?'✓ 화자 구간 구분 완료':'● 화자 구간 구분 중'}</span></div>}
  {!recording && !local && work?.primary && work.jobs.some(job=>job.kind==='analysis' && job.result?.task==='clinical_analysis') && <p className={styles.processingExtra}>재진 답변 후보: {work.jobs.filter(job=>job.kind==='analysis'&&job.result?.task==='clinical_analysis').at(-1)?.status==='failed'?'분석 중단 · 재진 질문에서 다시 확인':work.jobs.filter(job=>job.kind==='analysis'&&job.result?.task==='clinical_analysis').some(job=>['queued','running'].includes(job.status))?'분석 중':'재진 질문에서 검토할 수 있어요'}</p>}
  {failure && <div className={styles.processingActions}>{noSpeech && onNewRecording ? <button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={onNewRecording}>다시 녹음</button> : retryId && failureInfo?.retryable!==false ? <button className={styles.button} disabled={busy} onClick={()=>onRetry(retryId)}><RotateCcw size={13}/>이 음성으로 다시 전사</button> : onPickFile && <button className={styles.button} disabled={busy} onClick={onPickFile}>다시 파일 선택</button>}<span>{noSpeech?'이번 음성에서는 사용할 최종 전사와 SOAP가 생성되지 않았어요.':'저장된 이전 전사·승인 기록은 유지됩니다.'}</span></div>}
  {!recording && !failure && !local && work?.recording?.status==='uploaded' && !work.primary && <button className={styles.button} disabled={busy} onClick={()=>onRetry(work.recording!.id)}>저장된 음성 전사 시작</button>}
  {!recording && work && <Disclosure className={styles.processingDetails}><summary>처리 상세</summary>{work.recording && <p>파일: {work.recording.filename}</p>}{work.jobs.filter(job=>job.kind!=='analysis').map(job=><p key={job.id}>{job.kind==='soap'?'SOAP 다시 생성':'최종 전사'} · {job.status==='failed'?'중단':job.status==='running'?'진행 중':job.status==='queued'?'대기':job.status==='waiting_review'?'검토 대기':'완료'}{job.status==='failed' && <span> · {job.error}</span>}</p>)}</Disclosure>}
 </section>;
}
