import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import path from 'node:path';
import { readState,updateState,mutateState } from './store';
import { unlock,SESSION_COOKIE } from './auth';
import { runSavedHandwritingExtraction } from '@/lib/ai/handwriting';
import { collectClinicalSoapSources } from '@/lib/ai/soap-inputs';
import { POST } from '@/app/api/jobs/handwriting/route';
let prior:NodeJS.ProcessEnv,directory:string,annotationId:string,visitId:string,sessionId:string,cookie:string;
beforeEach(async()=>{
 prior={...process.env};directory=await mkdtemp(path.join(tmpdir(),'hani-handwriting-test-'));
 Object.assign(process.env,{NODE_ENV:'test',HANI_STORAGE_MODE:'local',HANI_DATA_DIR:directory,OPENAI_API_KEY:'test-key'});
 for(const key of ['VERCEL','DEMO_PIN_HASH','APP_ORIGIN','DEMO_DEV_PIN'])delete process.env[key];
 const auth=await unlock(new Request('http://localhost:3000/api/access/unlock',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000'}}),'1234');sessionId=auth.session.id;cookie=`${SESSION_COOKIE}=${auth.token}`;
 const {state}=await readState();visitId=state.scenario_inputs[0].current_visit_id;
 const next=await mutateState({type:'annotation.save',payload:{visitId,annotation:{modality:'acupuncture',technique:'standard_acupuncture',view:'front',coordinate_space:'normalized',coordinate_version:'body-map-v3-female',canvas_size:{width:1000,height:1000},strokes:[{id:'memo',kind:'memo',created_at:new Date().toISOString(),points:[{x:.4,y:.5,t:1},{x:.43,y:.55,t:2}]}]}}});annotationId=next.state.annotations[0].id;
});
afterEach(async()=>{process.env=prior;await rm(directory,{recursive:true,force:true});});
const input=()=>({annotationId,revision:1,image:'data:image/png;base64,aGVsbG8=',sessionId});
test('automatic extraction persists a source-bound unreviewed text eligible for SOAP; unchanged retry does not call the model',async()=>{
 let calls=0;const extract=async()=>{calls++;return{text:'우측 발목 부종',unclear:[]};};
 const before=await readState();const first=await runSavedHandwritingExtraction(input(),extract);assert.equal(first.stale,false);
 const second=await runSavedHandwritingExtraction(input(),extract);assert.equal(second.reused,true);assert.equal(calls,1);
 const after=await readState();const note=after.state.annotations[0];assert.equal(note.extracted_text,'우측 발목 부종');assert.equal(note.extraction_reviewed,false);
 const source=collectClinicalSoapSources(after.state,visitId).find(row=>row.record_id===annotationId)!;assert.equal(source.review_status,'ai_draft');assert.match(source.text,/판독 확인 전/);
 assert.deepEqual(after.state.transcripts,before.state.transcripts);assert.deepEqual(after.state.soap_documents,before.state.soap_documents);
});
test('a concurrent request reuses the running job and edited ink prevents stale completion',async()=>{
 let resolve!:(value:{text:string;unclear:string[]})=>void,started!:(value?:unknown)=>void;
 const active=new Promise(done=>{started=done;});const pending=new Promise<{text:string;unclear:string[]}>(done=>{resolve=done;});
 const first=runSavedHandwritingExtraction(input(),async()=>{started();return pending;});await active;
 const duplicate=await runSavedHandwritingExtraction(input(),async()=>{throw new Error('DUPLICATE_MODEL_CALL');});assert.equal(duplicate.pending,true);
 await updateState(state=>{state.annotations[0].revision=2;state.annotations[0].strokes[0].points[1].x=.44;});
 resolve({text:'古い内容',unclear:[]});assert.equal((await first).stale,true);
 const state=(await readState()).state;assert.equal(state.annotations[0].extracted_text,null);assert.equal(collectClinicalSoapSources(state,visitId).some(row=>row.kind==='handwriting'),false);
});
test('manual correction during recognition wins, and a model failure keeps the ink retryable',async()=>{
 const before=await readState();const original=structuredClone(before.state.annotations[0].strokes);
 await assert.rejects(runSavedHandwritingExtraction(input(),async()=>{throw new Error('MODEL_FAILED');}));
 assert.deepEqual((await readState()).state.annotations[0].strokes,original);
 const result=await runSavedHandwritingExtraction(input(),async()=>{await mutateState({type:'annotation.review',payload:{id:annotationId,revision:1,extracted_text:'의료진 판독: 부종 없음'}});return{text:'부종 있음',unclear:[]};});
 assert.equal(result.stale,true);const note=(await readState()).state.annotations[0];assert.equal(note.extracted_text,'의료진 판독: 부종 없음');assert.equal(note.extraction_reviewed,true);
});
test('handwriting API requires PIN and same origin before accepting images',async()=>{
 const req=(auth=true,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/jobs/handwriting',{method:'POST',headers:{host:'localhost:3000',origin,cookie:auth?cookie:'','Content-Type':'application/json'},body:JSON.stringify(input())});
 assert.equal((await POST(req(false))).status,401);assert.equal((await POST(req(true,'https://untrusted.example'))).status,403);
 assert.equal((await POST(new Request('http://localhost:3000/api/jobs/handwriting',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000',cookie,'Content-Type':'application/json'},body:JSON.stringify({...input(),image:'invalid'})}))).status,400);
 assert.equal((await readState()).state.jobs.length,0);
});
