import { test,expect } from '@playwright/test';
import { action,localDemo,readState,scenario } from './helpers';
import { STAIR_ASCENT_METRIC } from '../../src/lib/progress/stair-discomfort';

test('stair progress link shows its empty state before a score is saved and returns to the originating visit',async({page})=>{
 const initial=await localDemo(page);const {current_visit_id:visitId,patient_id:patientId}=scenario(initial,'A');
 const empty={...initial,state:{...initial.state,observations:initial.state.observations.filter(o=>o.metric_key!=='stair_ascent_discomfort')}};
 await page.route('**/api/state',route=>route.fulfill({json:empty}));
 await page.goto(`/clinic/visits/${visitId}`);
 const panel=page.getByRole('region',{name:'계단 오를 때 불편함',exact:true});await expect(panel).toBeVisible();
 const before=await readState(page.request);
 await panel.getByRole('link',{name:/경과 보기/}).click();
 await expect(page).toHaveURL(new RegExp(`/clinic/patients/${patientId}/progress\\?metric=stair_ascent_discomfort&visit=${visitId}$`));
 const progress=page.getByRole('region',{name:'계단 오르기 불편',exact:true});
 await expect(progress.getByText('아직 확인·저장한 계단 오르기 점수가 없어요.',{exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:'통증 변화',exact:true})).toHaveCount(0);
 expect((await readState(page.request)).version).toBe(before.version);
 await progress.getByRole('link',{name:'진료실에서 계단 점수 입력',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/clinic/visits/${visitId}#today-stair-ascent$`));
 await expect(page.locator('#today-stair-ascent')).toHaveValue('');
});

test('saved zero opens the stair chart through the actual link and keeps the overall progress view available',async({page})=>{
 const initial=await localDemo(page);const {current_visit_id:visitId,patient_id:patientId}=scenario(initial,'A');
 const painBefore=initial.state.observations.filter(o=>o.patient_id===patientId&&o.instrument==='NRS');
 await action(page.request,'observation.save',{visitId,...STAIR_ASCENT_METRIC,value:0});
 await page.goto(`/clinic/visits/${visitId}`);
 const panel=page.getByRole('region',{name:'계단 오를 때 불편함',exact:true});
 await expect(panel.getByLabel('오늘 확인한 불편 점수')).toHaveValue('0');
 await panel.getByRole('link',{name:/경과 보기/}).click();
 const progress=page.getByRole('region',{name:'계단 오르기 불편',exact:true});
 await expect(progress.getByRole('group',{name:/계단 오르기 불편 방문별 그래프/})).toBeVisible();
 await expect(progress.getByRole('button',{name:/0점 기록 보기/})).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'통증 변화',exact:true})).toHaveCount(0);
 await page.reload();await expect(progress.getByRole('button',{name:/0점 기록 보기/})).toHaveCount(1);
 await expect(page.getByRole('link',{name:'진료실로 이동',exact:true})).toHaveAttribute('href',`/clinic/visits/${visitId}`);
 await page.getByRole('link',{name:'전체 경과 보기',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/clinic/patients/${patientId}/progress$`));
 await expect(page.getByRole('heading',{name:'통증 변화',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'계단 오르기 불편',exact:true})).toBeVisible();
 const after=await readState(page.request);expect(after.state.observations.filter(o=>o.patient_id===patientId&&o.instrument==='NRS')).toEqual(painBefore);
});
