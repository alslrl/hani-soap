import { describe, expect, it } from 'vitest';
import { getTranscriptNrsProposal, prefillTranscriptAnswerDrafts, type NrsProposalMatch, type TranscriptAnswerDraft } from './clinical-analysis-drafts';
import { validateClinicalAnalysis, type ClinicalAnalysisOutput } from './clinical-analysis';
import type { AppState, Transcript } from '@/lib/types';
const text='현재 오른쪽 발목 통증은 0점이에요.';
const transcript: Transcript={id:'transcript',clinic_id:'clinic',visit_id:'visit',revision:1,status:'reviewed',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:'s',ordinal:1,speaker:'patient',text,start_ms:0,end_ms:1000}]};
const evidence=[{segment_id:'s',quote:text}];
const output: ClinicalAnalysisOutput={answers:[{item_key:'pain',subitem_key:'current_pain',text,temporal:'current',change:null,evidence}],measurements:[{item_key:'pain',subitem_key:'current_pain',instrument:'NRS',value:0,unit:'score',body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain',temporal:'current',evidence}],signals:[],missing_questions:[]};
const state=()=>({clinic:{id:'clinic'},visits:[{id:'visit',clinic_id:'clinic',patient_id:'patient'}],transcripts:[transcript],followup_answers:[],observations:[],jobs:[{id:'job',clinic_id:'clinic',visit_id:'visit',kind:'analysis',status:'waiting_review',created_at:'now',result:{task:'clinical_analysis',patientId:'patient',transcriptId:'transcript',input_transcript_revision:1,stale_input:false,...validateClinicalAnalysis(output,transcript)}}]} as unknown as AppState);
const drafts=():Record<string,TranscriptAnswerDraft>=>({'pain:current_pain':{item_key:'pain',subitem_key:'current_pain',answer_text:'',change:null,confirmation_status:'not_confirmed',applicability:'unknown'},'sleep:sleep_quality':{item_key:'sleep',subitem_key:'sleep_quality',answer_text:'',change:null,confirmation_status:'not_confirmed',applicability:'unknown'}});
const match:NrsProposalMatch={metric_key:'pain_intensity',instrument:'NRS',body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain'};
describe('transcript draft prefill and sole NRS proposal selection',()=>{
  it('prefills actual answered fields with unconfirmed values and leaves missing fields empty',()=>{
    const result=prefillTranscriptAnswerDrafts(state(),'visit',drafts());
    expect(result.drafts['pain:current_pain'].answer_text).toBe(text);expect(result.drafts['pain:current_pain'].confirmation_status).toBe('not_confirmed');expect(result.drafts['sleep:sleep_quality'].answer_text).toBe('');expect(result.bindings['pain:current_pain'].candidateId).toBeTruthy();expect(result.hasUnsavedAiDrafts).toBe(true);
  });
  it('never replaces stored clinician entries or any locally dirty answers/metrics',()=>{
    const existing=state();existing.followup_answers.push({id:'doctor',clinic_id:'clinic',patient_id:'patient',visit_id:'visit',item_key:'pain',subitem_key:'current_pain',question_text:'현재 통증',answer_text:'의료진 확인 3점',change:null,confirmation_status:'confirmed',applicability:'applicable',comparison_visit_id:null,source_refs:[{kind:'manual',source_id:null,quote:null,origin:'manual_demo'}],review_status:'reviewed',origin:'manual_demo'});
    const hydrated=drafts();hydrated['pain:current_pain'].answer_text='의료진 확인 3점';
    expect(prefillTranscriptAnswerDrafts(existing,'visit',hydrated).drafts['pain:current_pain'].answer_text).toBe('의료진 확인 3점');
    const dirty=drafts();dirty['sleep:sleep_quality'].answer_text='현재 편집 중';expect(prefillTranscriptAnswerDrafts(state(),'visit',dirty,true).drafts).toBe(dirty);
    const measured=state();measured.observations.push({visit_id:'visit',...match,value:3} as any);expect(getTranscriptNrsProposal(measured,'visit',match)).toBeUndefined();
    expect(state().observations).toEqual([]);
  });
  it('matches canonical current NRS0 with source and rejects vague sites, other conditions, past sources and guardian frequency',()=>{
    const current=state();expect(getTranscriptNrsProposal(current,'visit',match)).toMatchObject({jobId:'job',patientId:'patient',transcriptRevision:1,candidate:{value:0}});
    expect(getTranscriptNrsProposal(current,'visit',{...match,laterality:'left'})).toBeUndefined();expect(getTranscriptNrsProposal(current,'visit',{...match,activity_key:'walking'})).toBeUndefined();expect(getTranscriptNrsProposal(current,'visit',{...match,measurement_context:'rest_pain'})).toBeUndefined();
    const candidate=(current.jobs[0].result!.candidates as any[]).find(c=>c.kind==='measurement');candidate.body_region=null;expect(getTranscriptNrsProposal(current,'visit',match)).toBeUndefined();candidate.body_region='무릎';expect(getTranscriptNrsProposal(current,'visit',match)).toBeUndefined();candidate.body_region='발목';expect(getTranscriptNrsProposal(current,'visit',match)).toBeTruthy();candidate.instrument='FREQUENCY';expect(getTranscriptNrsProposal(current,'visit',match)).toBeUndefined();
    current.transcripts.push({...transcript,id:'new',revision:2});expect(getTranscriptNrsProposal(current,'visit',match)).toBeUndefined();expect(prefillTranscriptAnswerDrafts(current,'visit',drafts()).hasUnsavedAiDrafts).toBe(false);
  });
});
