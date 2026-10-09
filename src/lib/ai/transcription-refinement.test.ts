import { expect, it } from 'vitest';
import { alignTranscriptContent } from './transcription-alignment';
import { applyAlignmentReview, insertVerifiedReplies, type AudioRecheck } from './transcription-refinement';
import type { Segment } from '@/lib/types';
const s = (id: string, text: string, raw_speaker: string, start_ms: number): Segment => ({ id, ordinal: 1, text, raw_speaker, start_ms, end_ms: start_ms + 800, speaker: 'unknown' });
it('preserves whole questions and measurements while surfacing an absent short answer', () => {
  const source = [s('a','좌측은 43cm이고 우측은 45cm입니다.','A',0),s('b','여기는요?','A',1000),s('c','괜찮아요.','B',2000),s('d','오른쪽은 25도입니다.','A',3000)];
  const body = '좌측은 43cm이고 우측은 45cm입니다. 여기는요? 오른쪽은 25도입니다.';
  const result = alignTranscriptContent(body, source);
  expect(result.segments.map(s=>s.text).join('')).toBe(body);
  expect(result.segments.some(s=>s.text.trim()==='요?'||s.text.trim()==='여기는')).toBe(false);
  expect(result.segments.filter(s=>/43|25/.test(s.text)).every(s=>s.raw_speaker==='A')).toBe(true);
  expect(result.omissions.map(s=>s.id)).toContain('c');
  expect(result.unassigned_groups).toBe(result.segments.filter(s=>s.alignment_status==='review_needed').length);
  const check: AudioRecheck = { source_id:'c',start_ms:2000,end_ms:2800,text:'괜찮아요.',status:'confirmed',model:'test' };
  const repaired=insertVerifiedReplies(result.segments,source,[check]);
  expect(repaired.map(s=>s.text).join('')).toContain('여기는요? 괜찮아요. 오른쪽');
  expect(repaired.find(s=>s.alignment_method==='audio_recheck')?.raw_speaker).toBe('B');
  expect(insertVerifiedReplies(result.segments,source,[{...check,status:'conflict'}])).toEqual(result.segments);
});
it('does not accept a model pairing with invented source IDs, evidence, conflicting numbers or repeated fillers', () => {
  const original=s('source','우측은 45cm입니다.','A',0), target={...s('target','우측은 43cm입니다.','',0),alignment_status:'review_needed' as const};
  const a={...alignTranscriptContent(target.text,[original]),segments:[target],candidates:[{segment_id:'target',source_ids:['source']}]};
  for(const decision of [{segment_id:'target',source_id:'invented',source_quote:'우측은 43cm입니다.',reason:''},{segment_id:'target',source_id:'source',source_quote:original.text,reason:''}]) expect(applyAlignmentReview(a,[original],[decision])[0].alignment_status).toBe('review_needed');
});
