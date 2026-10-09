import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readState,updateState } from './store';
import { AppError } from './errors';
import { encodeAudioFailure } from '@/lib/audio/processing-error';
import { failJob } from '@/lib/ai/pipeline';

test('empty-speech failure persists a safe cause/phase without new transcripts or changes to prior SOAP',async()=>{
 const previous={...process.env};const directory=await mkdtemp(path.join(tmpdir(),'hani-audio-failure-'));
 Object.assign(process.env,{NODE_ENV:'test',HANI_DATA_DIR:directory,HANI_STORAGE_MODE:'local'});delete process.env.VERCEL;
 try {
  const before=await readState();const visitId=before.state.scenario_inputs[0].current_visit_id,recordingId=randomUUID(),jobId=randomUUID();
  await updateState(state=>{
   state.recordings.push({id:recordingId,clinic_id:state.clinic.id,visit_id:visitId,source:'microphone',filename:`audio-${recordingId}.webm`,mime_type:'audio/webm',object_path:'synthetic-local-only',size_bytes:1000,status:'processing',duration_ms:3000,created_at:new Date().toISOString()});
   state.jobs.push({id:jobId,clinic_id:state.clinic.id,visit_id:visitId,recording_id:recordingId,kind:'transcription',status:'running',stage:'transcribing',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),input_hash:'synthetic-no-speech'});
  });
  await failJob(jobId,new Error(encodeAudioFailure(new AppError(422,'TRANSCRIPTION_EMPTY','본문 전사 결과가 비어 있습니다.'),'transcribing')));
  const after=await readState(),job=after.state.jobs.find(j=>j.id===jobId)!;
  assert.equal(job.status,'failed');assert.equal(job.stage,'failed');assert.match(job.error!,/음성이 감지되지/);
  assert.deepEqual(job.result?.failure,{code:'TRANSCRIPTION_EMPTY',stage:'transcribing',retryable:false,message:job.error});
  assert.equal(after.state.recordings.find(r=>r.id===recordingId)!.error,job.error);
  assert.deepEqual(after.state.transcripts,before.state.transcripts);assert.deepEqual(after.state.soap_documents,before.state.soap_documents);
  assert.equal(JSON.stringify(after).includes('HANI_AUDIO_FAILURE_V1'),false);
  const handwritingId=randomUUID();
  await updateState(state=>{state.jobs.push({id:handwritingId,clinic_id:state.clinic.id,visit_id:visitId,kind:'handwriting',status:'running',stage:'extracting',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),input_hash:'other-job'});});
  await failJob(handwritingId,new AppError(422,'INVALID_IMAGE','이미지를 다시 확인해 주세요.'));
  const other=(await readState()).state.jobs.find(j=>j.id===handwritingId)!;assert.equal(other.error,'이미지를 다시 확인해 주세요.');assert.equal(other.result?.failure,undefined);
 } finally {process.env=previous;await rm(directory,{recursive:true,force:true});}
});
