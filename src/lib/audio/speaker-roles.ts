import type { Segment, SpeakerRole, SpeakerRoleAssignment, Transcript } from '@/lib/types';

export const speakerRoleLabels: Record<SpeakerRole, string> = { clinician: '의료진', patient: '환자', guardian: '보호자', unknown: '역할 미확인' };
export const isSpeakerRole = (value: unknown): value is SpeakerRole => typeof value === 'string' && Object.hasOwn(speakerRoleLabels, value);

// Compatibility for jobs recorded before raw speaker groups were stored in segments.
export function withRawSpeakerGroups(transcript: Transcript, rawSpeakers: Record<string, string> = {}, source?: Transcript): Transcript {
  return { ...transcript, segments: transcript.segments.map(segment => {
    const original = source?.segments.length === transcript.segments.length ? source.segments.find(item => item.ordinal === segment.ordinal && item.start_ms === segment.start_ms && item.end_ms === segment.end_ms && (item.start_ms !== null || item.text === segment.text)) : undefined;
    const rawSpeaker = segment.raw_speaker ?? original?.raw_speaker ?? rawSpeakers[segment.id] ?? (original ? rawSpeakers[original.id] : undefined);
    return { ...segment, source_segment_id: segment.source_segment_id ?? original?.source_segment_id ?? original?.id ?? segment.id, ...(rawSpeaker ? { raw_speaker: rawSpeaker } : {}) };
  }) };
}

export function effectiveSpeaker(segment: Segment, roles: Record<string, SpeakerRoleAssignment>): SpeakerRole {
  return segment.speaker_override ?? (segment.raw_speaker ? roles[segment.raw_speaker]?.role : undefined) ?? segment.speaker;
}

export function reviewSpeakerRoles(base: Transcript, latest: Transcript, groupChanges: Record<string, SpeakerRole>, segmentChanges: Record<string, SpeakerRole | null>): { segments: Segment[]; speaker_roles: Record<string, SpeakerRoleAssignment> } {
  const roles = { ...base.speaker_roles, ...latest.speaker_roles };
  for (const [group, role] of Object.entries(groupChanges)) roles[group] = { role, source: 'human' };
  const segments = base.segments.map(segment => {
    const sourceId = segment.source_segment_id ?? segment.id;
    const previous = latest.segments.find(item => (item.source_segment_id ?? item.id) === sourceId);
    const result = { ...segment, source_segment_id: sourceId };
    if (previous?.speaker_override !== undefined) result.speaker_override = previous.speaker_override;
    else if (previous && latest.status === 'reviewed' && !latest.speaker_roles && previous.speaker !== 'unknown') result.speaker_override = previous.speaker;
    // Legacy reviewed segment choices still survive subsequent revisions.
    if (previous && !previous.raw_speaker) result.speaker = previous.speaker;
    const key = [segment.id, sourceId, previous?.id].find(id => id && Object.hasOwn(segmentChanges, id));
    if (key) {
      if (segmentChanges[key] === null) delete result.speaker_override;
      else result.speaker_override = segmentChanges[key]!;
    }
    result.speaker = effectiveSpeaker(result, roles);
    return result;
  });
  return { segments, speaker_roles: roles };
}
