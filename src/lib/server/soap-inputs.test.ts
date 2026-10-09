import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readState, updateState } from './store';
import { SESSION_COOKIE, unlock } from './auth';
import { POST as actionRoute } from '@/app/api/actions/route';
import { soapInputSnapshot } from '@/lib/ai/soap-inputs';

test('SOAP input snapshots persist and stale confirmed records block approval without changing approved history', async () => {
 const previous={...process.env},directory=await mkdtemp(path.join(tmpdir(),'hani-soap-inputs-'));
 Object.assign(process.env,{HANI_DATA_DIR:directory,HANI_STORAGE_MODE:'local',NODE_ENV:'test'});
 for(const key of ['VERCEL','APP_ORIGIN','DEMO_PIN_HASH','DEMO_DEV_PIN']) delete process.env[key];
 try {
 const origin='http://localhost:3000';
 const auth=await unlock(new Request(`${origin}/api/access/unlock`,{method:'POST',headers:{host:'localhost:3000',origin}}),'1234');
 let id='',visitId='';
 await updateState(state=>{
  visitId=state.scenario_inputs[0].current_visit_id;
  const transcript={id:randomUUID(),clinic_id:state.clinic.id,visit_id:visitId,revision:1,status:'reviewed' as const,source_asset_key:'manual_seed' as const,origin:'manual_demo' as const,text:'오른쪽 발목 통증은 0점이에요.',segments:[{id:randomUUID(),ordinal:1,speaker:'patient' as const,text:'오른쪽 발목 통증은 0점이에요.',start_ms:0,end_ms:1000}]};
  state.transcripts.push(transcript);id=randomUUID();
  state.soap_documents.push({id,clinic_id:state.clinic.id,visit_id:visitId,revision:1,input_transcript_id:transcript.id,input_snapshot:soapInputSnapshot(state,transcript),status:'draft',sections:{s:transcript.text,o:'',a:'',p:''},source_refs:[],approved_at:null,approved_by:null,origin:'manual_demo'});
 });
 const before=await readState(); const doc=before.state.soap_documents.find(row=>row.id===id)!;
 assert.match(doc.input_snapshot!.hash,/^[a-f0-9]{64}$/);
 const approvedBefore=before.state.soap_documents.filter(row=>row.status==='approved');
 await updateState(state=>{state.treatments.push({id:randomUUID(),clinic_id:state.clinic.id,visit_id:visitId,modality:'acupuncture',technique:'standard_acupuncture',body_region:'발목',laterality:'right',acupoints:[{code:'GB40',label_ko:'구허'}],status:'confirmed',source:'manual',notes:null,origin:'manual_demo'});});
 const response=await actionRoute(new Request(`${origin}/api/actions`,{method:'POST',headers:{host:'localhost:3000',origin,cookie:`${SESSION_COOKIE}=${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify({type:'soap.approve',payload:{visitId,soapId:id}})}));
 assert.equal(response.status,409);assert.equal((await response.json()).code,'STALE_SOAP_INPUT');
 const after=await readState();assert.equal(after.state.soap_documents.find(row=>row.id===id)!.status,'draft');
 assert.deepEqual(after.state.soap_documents.filter(row=>row.status==='approved'),approvedBefore);
 } finally {process.env=previous;await rm(directory,{recursive:true,force:true});}
});
