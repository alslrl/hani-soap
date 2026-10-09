import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { localDemo,scenario,chooseSelect } from './helpers';

test('personalized care displays dated context and keeps edited text while approved histories remain fixed',async({page})=>{
 const envelope=await localDemo(page),{patient_id:patientId}=scenario(envelope,'A');const patient=envelope.state.patients.find(p=>p.id===patientId)!;
 const original=envelope.state.care_messages.find(m=>m.patient_id===patientId&&m.approved_body)!;
 const approvedText=original.approved_body;
 const message={...original,id:randomUUID(),stage:'visit_summary' as const,status:'draft' as const,approved_body:null,approved_at:null,approved_by:null,delivered_at:null,draft_body:'지난 불편 응답이 있어 현재 불편이 남아 있는지 확인하겠습니다.'};
 envelope.state.care_messages.push(message);
 envelope.state.jobs.push({id:randomUUID(),clinic_id:envelope.state.clinic.id,visit_id:message.visit_id,kind:'care',status:'waiting_review',stage:'review_needed',input_hash:'context-ui',created_at:'2026-10-09T06:00:00Z',updated_at:'2026-10-09T06:00:00Z',result:{messageId:message.id,care_context_version:'contextual-care-v1',stale_input:false,care_strategy:{stage:'visit_summary',recipient:{kind:'patient'},focus:[{title:'현재 불편을 먼저 확인',why:'지난 응답을 현재 상태로 단정하지 않고 다시 묻습니다.',evidence:[{source_kind:'care_response',source_date:'2026-10-08T03:00:00Z',quote:'속이 불편하다고 답했어요.',temporal:'dated_report',response_source:'demo_simulation'}]}]}}});
 await page.route('**/api/state',route=>route.fulfill({json:envelope}));
 await page.goto('/clinic/care');await page.getByRole('button').filter({hasText:patient.display_name}).first().click();
 await chooseSelect(page,page.getByRole('combobox',{name:'확인할 안내'}),message.id);
 const strategy=page.getByRole('region',{name:'맞춤 안내 방향과 근거'});
 await expect(strategy.getByText('현재 불편을 먼저 확인',{exact:true})).toBeVisible();
 await strategy.getByText('이 방향의 날짜·원문 근거',{exact:true}).click();
 await expect(strategy.getByText('속이 불편하다고 답했어요.',{exact:true})).toBeVisible();
 await expect(strategy.locator('time')).toHaveAttribute('datetime','2026-10-08T03:00:00Z');
 await expect(strategy.getByText('모의 응답',{exact:true})).toBeVisible();await expect(strategy.getByText('지난 기록·현재 상태 미확정',{exact:true})).toBeVisible();
 const body=page.getByLabel('안내문 초안');await body.fill('의료진이 수정한 안내 내용.');
 envelope.version++;envelope.state.jobs.at(-1)!.result!.stale_input=true;
 await expect(page.getByText('생성 중 환자 응답이나 확인 기록이 바뀌었습니다. 최신 맥락으로 다시 생성한 뒤 검토해 주세요.',{exact:true})).toBeVisible();
 await expect(body).toHaveValue('의료진이 수정한 안내 내용.');await expect(page.getByRole('button',{name:'내용 승인',exact:true})).toBeDisabled();
 expect(original.approved_body).toBe(approvedText);
});
