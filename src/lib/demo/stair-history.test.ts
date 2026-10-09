import { describe,it,expect } from 'vitest';
import seed from '../../../data/demo/patients.seed.json';
import type { AppState } from '@/lib/types';
import { addDemoStairHistory } from './stair-history';
const empty=()=>{const state=structuredClone(seed) as unknown as AppState;state.observations=state.observations.filter(row=>row.metric_key!=='stair_ascent_discomfort');return state;};
describe('explicit fictional stair history',()=>{
 it('adds only the three past adult visits and preserves source records and today',()=>{
  const state=empty(),before=structuredClone(state);const ids=addDemoStairHistory(state);
  expect(ids).toHaveLength(3);const rows=state.observations.filter(row=>ids.includes(row.id));
  expect(rows.map(row=>row.value)).toEqual([8,6,4]);expect(rows.every(row=>row.origin==='synthetic_history'&&row.source_refs[0].quote?.includes('가상 점수'))).toBe(true);
  expect(rows.some(row=>row.visit_id===state.scenario_inputs[0].current_visit_id)).toBe(false);
  expect(state.transcripts).toEqual(before.transcripts);expect(state.soap_documents).toEqual(before.soap_documents);
  expect(addDemoStairHistory(state)).toEqual([]);expect(state.observations.filter(row=>row.metric_key==='stair_ascent_discomfort')).toHaveLength(3);
 });
 it('preserves existing clinician scores and uses their compatible series without filling the child case',()=>{
  const state=structuredClone(seed) as unknown as AppState,rows=state.observations.filter(row=>row.metric_key==='stair_ascent_discomfort');
  const existing={...rows[0],value:0,origin:'manual_demo' as const,series_key:'clinician-series'};
  state.observations=state.observations.filter(row=>row.metric_key!=='stair_ascent_discomfort');state.observations.push(existing);
  const ids=addDemoStairHistory(state);expect(ids).toHaveLength(2);expect(state.observations.find(row=>row.id===existing.id)).toEqual(existing);
  expect(state.observations.filter(row=>ids.includes(row.id)).every(row=>row.series_key==='clinician-series'&&row.patient_id===state.scenario_inputs[0].patient_id)).toBe(true);
 });
});
