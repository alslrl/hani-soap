import { describe, expect, it } from 'vitest';
import { validateSpeakerInference } from './speaker-inference';
import { normalizeDiarizedTranscript } from './transcribe';
import { reviewSpeakerRoles, effectiveSpeaker, withRawSpeakerGroups } from '@/lib/audio/speaker-roles';
import type { Transcript } from '@/lib/types';
const result = normalizeDiarizedTranscript({ segments: [{ speaker: 'B', text: '언제부터 아프셨나요?' }, { speaker: 'A', text: '제가 어제부터 아파요.' }, { speaker: 'A', text: '여기가 아파요.' }] });
const raw: Transcript = { id: 'raw', clinic_id: 'clinic', visit_id: 'visit', revision: 1, status: 'raw', source_asset_key: 'manual_seed', text: result.text, origin: 'manual_demo', segments: result.segments, speaker_roles: { B: { role: 'clinician', source: 'inferred' }, A: { role: 'patient', source: 'inferred' } } };
describe('speaker roles and durable precedence', () => {
  it('requires exact group evidence; absent or wrong-group evidence stays unknown', () => {
    const roles = validateSpeakerInference([{ group: 'B', role: 'clinician', evidence: [{ segment_id: raw.segments[0].id, quote: '언제부터 아프셨나요?' }] }, { group: 'A', role: 'patient', evidence: [{ segment_id: raw.segments[0].id, quote: '언제부터 아프셨나요?' }] }], raw.segments);
    expect(roles.B.role).toBe('clinician'); expect(roles.A.role).toBe('unknown');
    expect(validateSpeakerInference([], raw.segments).A.role).toBe('unknown');
    expect(() => validateSpeakerInference([{ group: 'invented', role: 'patient', evidence: [] }], raw.segments)).toThrow();
  });
  it('recovers a legacy reviewed group from unchanged timed boundaries and preserves its human role', () => {
    const timed = { ...raw, segments: raw.segments.map((segment, i) => ({ ...segment, start_ms: i * 1000, end_ms: (i + 1) * 1000 })) };
    const legacy = { ...timed, status: 'reviewed' as const, speaker_roles: undefined, segments: timed.segments.map(segment => ({ ...segment, id: `legacy-${segment.id}`, source_segment_id: undefined, raw_speaker: undefined, speaker: 'guardian' as const })) };
    const restored = withRawSpeakerGroups(legacy, {}, timed);
    expect(restored.segments.map(segment => segment.raw_speaker)).toEqual(['B', 'A', 'A']);
    expect(reviewSpeakerRoles(timed, restored, {}, {}).segments.every(segment => segment.speaker === 'guardian')).toBe(true);
  });
  it('group changes apply to all members while explicit segment overrides survive new IDs and later group changes', () => {
    const first = reviewSpeakerRoles(raw, raw, { A: 'guardian' }, { [raw.segments[1].id]: 'patient' });
    expect(first.segments.map(s => s.speaker)).toEqual(['clinician', 'patient', 'guardian']);
    const latest = { ...raw, ...first, segments: first.segments.map(s => ({ ...s, id: `new-${s.id}` })) };
    const second = reviewSpeakerRoles(raw, latest, { A: 'unknown' }, {});
    expect(second.segments.map(s => s.speaker)).toEqual(['clinician', 'patient', 'unknown']);
    const reset = reviewSpeakerRoles(raw, latest, { A: 'guardian' }, { [latest.segments[1].id]: null });
    expect(reset.segments[1].speaker_override).toBeUndefined();
    expect(effectiveSpeaker(reset.segments[1], reset.speaker_roles)).toBe('guardian');
    expect(raw.segments.every(s => s.speaker === 'unknown')).toBe(true);
  });
});
