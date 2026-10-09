import { createHash,randomUUID } from 'node:crypto';
import { AI_MODELS } from './config';
import { extractHandwriting } from './provider';
import { readState,updateState } from '@/lib/server/store';
import { assertAiCapacity } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';

export async function runSavedHandwritingExtraction(input:{annotationId:string;revision:number;image:string;sessionId:string},extract=extractHandwriting) {
 const inputHash=createHash('sha256').update(JSON.stringify([input.annotationId,input.revision,input.image,AI_MODELS.soap])).digest('hex');
 const {state,version}=await readState();
 const annotation=state.annotations.find(row=>row.id===input.annotationId&&row.clinic_id===state.clinic.id);
 if(!annotation||annotation.revision!==input.revision)throw new AppError(409,'ANNOTATION_VERSION_CONFLICT','최신 필기를 저장한 뒤 다시 요청해 주세요.');
 if(!annotation.strokes.some(stroke=>stroke.kind==='memo'&&stroke.points.length))throw new AppError(400,'MEMO_REQUIRED','글씨가 있는 필기만 텍스트로 추출합니다.');
 let jobId='',reused=false,pending=false;
 await updateState(next=>{
  reused=false;pending=false;
  const current=next.annotations.find(row=>row.id===input.annotationId);
  if(!current||current.revision!==input.revision)throw new AppError(409,'ANNOTATION_VERSION_CONFLICT','필기가 변경되었습니다. 최신 필기를 저장해 주세요.');
  const existing=[...next.jobs].reverse().find(job=>job.kind==='handwriting'&&job.input_hash===inputHash&&job.status!=='failed'&&job.result?.stale_input!==true);
  if(existing?.status==='running'&&Date.now()-Date.parse(existing.created_at)<180_000){jobId=existing.id;reused=true;pending=true;return;}
  if(existing&&['waiting_review','completed'].includes(existing.status)&&typeof existing.result?.text==='string'&&current.extracted_text===existing.result.text){jobId=existing.id;reused=true;return;}
  if(existing?.status==='running'){existing.status='failed';existing.error='필기 추출 시간이 초과되어 재시도합니다.';existing.updated_at=new Date().toISOString();}
  jobId=randomUUID();
  next.jobs.push({id:jobId,clinic_id:next.clinic.id,visit_id:annotation.visit_id,kind:'handwriting',status:'running',stage:'handwriting',input_hash:inputHash,input_version:version,session_id:input.sessionId,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),result:{annotationId:input.annotationId,revision:input.revision,mode:'actual_ai',model:AI_MODELS.soap,input_text:current.extracted_text??null,input_reviewed:Boolean(current.extraction_reviewed)}});
 });
 if(reused){const latest=(await readState()).state.jobs.find(job=>job.id===jobId)!;return{jobId,annotationId:input.annotationId,revision:input.revision,reused:true,pending,...(!pending?{text:latest.result?.text,unclear:latest.result?.unclear??[],stale:false}:{})};}
 try {
  await assertAiCapacity(input.sessionId);
  const result=await extract(input.image);let stale=true;
  await updateState(next=>{
   const current=next.annotations.find(row=>row.id===input.annotationId),job=next.jobs.find(row=>row.id===jobId)!;
   stale=!current||current.revision!==input.revision||job.status!=='running'||(current.extracted_text??null)!==job.result?.input_text||Boolean(current.extraction_reviewed)!==job.result?.input_reviewed;
   if(!stale){current!.extracted_text=result.text;current!.extraction_reviewed=false;current!.updated_at=new Date().toISOString();}
   if(job.status==='running'){job.result={...job.result,...result,stale_input:stale};job.status='waiting_review';job.stage=stale?'stale_input':'review_needed';job.updated_at=new Date().toISOString();}
  });
  return{jobId,...result,stale,annotationId:input.annotationId,revision:input.revision,reused:false,pending:false};
 } catch(error){await updateState(next=>{const job=next.jobs.find(row=>row.id===jobId);if(job&&job.status==='running'){job.status='failed';job.error='필기 원본은 저장되어 있습니다. 텍스트 추출을 다시 시도해 주세요.';job.updated_at=new Date().toISOString();}}).catch(()=>{});throw error;}
}
