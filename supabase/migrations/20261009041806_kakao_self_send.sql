-- Kept outside demo_state and every browser envelope. Tokens are AES-GCM encrypted.
create table public.kakao_private_state (
  clinic_id uuid primary key references public.clinics(id),
  version bigint not null default 1 check (version > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.kakao_private_state enable row level security;
revoke all on public.kakao_private_state from public, anon, authenticated;
grant all on public.kakao_private_state to service_role;
