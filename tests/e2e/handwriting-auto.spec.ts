import { test,expect } from '@playwright/test';
import { readFile,writeFile } from 'node:fs/promises';import path from 'node:path';import { randomUUID } from 'node:crypto';
import { localDemo,scenario,readState,origin } from './helpers';

async function memo(page:import('@playwright/test').Page){
 await page.getByRole('radio',{name:'펜',exact:true}).click();
 const points=await page.getByTestId('treatment-canvas').evaluate(svg=>{
  const m=(svg as SVGSVGElement).getScreenCTM()!;return [[470,300],[490,345],[475,365],[510,385]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return{x:p.x,y:p.y};});
 });
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y,{steps:8});await page.mouse.up();
}
test('save persists ink then auto extracts and synchronizes an unreviewed SOAP input; source generation uses the memo',async({page})=>{
 await page.setViewportSize({width:834,height:1194});const initial=await localDemo(page),{current_visit_id:visitId}=scenario(initial,'A');
 expect(initial.capabilities.ai).toBe(true);
 const dataDir=process.env.HANI_TEST_DATA_DIR;expect(dataDir).toMatch(/hani-handwriting-qa-/);
 const text='현재 통증은 0점이에요.';
 initial.state.transcripts.push({id:randomUUID(),clinic_id:initial.state.clinic.id,visit_id:visitId,revision:100,status:'reviewed',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:randomUUID(),ordinal:1,speaker:'patient',text,start_ms:0,end_ms:1000}]});initial.version++;
 await writeFile(path.join(dataDir!,'state.json'),JSON.stringify(initial));
 await page.goto(`/tablet/visits/${visitId}`);await memo(page);
 let extractionRequests=0;page.on('request',request=>{if(request.url().endsWith('/api/jobs/handwriting'))extractionRequests++;});
 await page.locator('.tablet-toolbar-save').click();
 await expect.poll(async()=>{const state=(await readState(page.request)).state;return state.annotations.find(a=>a.visit_id===visitId&&a.extracted_text==='우측 발목 부종')?.extraction_reviewed;}).toBe(false);
 expect(extractionRequests).toBe(1);const saved=await readState(page.request);const annotation=saved.state.annotations.find(a=>a.visit_id===visitId&&a.extracted_text==='우측 발목 부종')!;
 expect(annotation.strokes.some(s=>s.kind==='memo')).toBe(true);
 await expect(page.locator('.tablet-toolbar-save')).toBeEnabled();await page.locator('.tablet-toolbar-save').click();
 await expect(page.getByText(/일반 침 · 저장했습니다/)).toBeVisible();expect(extractionRequests).toBe(1);
 await page.goto(`/clinic/visits/${visitId}`);const notes=page.getByRole('region',{name:'필기 기록',exact:true});
 await expect(notes.getByText('우측 발목 부종',{exact:true})).toBeVisible();await expect(notes.getByText('자동 추출 · SOAP 초안 입력',{exact:true})).toBeVisible();
 const job=await page.request.post('/api/jobs',{headers:{Origin:origin},data:{visitId,kind:'soap',transcriptId:initial.state.transcripts.at(-1)!.id}});expect(job.status(),await job.text()).toBe(201);
 const current=await readState(page.request),document=current.state.soap_documents.filter(doc=>doc.visit_id===visitId).at(-1)!;
 expect(document.status).toBe('draft');expect(document.sections.o).toContain('우측 발목 부종');expect(document.input_snapshot?.sources.some(s=>s.record_id===annotation.id)).toBe(true);
 await expect(page.getByRole('note').filter({hasText:'SOAP 승인 전에 판독과 내용을 확인'})).toBeVisible();
 expect(current.state.soap_documents.filter(doc=>doc.status==='approved')).toEqual(initial.state.soap_documents.filter(doc=>doc.status==='approved'));
});
test('extraction failure keeps ink saved and the same save button retries without editing the drawing',async({page})=>{
 await page.setViewportSize({width:834,height:1194});const initial=await localDemo(page),{current_visit_id:visitId}=scenario(initial,'B');
 await page.goto(`/tablet/visits/${visitId}`);await memo(page);
 await page.route('**/api/jobs/handwriting',route=>route.fulfill({status:503,json:{error:'합성 추출 실패'}}));
 await page.locator('.tablet-toolbar-save').click();
 await expect(page.getByText(/필기 원본은 저장되어 있어요/)).toBeVisible();
 const failed=await readState(page.request),note=failed.state.annotations.find(a=>a.visit_id===visitId)!;
 expect(note.strokes.some(s=>s.kind==='memo')).toBe(true);expect(note.extracted_text).toBeNull();
 await page.unroute('**/api/jobs/handwriting');await page.locator('.tablet-toolbar-save').click();
 await expect.poll(async()=>(await readState(page.request)).state.annotations.find(a=>a.id===note.id)?.extracted_text).toBe('우측 발목 부종');
 expect((await readState(page.request)).state.annotations.find(a=>a.id===note.id)?.revision).toBe(note.revision);
});
