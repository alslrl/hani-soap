import { describe, expect, it } from 'vitest';
import { sourceMeasurementConditions, clinicalMeasurementMetricKey } from './clinical-measurement-conditions';
import { getTranscriptNrsProposal, getTranscriptStairProposal, matchesTranscriptStairCandidate } from './clinical-analysis-drafts';
import { analysisTarget } from './clinical-analysis-review';
import { validateClinicalAnalysis, type ClinicalAnalysisOutput } from './clinical-analysis';
import type { AppState, Transcript } from '@/lib/types';
function fixture(text:string,instrument:'NRS'|'APP_FUNCTION_DISCOMFORT'='NRS',value=5) {
  const transcript:Transcript={id:'t',clinic_id:'c',visit_id:'v',revision:1,status:'reviewed',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:'s',ordinal:1,speaker:'patient',text,start_ms:null,end_ms:null}]};
  const item:ClinicalAnalysisOutput['measurements'][number]={item_key:instrument==='NRS'?'pain':'function_daily',subitem_key:instrument==='NRS'?'current_pain':'daily_activity',instrument,value,unit:'score',body_region:'right ankle',laterality:'left',activity_key:'made_up',measurement_context:'우측 발목 주관적 점수',temporal:'current',evidence:[{segment_id:'s',quote:text}]};
  const output=validateClinicalAnalysis({answers:[],measurements:[item],signals:[],missing_questions:[]},transcript);
  const candidate=output.candidates[0];
  const state={clinic:{id:'c'},visits:[{id:'v',clinic_id:'c',patient_id:'p'}],transcripts:[transcript],followup_answers:[],observations:[],jobs:[{id:'j',clinic_id:'c',visit_id:'v',kind:'analysis',status:'waiting_review',created_at:'now',result:{task:'clinical_analysis',patientId:'p',transcriptId:'t',input_transcript_revision:1,...output}}]} as unknown as AppState;
  return {transcript,item,candidate,state};
}
const main={metric_key:'pain_intensity',instrument:'NRS',body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain'} as const;
describe('source-explicit canonical measurement conditions',()=>{
  it('maps explicit current right ankle NRS to the sole canonical panel, ignoring arbitrary provider labels',()=>{
    const {candidate,state}=fixture('현재 오른쪽 발목 통증은 5점이에요.');expect(candidate).toMatchObject({body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain'});expect(getTranscriptNrsProposal(state,'v',main)?.candidate.value).toBe(5);
  });
  it('does not fabricate a region/side or map rest, other activity, mixed activity or past site to generic current pain',()=>{
    const vague=fixture('현재 통증은 5점이에요.');expect(vague.candidate).toMatchObject({body_region:null,laterality:null});expect(getTranscriptNrsProposal(vague.state,'v',main)).toBeUndefined();
    const rest=fixture('현재 오른쪽 발목은 가만히 있을 때 통증이 0점이에요.','NRS',0);expect(rest.candidate).toMatchObject({activity_key:'rest',measurement_context:'rest_pain'});expect(getTranscriptNrsProposal(rest.state,'v',main)).toBeUndefined();
    const historic=fixture('지난번 오른쪽 발목은 8점이었고 지금 통증은 5점이에요.');expect(historic.candidate).toMatchObject({body_region:null,laterality:null});
    const mixed=fixture('현재 오른쪽 발목은 계단 오르기와 내려가기 모두 통증이 5점이에요.');expect(sourceMeasurementConditions(mixed.item,mixed.transcript).activity_key).toBeNull();expect(getTranscriptNrsProposal(mixed.state,'v',main)).toBeUndefined();
  });
  it('extracts current stairs-up discomfort as its own metric and preserves descending or ambiguous directions',()=>{
    const up=fixture('지금 오른쪽 발목은 계단을 오를 때 불편이 3점이에요.','APP_FUNCTION_DISCOMFORT',3);expect(up.candidate).toMatchObject({body_region:'ankle',laterality:'right',activity_key:'stairs_up',measurement_context:'stair_ascent_discomfort'});expect(matchesTranscriptStairCandidate(up.candidate)).toBe(true);expect(getTranscriptStairProposal(up.state,'v')?.candidate.value).toBe(3);if(up.candidate.kind==='measurement')expect(clinicalMeasurementMetricKey(up.candidate)).toBe('stair_ascent_discomfort');
    const down=fixture('지금 오른쪽 발목은 계단을 내려갈 때 불편이 3점이에요.','APP_FUNCTION_DISCOMFORT',3);expect(getTranscriptStairProposal(down.state,'v')).toBeUndefined();
    const unclear=fixture('현재 오른쪽 발목은 계단 이용 시 불편이 3점이에요.','APP_FUNCTION_DISCOMFORT',3);expect(getTranscriptStairProposal(unclear.state,'v')).toBeUndefined();
  });
  it('keeps conflict detection separated by metric/context/activity even when a follow-up answer ID is shared, while accepting Korean ankle labels',()=>{
    const up=fixture('현재 우측 발목은 계단 올라갈 때 불편이 3점이에요.','APP_FUNCTION_DISCOMFORT',3);
    up.state.followup_answers.push({id:'answer',visit_id:'v',item_key:'function_daily',subitem_key:'daily_activity'} as any);
    const base={visit_id:'v',instrument:'APP_FUNCTION_DISCOMFORT',unit:'score',body_region:'발목',laterality:'right',activity_key:'stairs_up',followup_answer_id:'answer',value:4};
    up.state.observations.push({...base,id:'other',metric_key:'function_discomfort',measurement_context:'current_function_discomfort'} as any);
    expect(analysisTarget(up.state,'v',up.candidate).occupied).toBe(false);
    up.state.observations.push({...base,id:'same',metric_key:'stair_ascent_discomfort',measurement_context:'stair_ascent_discomfort'} as any);
    expect(analysisTarget(up.state,'v',up.candidate).metrics.map(metric=>metric.id)).toEqual(['same']);expect(getTranscriptStairProposal(up.state,'v')).toBeUndefined();
  });
});
