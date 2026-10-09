import type { Segment, SpeakerRole, SpeakerRoleAssignment } from '@/lib/types';

export type SpeakerInference = { group: string; role: SpeakerRole; evidence: { segment_id: string; quote: string }[] };

export function validateSpeakerInference(decisions: SpeakerInference[], segments: Segment[]): Record<string, SpeakerRoleAssignment> {
  const groups = [...new Set(segments.flatMap(segment => segment.raw_speaker ? [segment.raw_speaker] : []))];
  if (new Set(decisions.map(item => item.group)).size !== decisions.length || decisions.some(item => !groups.includes(item.group))) throw new Error('SPEAKER_GROUP_INVALID');
  return Object.fromEntries(groups.map(group => {
    const decision = decisions.find(item => item.group === group);
    const evidence = decision?.evidence.filter(item => segments.some(segment => segment.id === item.segment_id && segment.raw_speaker === group && item.quote.trim() && segment.text.includes(item.quote))) ?? [];
    // A concrete role requires an exact quote from that speaker; absent/invalid evidence abstains.
    const role = decision && evidence.length === decision.evidence.length && evidence.length > 0 ? decision.role : 'unknown';
    return [group, { role, source: 'inferred', evidence: evidence.map(item => item.quote) }];
  }));
}
