import { describe, expect, it } from 'vitest';
import { detectProcedures } from './procedure-detector';

describe('live procedure candidates', () => {
  it('matches specific terms before the generic needle', () => {
    expect(detectProcedures('지금 도침을 합니다. 약침을 합니다. 침을 놓고 있어요.').map(({ modality, technique }) => [modality, technique])).toEqual([
      ['acupuncture', 'needle_knife'], ['pharmacopuncture', null], ['acupuncture', 'standard_acupuncture'],
    ]);
  });
  it('does not interpret common Korean words as acupuncture', () => {
    expect(detectProcedures('아침부터 기침을 했어요. 침대에 누워 침착하게 기다립니다. 이침을 할 계획입니다.')).toEqual([]);
  });
  it('keeps plans, previous treatment and negations separate', () => {
    expect(detectProcedures('약침을 할게요. 지난번 침을 맞았어요. 도침은 하지 않을게요.').map((candidate) => candidate.context)).toEqual(['planned', 'past', 'negated']);
  });
  it('does not spread a negation to the next procedure', () => {
    expect(detectProcedures('침은 안 하고 약침을 할게요.').map((candidate) => candidate.context)).toEqual(['negated', 'planned']);
  });
  it('leaves a standalone procedure mention unclear', () => {
    expect(detectProcedures('약침이요?')[0].context).toBe('unclear');
  });
  it('separates present instructions from past context in one sentence', () => {
    expect(detectProcedures('지난번 침을 맞았고 오늘 약침을 합니다.').map((candidate) => candidate.context)).toEqual(['past', 'current']);
  });
});
