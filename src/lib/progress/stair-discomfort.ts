import type { AppState, Observation, Visit } from '@/lib/types';

export const STAIR_ASCENT_METRIC = {
  instrument: 'APP_FUNCTION_DISCOMFORT', metric_key: 'stair_ascent_discomfort',
  body_region: 'ankle', laterality: 'right', activity_key: 'stairs_up',
  measurement_context: 'stair_ascent_discomfort', unit: 'score', scale_min: 0, scale_max: 10,
} as const;

export function stairAscentMeasurements(state: AppState, visit: Visit): Observation[] {
  const eligibleVisits = new Set(state.visits.filter(v => v.patient_id === visit.patient_id && Date.parse(v.scheduled_at) <= Date.parse(visit.scheduled_at)).map(v => v.id));
  const measurements = state.observations.filter(row => row.patient_id === visit.patient_id && eligibleVisits.has(row.visit_id) && row.review_status === 'reviewed' && Object.entries(STAIR_ASCENT_METRIC).every(([key,value]) => row[key as keyof Observation] === value)).sort((a,b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  return [...new Map(measurements.map(row => [row.visit_id,row])).values()];
}
