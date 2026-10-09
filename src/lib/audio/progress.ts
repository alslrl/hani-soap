import type { RuntimeJob, RuntimeRecording } from '@/lib/types';

export const AUDIO_STEPS = ['녹음', '파일 저장', '전사', '화자·용어 정리', 'SOAP 작성', '검토 대기'] as const;
export type AudioWork = { id: string; recording?: RuntimeRecording; jobs: RuntimeJob[]; primary?: RuntimeJob; createdAt: string };
const audioJob = (job: RuntimeJob) => job.kind === 'transcription' || job.kind === 'soap';
const transcriptIds = (job: RuntimeJob) => ['transcriptId','reviewedTranscriptId','input_transcript_id','diarizedTranscriptId','contentTranscriptId'].flatMap(key=>typeof job.result?.[key] === 'string' ? [job.result[key] as string] : []);
const sorted = (jobs: RuntimeJob[]) => [...jobs].sort((a,b)=>a.created_at.localeCompare(b.created_at));

/** Bind progress and results to their recording; care/briefing jobs cannot become audio status. */
export function audioWorks(recordings: RuntimeRecording[], jobs: RuntimeJob[]): AudioWork[] {
  const works = new Map<string,AudioWork>(recordings.map(recording=>[recording.id,{id:recording.id,recording,jobs:[],createdAt:recording.created_at}]));
  const owners = new Map<string,string>();
  for(const job of jobs.filter(audioJob)) if(job.recording_id) for(const id of transcriptIds(job)) owners.set(id,job.recording_id);
  for(const job of sorted(jobs.filter(job=>audioJob(job) || job.kind === 'analysis' && job.result?.task === 'clinical_analysis'))) {
    const owner = job.recording_id || transcriptIds(job).map(id=>owners.get(id)).find(Boolean);
    if(!owner && !audioJob(job)) continue;
    const id=owner || `job:${job.id}`;
    let work=works.get(id);
    if(!work) { work={id,jobs:[],createdAt:job.created_at};works.set(id,work); }
    work.jobs.push(job);
    if(audioJob(job)) { work.primary=job; for(const transcriptId of transcriptIds(job)) owners.set(transcriptId,id); }
  }
  return [...works.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
const sourcesReady=(job?:RuntimeJob)=>Boolean(job && job.status!=='failed' && job.stage==='transcribing' && job.result?.contentTranscriptId && job.result?.diarizedTranscriptId);
export function workStep(work: AudioWork) {
  const job=work.primary;
  if(!job) return work.recording && ['uploaded','processing','completed','failed'].includes(work.recording.status) ? 2 : 1;
  const failedStage=(job.result?.failure as {stage?:string}|undefined)?.stage;
  if(job.status === 'failed' && !failedStage) return -1;
  const stage=job.status === 'failed' ? String(failedStage) : job.stage;
  if(stage === 'queued' && job.kind === 'soap') return 4;
  if(stage === 'queued' && job.result?.task === 'correction_recheck') return 3;
  if(sourcesReady(job)) return 3;
  if(stage === 'transcribing' || stage === 'queued') return 2;
  if(['alignment_review','speaker_roles','dictionary_correction','correction_review_needed'].includes(stage)) return 3;
  if(stage === 'soap_draft') return 4;
  if(['review_needed','stale_input'].includes(stage) || ['waiting_review','completed'].includes(job.status)) return 5;
  return job.kind === 'soap' ? 4 : 2;
}
export function workRunning(work: AudioWork) { return Boolean(work.primary && ['queued','running'].includes(work.primary.status)); }
export function workFailed(work: AudioWork) { return work.primary?.status === 'failed' || !work.primary && work.recording?.status === 'failed'; }
export function workTitle(work: AudioWork) {
  if(workFailed(work)) return '음성 처리 중단';
  if(!work.primary) return work.recording?.status === 'uploading' ? '음성 파일 저장 중' : '음성 저장 완료 · 전사 준비';
  if(work.primary.stage==='queued' && work.primary.kind==='soap') return 'SOAP 초안 작성 대기 중';
  if(work.primary.stage==='queued' && work.primary.result?.task==='correction_recheck') return '용어 재검사 대기 중';
  if(sourcesReady(work.primary)) return '전사 정리 준비 중';
  const titles: Record<string,string>={queued:'전사 작업 대기 중',transcribing:'대화를 글자로 변환 중',alignment_review:'전사 누락을 확인 중',speaker_roles:'누가 말했는지 정리 중',dictionary_correction:'진료 용어를 확인 중',correction_review_needed:'전사 용어 검토 대기',soap_draft:'SOAP 초안 작성 중',review_needed:'초안 생성 완료 · 검토 대기',stale_input:'입력 변경 · 다시 검토 필요'};
  return titles[work.primary.stage] || (work.primary.status === 'completed' ? '음성 처리 완료' : '작업 상태 확인 중');
}
export function workDescription(work: AudioWork) {
  if(workFailed(work)) return work.primary?.error || work.recording?.error || '이 녹음의 처리를 완료하지 못했습니다.';
  if(work.primary?.stage==='queued' && work.primary.kind==='soap') return '확인한 전사와 기록으로 SOAP 초안을 다시 작성할 준비를 하고 있어요.';
  if(work.primary?.stage==='queued' && work.primary.result?.task==='correction_recheck') return '저장된 전사의 용어 표기를 다시 검토할 준비를 하고 있어요.';
  if(sourcesReady(work.primary)) return '본문과 화자 구간 인식이 끝났어요. 저장된 두 전사를 대조할 준비를 하고 있어요.';
  const descriptions: Record<string,string>={queued:'파일은 저장됐어요. 전사 작업이 시작되기를 기다리고 있어요.',transcribing:'녹음한 대화의 내용과 화자 구간을 인식하고 있어요.',alignment_review:'두 전사를 대조하고 빠진 대화 구간이 없는지 확인하고 있어요.',speaker_roles:'대화 문맥을 보고 의료진·환자·보호자 역할을 구분하고 있어요.',dictionary_correction:'전사에서 한의학 용어의 표기를 검토하고 있어요.',correction_review_needed:'전사와 용어 제안을 확인해 주세요.',soap_draft:'대화와 확인된 시술·기록을 바탕으로 진료 기록 초안을 작성하고 있어요.',review_needed:'전사와 SOAP 초안을 확인해 주세요. 아직 의료진 승인 전이에요.',stale_input:'처리 중 입력이 바뀌었어요. 최신 내용을 검토하고 다시 생성해 주세요.'};
  return work.primary ? descriptions[work.primary.stage] || '해당 녹음의 작업 상태를 확인하고 있어요.' : '저장한 음성으로 전사를 시작할 수 있어요.';
}
export const durationLabel = (ms: number) => `${Math.floor(Math.max(0,ms)/60_000).toString().padStart(2,'0')}:${Math.floor(Math.max(0,ms)/1000%60).toString().padStart(2,'0')}`;
export function sourceLabel(work: AudioWork) {
  const date=new Date(work.createdAt);
  const stamp=Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}) : '저장된';
  return `${stamp} ${work.recording ? work.recording.source === 'upload' ? '음성 파일' : '녹음' : '전사'}${work.recording?.duration_ms != null ? ` · ${durationLabel(work.recording.duration_ms)}` : ''}`;
}
export function recordingForTranscript(recordings: RuntimeRecording[],jobs: RuntimeJob[],transcriptId: string | null | undefined) {
  return transcriptId ? audioWorks(recordings,jobs).find(work=>work.jobs.some(job=>transcriptIds(job).includes(transcriptId))) : undefined;
}
