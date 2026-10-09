import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { chooseSelect, localDemo, scenario } from './helpers';
import type { CareMessage, RuntimeJob, StateEnvelope } from '../../src/lib/types';

async function fixture(page: Page) {
 const envelope=await localDemo(page), {patient_id:patientId}=scenario(envelope,'A');
 envelope.capabilities.ai=true;
 const patient=envelope.state.patients.find(p=>p.id===patientId)!;
 const course=envelope.state.medication_courses.find(c=>c.patient_id===patientId)!;
 const alternateCourse={...course,id:randomUUID()};envelope.state.medication_courses.push(alternateCourse);
 const approvedVisit=envelope.state.soap_documents.find(s=>s.status==='approved'&&envelope.state.visits.some(v=>v.id===s.visit_id&&v.patient_id===patientId))!.visit_id;
 await page.route('**/api/state',route=>route.fulfill({json:envelope}));
 await page.goto('/clinic/care');
 await page.getByRole('button').filter({hasText:patient.display_name}).first().click();
 return {envelope,patientId,approvedVisit,alternateCourse};
}
function queuedJob(envelope: StateEnvelope, patientId: string, request: any) {
 const job:RuntimeJob={id:randomUUID(),clinic_id:envelope.state.clinic.id,visit_id:request.visitId,kind:'care',status:'queued',stage:'queued',input_hash:'ui-settings',created_at:'2026-10-09T07:00:00Z',updated_at:'2026-10-09T07:00:00Z',result:{task:'care',requested_stage:request.stage,medication_course_id:request.medication_course_id}};
 envelope.state.jobs.push(job);envelope.version++;
 return job;
}
function complete(envelope: StateEnvelope, patientId: string, job: RuntimeJob, text: string) {
 const base=envelope.state.care_messages.find(m=>m.patient_id===patientId)!;
 const message:CareMessage={...base,id:randomUUID(),visit_id:job.visit_id,stage:job.result!.requested_stage as CareMessage['stage'],medication_course_id:job.result!.medication_course_id as string|null,status:'draft',draft_body:text,approved_body:null,approved_at:null,delivered_at:null,delivery_mode:'preview'};
 envelope.state.care_messages.push(message);Object.assign(job,{status:'waiting_review',stage:'review_needed',result:{...job.result,messageId:message.id}});envelope.version++;
 return message;
}

test('changed stage, source visit and medication course can generate and load a new AI draft without saving empty text',async({page})=>{
 const {envelope,patientId,approvedVisit,alternateCourse}=await fixture(page);
 const requests:any[]=[];let job:RuntimeJob|undefined;
 await page.route('**/api/care/generate',route=>{const body=route.request().postDataJSON();requests.push(body);job=queuedJob(envelope,patientId,body);return route.fulfill({status:202,json:{jobId:job.id}});});
 await page.getByRole('button',{name:'＋ 새 안내',exact:true}).click();
 await chooseSelect(page,page.getByRole('combobox',{name:'안내 시점',exact:true}),'week1');
 await chooseSelect(page,page.getByRole('combobox',{name:'기준 진료',exact:true}),approvedVisit);
 await chooseSelect(page,page.getByRole('combobox',{name:'기준 복약 과정',exact:true}),alternateCourse.id);
 const body=page.getByLabel('안내문 초안');await expect(body).toHaveValue('');
 const ai=page.getByRole('button',{name:'AI 맞춤 안내 초안 만들기',exact:true});await expect(ai).toBeEnabled();
 await expect(page.getByRole('button',{name:'초안 저장',exact:true})).toBeDisabled();await ai.click();
 await expect.poll(()=>requests[0]).toEqual({visitId:approvedVisit,stage:'week1',medication_course_id:alternateCourse.id});
 await expect(page.getByRole('combobox',{name:'안내 시점',exact:true})).toBeDisabled();
 const result=complete(envelope,patientId,job!,'선택한 안내 조건의 AI 초안입니다.');
 await expect(body).toHaveValue(result.draft_body);await expect(page.getByRole('combobox',{name:'확인할 안내',exact:true})).toHaveAttribute('data-value',result.id);
 await expect(page.getByRole('button',{name:'내용 승인',exact:true})).toBeEnabled();expect(requests).toHaveLength(1);
});

test('typing while AI is running detaches its late result and preserves the manual draft after save',async({page})=>{
 const {envelope,patientId}=await fixture(page);let job:RuntimeJob|undefined;
 await page.route('**/api/care/generate',route=>{job=queuedJob(envelope,patientId,route.request().postDataJSON());return route.fulfill({status:202,json:{jobId:job.id}});});
 await page.getByRole('button',{name:'＋ 새 안내',exact:true}).click();await page.getByRole('button',{name:'AI 맞춤 안내 초안 만들기',exact:true}).click();
 await expect.poll(()=>job?.status).toBe('queued');
 const body=page.getByLabel('안내문 초안');await expect(body).toBeEnabled();await body.fill('의료진이 직접 작성한 문안.');
 const generated=complete(envelope,patientId,job!,'늦게 완료된 AI 결과.');
 await expect(page.getByRole('status').filter({hasText:'AI 초안 · 의료진 검토 필요'})).toBeVisible();
 await expect(body).toHaveValue('의료진이 직접 작성한 문안.');await expect(page.getByRole('button',{name:'AI 맞춤 안내 초안 만들기',exact:true})).toBeDisabled();
 let saved:CareMessage|undefined;
 await page.route('**/api/actions',route=>{const request=route.request().postDataJSON();expect(request.type).toBe('care.save');saved={...generated,id:randomUUID(),draft_body:request.payload.draft_body};envelope.state.care_messages.push(saved);envelope.version++;return route.fulfill({json:envelope});});
 await page.getByRole('button',{name:'초안 저장',exact:true}).click();
 await expect(page.getByText('안내 초안을 저장했습니다. 내용을 확인한 뒤 승인해 주세요.',{exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'확인할 안내',exact:true})).toHaveAttribute('data-value',saved!.id);
 await expect(body).toHaveValue('의료진이 직접 작성한 문안.');await expect(page.getByRole('button',{name:'AI 맞춤 안내 초안 만들기',exact:true})).toBeEnabled();
});

test('cloned approved wording remains protected while settings-only changes leave AI available',async({page})=>{
 const {envelope,patientId}=await fixture(page);
 const original=envelope.state.care_messages.find(m=>m.patient_id===patientId&&m.status==='sent')!;
 await chooseSelect(page,page.getByRole('combobox',{name:'확인할 안내',exact:true}),original.id);
 await page.getByRole('button',{name:'새 초안으로 수정',exact:true}).click();
 await expect(page.getByLabel('안내문 초안')).not.toHaveValue('');
 await chooseSelect(page,page.getByRole('combobox',{name:'안내 시점',exact:true}),'week1');
 await expect(page.getByRole('button',{name:'AI 맞춤 안내 초안 만들기',exact:true})).toBeDisabled();
 await expect(page.getByText('편집한 안내문을 먼저 저장해 주세요.',{exact:true})).toBeVisible();
 expect(envelope.state.care_messages.find(m=>m.id===original.id)!.approved_body).toBe(original.approved_body);
});
