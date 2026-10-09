import { expect,test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { localDemo,scenario } from './helpers';
import type { RuntimeRecording,RuntimeJob,Transcript } from '../../src/lib/types';

function recording(clinicId:string,visitId:string,at:string):RuntimeRecording { const id=randomUUID();return {id,clinic_id:clinicId,visit_id:visitId,source:'microphone',filename:`audio-${id}.webm`,mime_type:'audio/webm',size_bytes:1000,object_path:'synthetic',created_at:at,status:'processing',duration_ms:3000}; }
function job(file:RuntimeRecording,at=file.created_at):RuntimeJob{return {id:randomUUID(),clinic_id:file.clinic_id,visit_id:file.visit_id,recording_id:file.id,kind:'transcription',status:'running',stage:'transcribing',input_hash:'synthetic-ui',created_at:at,updated_at:at,result:{}};}

test('one recording owns the progress, old failures stay folded and each result identifies its source',async({page})=>{
 const envelope=await localDemo(page),{current_visit_id:visitId}=scenario(envelope,'B');
 const at=new Date(Date.now()-18_000).toISOString();
 const oldFile=recording(envelope.state.clinic.id,visitId,new Date(Date.now()-120_000).toISOString());
 const oldJob=job(oldFile);oldJob.status='failed';oldJob.stage='failed';oldJob.error='이전 작업에서 수치 근거가 맞지 않습니다.';oldJob.result={failure:{code:'SOAP_NUMBER_UNSUPPORTED',stage:'soap_draft'}};
 const currentFile=recording(envelope.state.clinic.id,visitId,at),currentJob=job(currentFile);
 const unrelated:RuntimeJob={...job(currentFile),id:randomUUID(),recording_id:null,kind:'analysis',stage:'briefing',result:{task:'briefing'},created_at:new Date().toISOString()};
 envelope.state.recordings=[oldFile,currentFile];envelope.state.jobs=[oldJob,currentJob,unrelated];
 const text='지금은 불편한 증상이 없어요.';
 const transcript:Transcript={id:randomUUID(),clinic_id:envelope.state.clinic.id,visit_id:visitId,revision:90,status:'raw',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:randomUUID(),ordinal:1,speaker:'patient',text,start_ms:0,end_ms:1000}]};
 await page.route('**/api/state',route=>route.fulfill({json:envelope}));
 await page.route('**/api/jobs?*',route=>route.fulfill({json:{jobs:envelope.state.jobs,recordings:envelope.state.recordings,transcripts:envelope.state.transcripts}}));
 await page.route('**/api/audio/config',route=>route.fulfill({json:{configured:true}}));
 const failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
 await page.goto(`/clinic/visits/${visitId}`);
 const progress=page.getByRole('region',{name:'현재 음성 처리',exact:true});
 await expect(progress).toHaveCount(1);await expect(progress.getByRole('heading',{name:'대화를 글자로 변환 중'})).toBeVisible();
 await expect(progress.getByText(/처리 시간 00:/)).toBeVisible();await expect(progress.getByRole('list',{name:'음성 처리 단계'}).locator('[aria-current="step"]')).toHaveText('전사');
 await expect(page.getByText(oldJob.error,{exact:true})).not.toBeVisible();
 await expect(page.getByText('briefing',{exact:true})).toHaveCount(0);
 await expect(page.getByText('선택한 음성의 전사 결과',{exact:true})).toHaveCount(0);
 currentJob.stage='alignment_review';await expect(progress.getByRole('heading',{name:'전사 누락을 확인 중'})).toBeVisible();
 currentJob.stage='speaker_roles';await expect(progress.getByRole('heading',{name:'누가 말했는지 정리 중'})).toBeVisible();
 await expect(progress.getByRole('list',{name:'음성 처리 단계'}).locator('[aria-current="step"]')).toHaveText('화자·용어 정리');
 currentJob.stage='dictionary_correction';await expect(progress.getByRole('heading',{name:'진료 용어를 확인 중'})).toBeVisible();
 currentJob.stage='soap_draft';await expect(progress.getByRole('heading',{name:'SOAP 초안 작성 중'})).toBeVisible();
 currentJob.stage='review_needed';currentJob.status='waiting_review';currentJob.result={transcriptId:transcript.id,corrections:[]};currentJob.updated_at=new Date().toISOString();
 envelope.state.transcripts.push(transcript);
 const doc=envelope.state.soap_documents.find(d=>d.visit_id===visitId);
 if(doc)doc.input_transcript_id=transcript.id;
 else {const template=envelope.state.soap_documents[0];envelope.state.soap_documents.push({...template,id:randomUUID(),visit_id:visitId,input_transcript_id:transcript.id,revision:1,status:'draft',approved_at:null,approved_by:null});}
 envelope.version++;
 await expect(progress.getByRole('heading',{name:'초안 생성 완료 · 검토 대기'})).toBeVisible();
 await expect(progress.locator('[aria-current="step"]')).toHaveCount(0);
 await expect(page.getByText('선택한 음성의 전사 결과',{exact:true})).toBeVisible();
 await expect(page.getByText('음성·SOAP 작업이 진행 중이에요. 상단에서 해당 녹음의 진행 상태를 확인하세요.',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('SOAP 생성 출처')).toContainText('녹음');
 const clock=await progress.getByText(/처리 시간/).textContent();await page.waitForTimeout(1100);expect(await progress.getByText(/처리 시간/).textContent()).toBe(clock);
 if(process.env.HANI_VISUAL_OUTPUT_DIR){await page.screenshot({path:`${process.env.HANI_VISUAL_OUTPUT_DIR}/audio-progress-review.png`,fullPage:true});await progress.screenshot({path:`${process.env.HANI_VISUAL_OUTPUT_DIR}/audio-progress-card.png`});}
 await page.getByText('전사 원문과 용어 제안 검토',{exact:true}).click();
 await page.getByRole('button',{name:'전사 편집',exact:false}).click();
 const edited=page.getByLabel('검토 전사',{exact:true});
 await edited.fill('의료진의 저장하지 않은 전사 편집');
 await expect(page.getByRole('button',{name:'녹음 시작',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'음성 파일',exact:true})).toBeDisabled();
 await edited.fill(text);
 await page.getByText('지난 음성 처리 1건',{exact:true}).click();
 await page.getByRole('button',{name:'진행·결과 보기',exact:true}).click();
 await expect(progress.getByRole('heading',{name:'음성 처리 중단'})).toBeVisible();
 await expect(progress.getByText(oldJob.error,{exact:true}).first()).toBeVisible();
 await expect(page.getByText('선택한 음성의 전사 결과',{exact:true})).toHaveCount(0);
 await page.setViewportSize({width:768,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(failures).toEqual([]);
});

test('silent recording shows a specific reason and a new-recording action without presenting older results',async({page})=>{
 const envelope=await localDemo(page),{current_visit_id:visitId}=scenario(envelope,'A');
 const file=recording(envelope.state.clinic.id,visitId,new Date().toISOString());file.status='failed';
 const failed=job(file);failed.status='failed';failed.stage='failed';failed.error='음성이 감지되지 않았어요. 말한 내용이 포함된 녹음을 다시 보내 주세요.';failed.result={failure:{code:'TRANSCRIPTION_EMPTY',stage:'transcribing',retryable:false}};
 envelope.state.recordings=[file];envelope.state.jobs=[failed];
 await page.route('**/api/state',route=>route.fulfill({json:envelope}));await page.route('**/api/jobs?*',route=>route.fulfill({json:{jobs:[failed],recordings:[file],transcripts:envelope.state.transcripts}}));await page.route('**/api/audio/config',route=>route.fulfill({json:{configured:true}}));
 await page.goto(`/clinic/visits/${visitId}`);
 const progress=page.getByRole('region',{name:'현재 음성 처리',exact:true});
 await expect(progress.getByText(failed.error,{exact:true}).first()).toBeVisible();await expect(progress.getByRole('button',{name:'다시 녹음',exact:true})).toBeVisible();
 await expect(progress.getByText('이번 음성에서는 사용할 최종 전사와 SOAP가 생성되지 않았어요.',{exact:true})).toBeVisible();
 await expect(progress.getByRole('button',{name:'이 음성으로 다시 전사',exact:true})).toHaveCount(0);
 await expect(page.getByText('선택한 음성의 전사 결과',{exact:true})).toHaveCount(0);
 if(process.env.HANI_VISUAL_OUTPUT_DIR)await page.screenshot({path:`${process.env.HANI_VISUAL_OUTPUT_DIR}/audio-progress-silence.png`,fullPage:true});
});
