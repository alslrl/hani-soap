-- PIN-authenticated demo. Browser roles have no access to clinical tables or RPCs.
-- All changes pass through the server, and the snapshot + relational projections commit together.
create table public.clinics (
  id uuid primary key, name text not null, timezone text not null default 'Asia/Seoul', payload jsonb not null
);
create table public.demo_state (
  clinic_id uuid primary key references public.clinics(id), version bigint not null check (version > 0),
  state jsonb not null, updated_at timestamptz not null default now()
);
create table public.demo_state_revisions (
  clinic_id uuid not null references public.clinics(id), version bigint not null,
  state jsonb not null, saved_at timestamptz not null default now(), primary key (clinic_id, version)
);
create table public.patients (
  id uuid primary key,
  clinic_id uuid not null,
  display_name text not null,
  payload jsonb not null,
  unique (id, clinic_id),
  foreign key (clinic_id) references public.clinics(id)
);
create table public.visits (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  visit_no integer not null,
  workflow_status text not null,
  record_status text not null,
  scheduled_at timestamptz not null,
  payload jsonb not null,
  unique (id, clinic_id),
  unique (id, clinic_id, patient_id),
  unique (patient_id, visit_no),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id),
  check (workflow_status in ('waiting','in_progress','completed')),
  check (record_status in ('empty','draft','review_needed','approved'))
);
create table public.transcripts (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  revision integer not null,
  status text not null,
  payload jsonb not null,
  unique (visit_id, revision),
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);
create table public.visit_documents (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  revision integer not null,
  status text not null,
  payload jsonb not null,
  unique (visit_id, revision),
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id),
  check (status in ('draft','approved'))
);
create table public.treatment_entries (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  modality text not null,
  status text not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id),
  check (status in ('suggested','confirmed'))
);
create table public.followup_answers (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  visit_id uuid not null,
  item_key text not null,
  subitem_key text not null,
  payload jsonb not null,
  unique (visit_id, item_key, subitem_key),
  foreign key (visit_id, clinic_id, patient_id) references public.visits(id, clinic_id, patient_id)
);
create table public.observations (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  visit_id uuid not null,
  instrument text not null,
  value numeric not null,
  series_key text not null,
  measured_at timestamptz not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id, patient_id) references public.visits(id, clinic_id, patient_id),
  check (instrument <> 'NRS' or (value between 0 and 10 and payload->>'metric_key' = 'pain_intensity'))
);
create table public.followup_items (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  source_visit_id uuid not null,
  status text not null,
  payload jsonb not null,
  foreign key (source_visit_id, clinic_id, patient_id) references public.visits(id, clinic_id, patient_id)
);
create table public.medication_courses (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  source_visit_id uuid not null,
  payload jsonb not null,
  foreign key (source_visit_id, clinic_id, patient_id) references public.visits(id, clinic_id, patient_id)
);
create table public.care_messages (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  visit_id uuid not null,
  stage text not null,
  status text not null,
  payload jsonb not null,
  unique (id, clinic_id, patient_id),
  foreign key (visit_id, clinic_id, patient_id) references public.visits(id, clinic_id, patient_id),
  check (status not in ('approved','sent') or (nullif(payload->>'approved_body','') is not null and payload->>'approved_at' is not null)),
  check (status <> 'sent' or (payload->>'delivered_at' is not null and payload->>'delivery_mode' <> 'preview'))
);
create table public.care_responses (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  message_id uuid not null,
  event_key text not null,
  payload jsonb not null,
  unique (id, clinic_id, patient_id),
  unique (event_key),
  foreign key (message_id, clinic_id, patient_id) references public.care_messages(id, clinic_id, patient_id)
);
create table public.contact_tasks (
  id uuid primary key,
  clinic_id uuid not null,
  patient_id uuid not null,
  response_id uuid not null,
  status text not null,
  payload jsonb not null,
  foreign key (response_id, clinic_id, patient_id) references public.care_responses(id, clinic_id, patient_id)
);
create table public.treatment_annotations (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  modality text not null,
  view text not null,
  revision integer not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);
