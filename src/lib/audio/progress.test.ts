import { describe,expect,it } from 'vitest';
import { audioWorks,recordingForTranscript,workStep,workTitle } from './progress';
import type { RuntimeJob,RuntimeRecording } from '@/lib/types';
const file=(id:string,at:string):RuntimeRecording=>({id,clinic_id:'clinic',visit_id:'visit',source:'microphone',filename:`audio-${id}.webm`,mime_type:'audio/webm',size_bytes:100,object_path:'private',created_at:at,status:'processing',duration_ms:3000});
const job=(id:string,recording:string|null,at:string,extra:Partial<RuntimeJob>={}):RuntimeJob=>({id,clinic_id:'clinic',visit_id:'visit',recording_id:recording,kind:'transcription',status:'running',stage:'transcribing',created_at:at,updated_at:at,input_hash:id,...extra});
describe('recording-scoped audio progress',()=>{
 it('keeps old failures separate from the latest recording and never chooses unrelated analysis/care',()=>{
  const files=[file('old','2026-10-09T01:00:00Z'),file('new','2026-10-09T02:00:00Z')];
  const works=audioWorks(files,[job('failed','old',files[0].created_at,{status:'failed',stage:'failed'}),job('new-job','new',files[1].created_at),job('care',null,'2026-10-09T03:00:00Z',{kind:'care'}),job('briefing',null,'2026-10-09T04:00:00Z',{kind:'analysis'})]);
  expect(works.map(w=>w.id)).toEqual(['new','old']);expect(works[0].primary!.id).toBe('new-job');expect(workTitle(works[0])).toBe('대화를 글자로 변환 중');expect(workTitle(works[1])).toBe('음성 처리 중단');
 });
 it('binds reviewed transcript regeneration and clinical analysis to the same source without changing the primary state',()=>{
  const files=[file('one','2026-10-09T01:00:00Z')];
  const jobs=[job('source','one',files[0].created_at,{status:'waiting_review',stage:'review_needed',result:{transcriptId:'raw',reviewedTranscriptId:'reviewed'}}),job('soap',null,'2026-10-09T02:00:00Z',{kind:'soap',stage:'soap_draft',result:{transcriptId:'reviewed'}}),job('analysis',null,'2026-10-09T03:00:00Z',{kind:'analysis',result:{task:'clinical_analysis',transcriptId:'reviewed'}})];
  const works=audioWorks(files,jobs);expect(works).toHaveLength(1);expect(works[0].primary!.id).toBe('soap');expect(workStep(works[0])).toBe(4);expect(recordingForTranscript(files,jobs,'reviewed')?.recording?.id).toBe('one');
 });
 it('does not expose an older success as the result of a new failed attempt and preserves correction review state',()=>{
  const files=[file('one','2026-10-09T01:00:00Z')];
  const jobs=[job('success','one',files[0].created_at,{status:'waiting_review',stage:'review_needed',result:{transcriptId:'raw'}}),job('failure','one','2026-10-09T02:00:00Z',{status:'failed',stage:'failed',result:{failure:{code:'TRANSCRIPTION_EMPTY',stage:'transcribing'}}})];
  const work=audioWorks(files,jobs)[0];expect(work.primary!.result?.transcriptId).toBeUndefined();expect(workStep(work)).toBe(2);
  work.primary=job('correction',null,'now',{stage:'correction_review_needed',status:'waiting_review'});expect(workStep(work)).toBe(3);
 });
});
