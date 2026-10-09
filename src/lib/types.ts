// Seed entity types generated from data/demo/demo.schema.json.
export type SourceRef = {
  kind: "provided_transcript" | "demo_transcript" | "manual" | "care_response" | "seed_snapshot";
  source_id: string | null;
  quote: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type Patient = {
  id: string;
  clinic_id: string;
  demo_key: "A" | "B";
  display_name: string;
  sex: "female" | "male" | "unspecified";
  birth_date: string;
  chief_complaint: string;
  portrait_asset_key: "demo-adult-01" | "demo-child-01";
  guardian: {
  display_name: string;
  relationship: string;
} | null;
  contact_phone: null;
  contact_email: null;
  notes: string | null;
  is_demo: true;
};

export type Visit = {
  id: string;
  clinic_id: string;
  patient_id: string;
  visit_no: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  workflow_status: "waiting" | "in_progress" | "completed";
  record_status: "empty" | "draft" | "review_needed" | "approved";
  reason: string;
  summary: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
  is_demo: true;
};

export type Segment = {
  id: string;
  ordinal: number;
  speaker: "clinician" | "patient" | "guardian" | "unknown";
  text: string;
  start_ms: number | null;
  end_ms: number | null;
};

export type Transcript = {
  id: string;
  clinic_id: string;
  visit_id: string;
  revision: number;
  status: "raw" | "reviewed";
  source_asset_key: "video1" | "video2" | "revisit_script" | "manual_seed";
  text: string;
  segments: (Segment)[];
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type SoapDocument = {
  id: string;
  clinic_id: string;
  visit_id: string;
  revision: number;
  input_transcript_id: string | null;
  status: "draft" | "approved";
  sections: {
  s: string;
  o: string;
  a: string;
  p: string;
};
  source_refs: (SourceRef)[];
  approved_at: string | null;
  approved_by: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type Treatment = {
  id: string;
  clinic_id: string;
  visit_id: string;
  modality: "acupuncture" | "pharmacopuncture" | "moxibustion" | "cupping" | "tuina";
  technique: "standard_acupuncture" | "needle_knife" | "other" | null;
  body_region: string;
  laterality: "left" | "right" | "bilateral" | "midline" | "not_applicable";
  acupoints: ({
  code: string;
  label_ko: string;
})[];
  status: "suggested" | "confirmed";
  source: "manual" | "realtime_candidate" | "carried_over";
  notes: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
  locations?: (TreatmentLocation)[];
};

export type FollowupAnswer = {
  id: string;
  clinic_id: string;
  patient_id: string;
  visit_id: string;
  item_key: "chief_complaint" | "pain" | "function_daily" | "treatment_response" | "medication" | "discomfort" | "sleep" | "appetite_digestion" | "bowel_urine" | "temperature_sweat_energy" | "lifestyle" | "questions_concerns";
  subitem_key: string;
  question_text: string;
  answer_text: string | null;
  change: "improved" | "same" | "worsened" | "unclear" | null;
  confirmation_status: "confirmed" | "mentioned_only" | "not_confirmed";
  applicability: "applicable" | "not_applicable" | "unknown";
  comparison_visit_id: string | null;
  source_refs: (SourceRef)[];
  review_status: "draft" | "reviewed";
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type Observation = {
  id: string;
  clinic_id: string;
  patient_id: string;
  visit_id: string;
  followup_answer_id: string | null;
  metric_key: string;
  series_key: string;
  instrument: "NRS" | "APP_FUNCTION_DISCOMFORT" | "SYMPTOM_BOTHER" | "FREQUENCY";
  value: number;
  unit: string;
  scale_min: number | null;
  scale_max: number | null;
  body_region: string | null;
  laterality: "left" | "right" | "bilateral" | "midline" | "not_applicable" | null;
  activity_key: string | null;
  measurement_context: string;
  measured_at: string;
  review_status: "draft" | "reviewed";
  source_refs: (SourceRef)[];
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type FollowupItem = {
  id: string;
  clinic_id: string;
  patient_id: string;
  source_visit_id: string;
  item_key: "chief_complaint" | "pain" | "function_daily" | "treatment_response" | "medication" | "discomfort" | "sleep" | "appetite_digestion" | "bowel_urine" | "temperature_sweat_energy" | "lifestyle" | "questions_concerns";
  title: string;
  status: "pending" | "resolved";
  resolved_visit_id: string | null;
  source_refs: (SourceRef)[];
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type MedicationCourse = {
  id: string;
  clinic_id: string;
  patient_id: string;
  source_visit_id: string;
  medication_name: string | null;
  start_date: string;
  end_date: string | null;
  daily_frequency: number | null;
  instructions: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type CareMessage = {
  id: string;
  clinic_id: string;
  patient_id: string;
  visit_id: string;
  medication_course_id: string | null;
  stage: "visit_summary" | "day3" | "week1" | "end_minus3";
  scheduled_at: string;
  draft_body: string;
  approved_body: string | null;
  approved_at: string | null;
  delivered_at: string | null;
  delivery_mode: "preview" | "mock" | "kakao_self";
  status: "draft" | "approved" | "sent" | "failed" | "unknown";
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type CareResponse = {
  id: string;
  clinic_id: string;
  patient_id: string;
  message_id: string;
  option: "taking_well" | "discomfort" | "improving" | "unsure" | "will_book" | "will_wait";
  detail: "stomach_discomfort" | "difficulty_taking" | "other" | null;
  received_at: string;
  source: "demo_simulation" | "kakao_self_link";
  event_key: string;
  origin: "synthetic_response";
};

export type ContactTask = {
  id: string;
  clinic_id: string;
  patient_id: string;
  response_id: string;
  reason: string;
  status: "open" | "closed";
  resolution_note: string | null;
  closed_by: string | null;
  closed_at: string | null;
  origin: "provided_case" | "synthetic_history" | "synthetic_response" | "manual_demo";
};

export type ScenarioInput = {
  demo_key: "A" | "B";
  patient_id: string;
  current_visit_id: string;
  provided_audio_key: "video1" | "video2";
  followup_script_key: "revisit_script" | null;
  source_documents: (string)[];
};

export type TreatmentLocation = {
  location_type: "acupoint" | "ashi" | "tenderness_point";
  acupoint_code: string | null;
  label_ko: string | null;
  body_region: string;
  laterality: "left" | "right" | "bilateral" | "midline" | "not_applicable";
  location_note: string;
  annotation_id: string | null;
  finding_ref: string | null;
};

export type DemoData = {
  meta: {
  schema_version: "1.0.0";
  is_demo: true;
  timezone: "Asia/Seoul";
  demo_today: "2026-10-09";
  generated_at: string;
  origin_note: string;
};
  clinic: {
  id: string;
  name: string;
  timezone: "Asia/Seoul";
};
  patients: (Patient)[];
  visits: (Visit)[];
  transcripts: (Transcript)[];
  soap_documents: (SoapDocument)[];
  treatments: (Treatment)[];
  followup_answers: (FollowupAnswer)[];
  observations: (Observation)[];
  followup_items: (FollowupItem)[];
  medication_courses: (MedicationCourse)[];
  care_messages: (CareMessage)[];
  care_responses: (CareResponse)[];
  contact_tasks: (ContactTask)[];
  scenario_inputs: (ScenarioInput)[];
};

export type AnnotationStroke = {
  id: string;
  points: { x: number; y: number; t: number; pressure?: number }[];
  kind: 'memo' | 'check';
  created_at: string;
};
export type RuntimeAnnotation = {
  id: string; clinic_id: string; visit_id: string;
  scope: 'treatment'; modality: Treatment['modality']; technique: Treatment['technique'];
  view: 'front' | 'back'; coordinate_space: 'normalized'; coordinate_version: 'body-map-v1' | 'body-map-v2';
  canvas_size: { width: number; height: number }; strokes: AnnotationStroke[];
  revision: number; updated_at: string; extracted_text?: string | null;
  extraction_reviewed?: boolean;
};
export type RuntimeRecording = {
  id: string; clinic_id: string; visit_id: string; audio_session_id?: string | null;
  source: 'microphone' | 'upload' | 'demo_asset'; filename: string; mime_type: string;
  size_bytes: number; object_path: string; created_at: string;
  status: 'recording' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed';
  duration_ms?: number | null; error?: string | null;
  upload_token_hash?: string; upload_expires_at?: string;
};
export type RuntimeJob = {
  id: string; clinic_id: string; visit_id: string; recording_id?: string | null;
  kind: 'transcription' | 'soap' | 'care' | 'handwriting' | 'analysis';
  status: 'queued' | 'running' | 'waiting_review' | 'completed' | 'failed';
  stage: string; created_at: string; updated_at: string; input_hash: string;
  input_version?: number; session_id?: string; run_id?: string | null;
  error?: string | null; result?: Record<string, unknown> | null;
};
export type RuntimeAudioSession = {
  id: string; clinic_id: string; visit_id: string;
  status: 'recording' | 'stopped' | 'failed'; started_at: string;
  stopped_at?: string | null; live_text?: string; owner_session_id?: string; live_item_ids?: string[];
  live_turns?: { item_id: string; ordinal: number; text: string }[];
};
export type RuntimeLiveEvent = {
  id: string; clinic_id: string; visit_id: string; audio_session_id?: string | null;
  text: string; modality: Treatment['modality']; technique: Treatment['technique'];
  context: 'current' | 'planned' | 'past' | 'negated' | 'unclear';
  status: 'suggested' | 'accepted' | 'dismissed'; created_at: string;
};
export type AppState = DemoData & {
  annotations: RuntimeAnnotation[]; recordings: RuntimeRecording[]; jobs: RuntimeJob[];
  audioSessions: RuntimeAudioSession[]; live_events: RuntimeLiveEvent[];
  liveProcedureEvents: RuntimeLiveEvent[];
};
export type StateEnvelope = {
  state: AppState; version: number; storage: 'local' | 'supabase';
  capabilities: { ai: boolean; live: boolean };
};
export type ActionRequest = { type: string; payload: Record<string, unknown>; expectedVersion?: number };
export type ApiError = { error: string; code: string; details?: unknown };
export type Annotation = RuntimeAnnotation;
export type Recording = RuntimeRecording;
export type Job = RuntimeJob;
export type AudioSession = RuntimeAudioSession;
export type LiveProcedureEvent = RuntimeLiveEvent;