create table public.recordings (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  object_path text not null,
  status text not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);
create table public.ai_jobs (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  status text not null,
  input_hash text not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);
create table public.audio_sessions (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  status text not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);
create table public.live_events (
  id uuid primary key,
  clinic_id uuid not null,
  visit_id uuid not null,
  status text not null,
  payload jsonb not null,
  foreign key (visit_id, clinic_id) references public.visits(id, clinic_id)
);

create table public.demo_sessions (
  id uuid primary key, token_hash text not null unique, pin_version text not null,
  created_at timestamptz not null, expires_at timestamptz not null
);
create table public.demo_access_attempts (
  id bigint generated always as identity primary key, ip_hash text not null, attempted_at timestamptz not null default now()
);
create table public.demo_ai_attempts (
  id bigint generated always as identity primary key, session_id uuid not null references public.demo_sessions(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index demo_sessions_expiry_idx on public.demo_sessions(expires_at);
create index demo_access_attempts_time_idx on public.demo_access_attempts(attempted_at);
create index demo_access_attempts_ip_time_idx on public.demo_access_attempts(ip_hash, attempted_at);
create index demo_ai_attempts_session_time_idx on public.demo_ai_attempts(session_id, attempted_at);
create index patients_clinic_idx on public.patients(clinic_id);
create index visits_patient_idx on public.visits(patient_id);
create index visits_clinic_idx on public.visits(clinic_id);
create index transcripts_visit_idx on public.transcripts(visit_id);
create index transcripts_clinic_idx on public.transcripts(clinic_id);
create index visit_documents_visit_idx on public.visit_documents(visit_id);
create index visit_documents_clinic_idx on public.visit_documents(clinic_id);
create index treatment_entries_visit_idx on public.treatment_entries(visit_id);
create index treatment_entries_clinic_idx on public.treatment_entries(clinic_id);
create index followup_answers_visit_idx on public.followup_answers(visit_id);
create index followup_answers_patient_idx on public.followup_answers(patient_id);
create index followup_answers_clinic_idx on public.followup_answers(clinic_id);
create index observations_visit_idx on public.observations(visit_id);
create index observations_patient_idx on public.observations(patient_id);
create index observations_clinic_idx on public.observations(clinic_id);
create index followup_items_patient_idx on public.followup_items(patient_id);
create index followup_items_clinic_idx on public.followup_items(clinic_id);
create index medication_courses_patient_idx on public.medication_courses(patient_id);
create index medication_courses_clinic_idx on public.medication_courses(clinic_id);
create index care_messages_visit_idx on public.care_messages(visit_id);
create index care_messages_patient_idx on public.care_messages(patient_id);
create index care_messages_clinic_idx on public.care_messages(clinic_id);
create index care_responses_patient_idx on public.care_responses(patient_id);
create index care_responses_clinic_idx on public.care_responses(clinic_id);
create index contact_tasks_patient_idx on public.contact_tasks(patient_id);
create index contact_tasks_clinic_idx on public.contact_tasks(clinic_id);
create index treatment_annotations_visit_idx on public.treatment_annotations(visit_id);
create index treatment_annotations_clinic_idx on public.treatment_annotations(clinic_id);
create index recordings_visit_idx on public.recordings(visit_id);
create index recordings_clinic_idx on public.recordings(clinic_id);
create index ai_jobs_visit_idx on public.ai_jobs(visit_id);
create index ai_jobs_clinic_idx on public.ai_jobs(clinic_id);
create index audio_sessions_visit_idx on public.audio_sessions(visit_id);
create index audio_sessions_clinic_idx on public.audio_sessions(clinic_id);
create index live_events_visit_idx on public.live_events(visit_id);
create index live_events_clinic_idx on public.live_events(clinic_id);
create index observations_series_time_idx on public.observations(series_key, measured_at);
create index ai_jobs_active_idx on public.ai_jobs(clinic_id, status) where status in ('queued','running');
create index contact_tasks_open_idx on public.contact_tasks(clinic_id, patient_id) where status = 'open';

create or replace function public.hani_commit_state(p_clinic_id uuid, p_expected_version bigint, p_state jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  current_version bigint := 0;
  current_state jsonb;
  row_data jsonb;
  previous jsonb;
  next_row jsonb;
begin
  if p_clinic_id <> '6c8ad2ac-7ed0-5688-9784-cd287f2a7b51'::uuid or p_state#>>'{clinic,id}' <> p_clinic_id::text then
    raise exception 'CLINIC_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text, 0));
  select version, state into current_version, current_state from public.demo_state where clinic_id = p_clinic_id for update;
  current_version := coalesce(current_version, 0);
  if current_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if jsonb_array_length(p_state->'patients') <> 2 then raise exception 'PATIENT_SCOPE_MISMATCH'; end if;
  if (select count(*) from jsonb_array_elements(p_state->'jobs') v where v->>'status' in ('queued','running')) > 2 then
    raise exception 'AI_CONCURRENCY_LIMIT';
  end if;
  if current_state is not null then
    for previous in select value from jsonb_array_elements(current_state->'transcripts') loop
      select value into next_row from jsonb_array_elements(p_state->'transcripts') where value->>'id' = previous->>'id';
      if next_row is distinct from previous then raise exception 'IMMUTABLE_TRANSCRIPT'; end if;
    end loop;
    for previous in select value from jsonb_array_elements(current_state->'soap_documents') where value->>'status' = 'approved' loop
      select value into next_row from jsonb_array_elements(p_state->'soap_documents') where value->>'id' = previous->>'id';
      if next_row is distinct from previous then raise exception 'IMMUTABLE_APPROVED_DOCUMENT'; end if;
    end loop;
    for previous in select value from jsonb_array_elements(current_state->'care_messages') where value->>'approved_body' is not null loop
      select value into next_row from jsonb_array_elements(p_state->'care_messages') where value->>'id' = previous->>'id';
      if next_row->>'approved_body' is distinct from previous->>'approved_body' or next_row->>'approved_at' is distinct from previous->>'approved_at' then raise exception 'IMMUTABLE_APPROVED_MESSAGE'; end if;
    end loop;
    insert into public.demo_state_revisions(clinic_id,version,state) values (p_clinic_id,current_version,current_state) on conflict do nothing;
  end if;
  insert into public.clinics(id,name,timezone,payload)
  values (p_clinic_id,p_state#>>'{clinic,name}',p_state#>>'{clinic,timezone}',p_state->'clinic')
  on conflict (id) do update set name=excluded.name, timezone=excluded.timezone, payload=excluded.payload;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'patients','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.patients(id,clinic_id,display_name,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'display_name')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,display_name=excluded.display_name,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'visits','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.visits(id,clinic_id,patient_id,visit_no,workflow_status,record_status,scheduled_at,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'visit_no')::integer,(row_data->>'workflow_status')::text,(row_data->>'record_status')::text,(row_data->>'scheduled_at')::timestamptz,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,visit_no=excluded.visit_no,workflow_status=excluded.workflow_status,record_status=excluded.record_status,scheduled_at=excluded.scheduled_at,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'transcripts','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.transcripts(id,clinic_id,visit_id,revision,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'revision')::integer,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,revision=excluded.revision,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'soap_documents','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.visit_documents(id,clinic_id,visit_id,revision,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'revision')::integer,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,revision=excluded.revision,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'treatments','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.treatment_entries(id,clinic_id,visit_id,modality,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'modality')::text,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,modality=excluded.modality,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'followup_answers','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.followup_answers(id,clinic_id,patient_id,visit_id,item_key,subitem_key,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'item_key')::text,(row_data->>'subitem_key')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,visit_id=excluded.visit_id,item_key=excluded.item_key,subitem_key=excluded.subitem_key,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'observations','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.observations(id,clinic_id,patient_id,visit_id,instrument,value,series_key,measured_at,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'instrument')::text,(row_data->>'value')::numeric,(row_data->>'series_key')::text,(row_data->>'measured_at')::timestamptz,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,visit_id=excluded.visit_id,instrument=excluded.instrument,value=excluded.value,series_key=excluded.series_key,measured_at=excluded.measured_at,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'followup_items','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.followup_items(id,clinic_id,patient_id,source_visit_id,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'source_visit_id')::uuid,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,source_visit_id=excluded.source_visit_id,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'medication_courses','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.medication_courses(id,clinic_id,patient_id,source_visit_id,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'source_visit_id')::uuid,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,source_visit_id=excluded.source_visit_id,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'care_messages','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.care_messages(id,clinic_id,patient_id,visit_id,stage,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'stage')::text,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,visit_id=excluded.visit_id,stage=excluded.stage,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'care_responses','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.care_responses(id,clinic_id,patient_id,message_id,event_key,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'message_id')::uuid,(row_data->>'event_key')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,message_id=excluded.message_id,event_key=excluded.event_key,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'contact_tasks','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.contact_tasks(id,clinic_id,patient_id,response_id,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'patient_id')::uuid,(row_data->>'response_id')::uuid,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,patient_id=excluded.patient_id,response_id=excluded.response_id,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'annotations','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.treatment_annotations(id,clinic_id,visit_id,modality,view,revision,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'modality')::text,(row_data->>'view')::text,(row_data->>'revision')::integer,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,modality=excluded.modality,view=excluded.view,revision=excluded.revision,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'recordings','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.recordings(id,clinic_id,visit_id,object_path,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'object_path')::text,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,object_path=excluded.object_path,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'jobs','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.ai_jobs(id,clinic_id,visit_id,status,input_hash,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'status')::text,(row_data->>'input_hash')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,status=excluded.status,input_hash=excluded.input_hash,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'audioSessions','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.audio_sessions(id,clinic_id,visit_id,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,status=excluded.status,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_state->'live_events','[]'::jsonb)) loop
    if row_data->>'clinic_id' <> p_clinic_id::text then raise exception 'CLINIC_MISMATCH'; end if;
    insert into public.live_events(id,clinic_id,visit_id,status,payload) values ((row_data->>'id')::uuid,(row_data->>'clinic_id')::uuid,(row_data->>'visit_id')::uuid,(row_data->>'status')::text,row_data)
    on conflict (id) do update set clinic_id=excluded.clinic_id,visit_id=excluded.visit_id,status=excluded.status,payload=excluded.payload;
  end loop;
  delete from public.treatment_entries t where t.clinic_id=p_clinic_id and not exists (select 1 from jsonb_array_elements(p_state->'treatments') v where v->>'id'=t.id::text);
  delete from public.treatment_annotations t where t.clinic_id=p_clinic_id and not exists (select 1 from jsonb_array_elements(p_state->'annotations') v where v->>'id'=t.id::text);

  insert into public.demo_state(clinic_id,version,state) values (p_clinic_id,current_version+1,p_state)
  on conflict (clinic_id) do update set version=excluded.version,state=excluded.state,updated_at=now();
  return current_version+1;
end $$;

create or replace function public.hani_check_access_attempt(p_ip_hash text, p_success boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(715092513);
  delete from public.demo_access_attempts where attempted_at < now()-interval '1 hour';
  if (select count(*) from public.demo_access_attempts) >= 50 or
     (select count(*) from public.demo_access_attempts where ip_hash=p_ip_hash and attempted_at>=now()-interval '15 minutes') >= 5 then return false; end if;
  if not p_success then insert into public.demo_access_attempts(ip_hash) values(p_ip_hash); end if;
  return true;
end $$;

create or replace function public.hani_check_ai_rate(p_session_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ai:'||p_session_id::text,0));
  delete from public.demo_ai_attempts where attempted_at<now()-interval '1 minute';
  if not exists(select 1 from public.demo_sessions where id=p_session_id and expires_at>now()) then return false; end if;
  if (select count(*) from public.demo_ai_attempts where session_id=p_session_id)>=5 then return false; end if;
  insert into public.demo_ai_attempts(session_id) values(p_session_id);
  return true;
end $$;
alter table public.clinics enable row level security;
revoke all on public.clinics from public, anon, authenticated;
grant all on public.clinics to service_role;
alter table public.demo_state enable row level security;
revoke all on public.demo_state from public, anon, authenticated;
grant all on public.demo_state to service_role;
alter table public.demo_state_revisions enable row level security;
revoke all on public.demo_state_revisions from public, anon, authenticated;
grant all on public.demo_state_revisions to service_role;
alter table public.patients enable row level security;
revoke all on public.patients from public, anon, authenticated;
grant all on public.patients to service_role;
alter table public.visits enable row level security;
revoke all on public.visits from public, anon, authenticated;
grant all on public.visits to service_role;
alter table public.transcripts enable row level security;
revoke all on public.transcripts from public, anon, authenticated;
grant all on public.transcripts to service_role;
alter table public.visit_documents enable row level security;
revoke all on public.visit_documents from public, anon, authenticated;
grant all on public.visit_documents to service_role;
alter table public.treatment_entries enable row level security;
revoke all on public.treatment_entries from public, anon, authenticated;
grant all on public.treatment_entries to service_role;
alter table public.followup_answers enable row level security;
revoke all on public.followup_answers from public, anon, authenticated;
grant all on public.followup_answers to service_role;
alter table public.observations enable row level security;
revoke all on public.observations from public, anon, authenticated;
grant all on public.observations to service_role;
alter table public.followup_items enable row level security;
revoke all on public.followup_items from public, anon, authenticated;
grant all on public.followup_items to service_role;
alter table public.medication_courses enable row level security;
revoke all on public.medication_courses from public, anon, authenticated;
grant all on public.medication_courses to service_role;
alter table public.care_messages enable row level security;
revoke all on public.care_messages from public, anon, authenticated;
grant all on public.care_messages to service_role;
alter table public.care_responses enable row level security;
revoke all on public.care_responses from public, anon, authenticated;
grant all on public.care_responses to service_role;
alter table public.contact_tasks enable row level security;
revoke all on public.contact_tasks from public, anon, authenticated;
grant all on public.contact_tasks to service_role;
alter table public.treatment_annotations enable row level security;
revoke all on public.treatment_annotations from public, anon, authenticated;
grant all on public.treatment_annotations to service_role;
alter table public.recordings enable row level security;
revoke all on public.recordings from public, anon, authenticated;
grant all on public.recordings to service_role;
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from public, anon, authenticated;
grant all on public.ai_jobs to service_role;
alter table public.audio_sessions enable row level security;
revoke all on public.audio_sessions from public, anon, authenticated;
grant all on public.audio_sessions to service_role;
alter table public.live_events enable row level security;
revoke all on public.live_events from public, anon, authenticated;
grant all on public.live_events to service_role;
alter table public.demo_sessions enable row level security;
revoke all on public.demo_sessions from public, anon, authenticated;
grant all on public.demo_sessions to service_role;
alter table public.demo_access_attempts enable row level security;
revoke all on public.demo_access_attempts from public, anon, authenticated;
grant all on public.demo_access_attempts to service_role;
alter table public.demo_ai_attempts enable row level security;
revoke all on public.demo_ai_attempts from public, anon, authenticated;
grant all on public.demo_ai_attempts to service_role;
revoke all on function public.hani_commit_state(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.hani_commit_state(uuid,bigint,jsonb) to service_role;
revoke all on function public.hani_check_access_attempt(text,boolean) from public, anon, authenticated;
grant execute on function public.hani_check_access_attempt(text,boolean) to service_role;
revoke all on function public.hani_check_ai_rate(uuid) from public, anon, authenticated;
grant execute on function public.hani_check_ai_rate(uuid) to service_role;
grant usage,select on sequence public.demo_access_attempts_id_seq,public.demo_ai_attempts_id_seq to service_role;

-- Signed upload/read capabilities are issued only after a valid PIN session and visit check.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hani-recordings','hani-recordings',false,262144000,
  array['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/aac','audio/flac','video/webm','video/mp4','application/octet-stream'])
on conflict (id) do nothing;
