import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateClinicalAnalysis, type ClinicalAnalysisOutput } from './clinical-analysis';
import type { AppState, Transcript } from '@/lib/types';
const fixture=vi.hoisted(()=>({state:{} as AppState}));
vi.mock('@/lib/client',()=>({useAppState:()=>({data:{state:fixture.state,version:1,capabilities:{ai:true}},refresh:async()=>null})}));
import { ClinicalAnalysisReview } from '@/components/progress/ClinicalAnalysisReview';
const text='현재 오른쪽 발목 통증은 0점이에요.';
const transcript:Transcript={id:'t',clinic_id:'c',visit_id:'v',revision:1,status:'reviewed',source_asset_key:'manual_seed',origin:'manual_demo',text,segments:[{id:'s',ordinal:1,speaker:'patient',text,start_ms:0,end_ms:1000}]};
const output:ClinicalAnalysisOutput={answers:[],signals:[],missing_questions:[],measurements:[{item_key:'pain',subitem_key:'current_pain',instrument:'NRS',value:0,unit:'score',body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain',temporal:'current',evidence:[{segment_id:'s',quote:text}]}]};
beforeEach(()=>{ fixture.state={clinic:{id:'c'},visits:[{id:'v',clinic_id:'c',patient_id:'p'}],transcripts:[transcript],jobs:[{id:'j',clinic_id:'c',visit_id:'v',kind:'analysis',status:'waiting_review',created_at:'now',result:{task:'clinical_analysis',patientId:'p',transcriptId:'t',input_transcript_revision:1,...validateClinicalAnalysis(output,transcript)}}]} as unknown as AppState; });
describe('one canonical NRS editor',()=>{
  it('renders a matching NRS suggestion read-only with focus navigation and no duplicate edit/confirm value controls',()=>{
    const html=renderToStaticMarkup(React.createElement(ClinicalAnalysisReview,{visitId:'v',nrsTarget:{inputId:'today-nrs',metric_key:'pain_intensity',body_region:'ankle',laterality:'right',activity_key:null,measurement_context:'current_pain'}}));
    expect(html).toContain('현재 통증 NRS');expect(html).toContain('통증 NRS 입력으로 이동');expect(html).toContain('aria-controls="today-nrs"');expect(html).not.toContain('type="number"');expect(html).not.toContain('확인 후 반영');expect(html).not.toContain('후보 직접 수정');
  });
  it('retains standalone review compatibility and normal controls for other conditions',()=>{
    const standalone=renderToStaticMarkup(React.createElement(ClinicalAnalysisReview,{visitId:'v'}));expect(standalone).toContain('type="number"');expect(standalone).toContain('확인 후 반영');
    const other=renderToStaticMarkup(React.createElement(ClinicalAnalysisReview,{visitId:'v',nrsTarget:{inputId:'today-nrs',metric_key:'pain_intensity',body_region:'knee',laterality:'right',activity_key:null,measurement_context:'current_pain'}}));expect(other).toContain('type="number"');expect(other).toContain('확인 후 반영');
  });
});
