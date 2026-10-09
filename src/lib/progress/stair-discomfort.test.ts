import { describe,it,expect } from 'vitest';
import seed from '../../../data/demo/patients.seed.json';
import { STAIR_ASCENT_METRIC,stairAscentMeasurements } from './stair-discomfort';
import type { AppState,Observation } from '@/lib/types';

describe('stair-ascent measurement identity',()=>{
  it('never mixes pain, stair descent, other patients, unreviewed or future visits',()=>{
    const state=structuredClone(seed) as unknown as AppState;
    const visit=state.visits.find(v=>v.id===state.scenario_inputs[0].current_visit_id)!;
    const row={...state.observations[0],...STAIR_ASCENT_METRIC,id:'ascent',visit_id:visit.id,patient_id:visit.patient_id,value:0,measured_at:'2026-10-09T05:00:00Z',review_status:'reviewed',followup_answer_id:null} as Observation;
    const future={...visit,id:'future',scheduled_at:'2026-10-10T00:00:00Z'};state.visits.push(future);
    state.observations.push(row,{...row,id:'descent',activity_key:'stairs_down',value:9},{...row,id:'pain',instrument:'NRS',value:8},{...row,id:'other',patient_id:state.scenario_inputs[1].patient_id},{...row,id:'draft',review_status:'draft'},{...row,id:'future-score',visit_id:future.id,value:7});
    expect(stairAscentMeasurements(state,visit).map(v=>v.id)).toEqual(['ascent']);
  });
  it('uses the latest confirmed score per visit, retaining zero',()=>{
    const state=structuredClone(seed) as unknown as AppState;
    const visit=state.visits.find(v=>v.id===state.scenario_inputs[0].current_visit_id)!;
    const row={...state.observations[0],...STAIR_ASCENT_METRIC,id:'initial',visit_id:visit.id,patient_id:visit.patient_id,value:7,measured_at:'2026-10-09T05:00:00Z',review_status:'reviewed',followup_answer_id:null} as Observation;
    state.observations.push(row,{...row,id:'latest',value:0,measured_at:'2026-10-09T06:00:00Z'});
    expect(stairAscentMeasurements(state,visit).map(v=>[v.id,v.value])).toEqual([['latest',0]]);
  });
});
