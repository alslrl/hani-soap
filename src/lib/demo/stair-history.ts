import { createHash } from 'node:crypto';
import type { AppState,Observation } from '@/lib/types';
import { STAIR_ASCENT_METRIC } from '@/lib/progress/stair-discomfort';

/** Explicit fictional history for the adult demo; never fills today's score. */
export function addDemoStairHistory(state: AppState): string[] {
 if (!state.meta.is_demo) throw new Error('DEMO_STATE_REQUIRED');
 const scenario=state.scenario_inputs.find(row=>row.demo_key==='A');
 const current=state.visits.find(row=>row.id===scenario?.current_visit_id);
 if(!scenario||!current)throw new Error('ADULT_DEMO_REQUIRED');
 const visits=state.visits.filter(row=>row.patient_id===scenario.patient_id&&row.scheduled_at<current.scheduled_at).sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at)).slice(0,3);
 const scores=[8,6,4], added:string[]=[];
 const compatible=state.observations.find(row=>row.patient_id===scenario.patient_id&&Object.entries(STAIR_ASCENT_METRIC).every(([key,value])=>row[key as keyof Observation]===value));
 const series=compatible?.series_key??'A:stair_ascent_discomfort:APP_FUNCTION_DISCOMFORT:ankle:right:stairs_up:stair_ascent_discomfort:v1';
 visits.forEach((visit,index)=>{
  if(state.observations.some(row=>row.patient_id===scenario.patient_id&&row.visit_id===visit.id&&Object.entries(STAIR_ASCENT_METRIC).every(([key,value])=>row[key as keyof Observation]===value)))return;
  const hex=createHash('sha256').update(`hani-demo-stair-history-v1:${visit.id}`).digest('hex');
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const date=visit.scheduled_at.slice(0,10),value=scores[index];
  state.observations.push({id,clinic_id:state.clinic.id,patient_id:scenario.patient_id,visit_id:visit.id,followup_answer_id:null,...STAIR_ASCENT_METRIC,series_key:series,value,measured_at:visit.started_at??visit.scheduled_at,review_status:'reviewed',source_refs:[{kind:'seed_snapshot',source_id:'demo-stair-history-v1',quote:`데모용 합성 과거 이력: ${date} 오른쪽 발목 계단 오르기 불편 ${value}/10. 실제 측정 자료가 아닌 가상 점수입니다.`,origin:'synthetic_history'}],origin:'synthetic_history'});
  added.push(id);
 });return added;
}
