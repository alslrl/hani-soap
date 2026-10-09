import { expect, it } from 'vitest';
import { transcriptFacts, checkFactCoverage } from './soap-coverage';
import type { Segment } from '@/lib/types';
const segment=(id:string,text:string,speaker:Segment['speaker']):Segment=>({id,text,speaker,ordinal:1,start_ms:null,end_ms:null});
it('distinguishes missing measurements from unknown speakers and questions',()=>{
 const facts=transcriptFacts([segment('measure','좌측은 43cm, 우측은 45cm입니다.','clinician'),segment('pain','8점 정도예요.','patient'),segment('question','통증이 8점인가요?','clinician'),segment('unknown','우측 부종이 있습니다.','unknown')]);
 expect(facts.map(f=>f.segment_id)).toEqual(['measure','pain','unknown']);
 const coverage=checkFactCoverage(facts,{sections:{s:'통증 8점',o:'좌측 43cm',a:'',p:''},evidence:[{section:'s',segment_id:'pain',quote:'8점 정도예요.'},{section:'o',segment_id:'measure',quote:'좌측은 43cm, 우측은 45cm입니다.'}]});
 expect(coverage.map(f=>[f.segment_id,f.covered])).toEqual([['measure',false],['pain',true],['unknown',false]]);
 expect(transcriptFacts([segment('identity','2002년 9월 17일 홍민주입니다.','patient')])).toEqual([]);
 expect(checkFactCoverage([facts[1]],{sections:{s:'통증 18점',o:'',a:'',p:''},evidence:[{section:'s',segment_id:'pain',quote:'8점 정도예요.'}]} )[0].covered).toBe(false);
});
