import type { AppState, SourceRef } from '@/lib/types';

export const PATIENT_SIGNAL_CATEGORIES = ['worry', 'effect_question', 'understanding_gap', 'practice_difficulty', 'open_question'] as const;
export type PatientSignalCategory = typeof PATIENT_SIGNAL_CATEGORIES[number];
export type ReviewedPatientSignal = {
  id: string; category: PatientSignalCategory; topic: string; text: string;
  source_refs: SourceRef[]; reviewed_at: string;
};
export type PatientSignalContext = ReviewedPatientSignal & {
  visit_id: string; visit_date: string; transcript_id: string; transcript_revision: number;
};
/** Only clinician-confirmed, quote-bound signals from the latest transcript of each visit. */
export function reviewedPatientSignals(state: AppState, patientId: string, throughVisitId: string): PatientSignalContext[] {
  const through = state.visits.find(v => v.id === throughVisitId && v.patient_id === patientId);
  if (!through) return [];
  const visits = state.visits.filter(v => v.patient_id === patientId && v.scheduled_at <= through.scheduled_at);
  return visits.flatMap(visit => {
    const latest = state.transcripts.filter(t => t.visit_id === visit.id).sort((a,b) => b.revision-a.revision)[0];
    if (!latest) return [];
    const jobs = state.jobs.filter(j => j.visit_id === visit.id && j.result?.task === 'clinical_analysis' && j.result?.transcriptId === latest.id && j.result?.input_transcript_revision === latest.revision && j.result?.stale_input !== true).sort((a,b) => b.created_at.localeCompare(a.created_at));
    const signals = jobs[0]?.result?.reviewed_signals;
    if (!Array.isArray(signals)) return [];
    return signals.flatMap((signal: unknown) => {
      if (!signal || typeof signal !== 'object') return [];
      const item = signal as ReviewedPatientSignal;
      if (typeof item.id !== 'string' || !PATIENT_SIGNAL_CATEGORIES.includes(item.category) || typeof item.text !== 'string' || typeof item.topic !== 'string' || typeof item.reviewed_at !== 'string' || !Array.isArray(item.source_refs) || !item.source_refs.length) return [];
      if (!item.source_refs.every(ref => ref.kind === 'provided_transcript' && typeof ref.quote === 'string' && ref.quote.trim() && latest.segments.some(segment => segment.id === ref.source_id && segment.text.includes(ref.quote!)))) return [];
      return [{ ...item, visit_id: visit.id, visit_date: visit.scheduled_at, transcript_id: latest.id, transcript_revision: latest.revision }];
    });
  });
}
