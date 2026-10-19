-- 핵심 스키마: 공간·멤버·초대·루틴·회차·이벤트·도움 요청·반응
-- Core schema: spaces, members, invitations, routines, occurrences, events, help requests, reactions
-- 근거: docs/planning/docs/05-data-model-security.md, 06-routine-engine.md
-- Source: docs/planning/docs/05-data-model-security.md, 06-routine-engine.md

create extension if not exists pgcrypto with schema extensions;

-- 열거형
-- Enumerations
create type public.space_role as enum ('admin', 'member');
create type public.routine_mode as enum ('fixed', 'after_resolution', 'manual');
create type public.assignment_mode as enum ('fixed', 'rotate', 'free');
-- DB 상태와 UI 표시 상태(due/overdue)는 구별한다. void 는 취소된 수동 실행 회차.
-- DB status differs from UI status (due/overdue). 'void' marks an undone manual run.
create type public.occurrence_status as enum ('scheduled', 'completed', 'skipped', 'void');
create type public.routine_event_type as enum (
  'completed', 'undone', 'skipped', 'help_requested', 'help_accepted', 'help_declined', 'manual_run'
);
create type public.help_status as enum ('pending', 'accepted', 'declined', 'cancelled');
create type public.reaction_type as enum ('thanks', 'great', 'cheer');

-- 프로필: auth.users 와 같은 ID 를 쓰지만 FK 를 두지 않아 계정 삭제 후에도 공동 이력의 비식별 묘비로 남는다.
-- Profiles share the auth.users id without an FK so they survive account deletion as de-identified tombstones.
create table public.profiles (
  user_id uuid primary key,
  nickname text not null check (char_length(nickname) between 1 and 30),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  timezone text not null,
  created_by uuid not null references public.profiles (user_id),
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id),
  role public.space_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
-- 활성 멤버 중복 방지
-- Prevent duplicate active memberships
create unique index space_members_active_uniq on public.space_members (space_id, user_id) where left_at is null;
create index space_members_user_idx on public.space_members (user_id) where left_at is null;

-- 초대: 원문 토큰은 저장하지 않고 해시만 저장한다. 1회용.
-- Invitations store only the token hash, never the raw token. Single use.
create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles (user_id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_by uuid references public.profiles (user_id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 앱 추천 템플릿 (사용자의 실제 루틴과 분리)
-- App-provided templates, separate from users' actual routines
create table public.routine_templates (
  id text primary key,
  category text not null,
  title text not null,
  mode public.routine_mode not null,
  rule jsonb not null,
  sort_order integer not null default 0
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  mode public.routine_mode not null,
  assignment_mode public.assignment_mode not null default 'free',
  current_rule_version integer not null default 1,
  notify_enabled boolean not null default true,
  created_by uuid not null references public.profiles (user_id),
  archived_at timestamptz,
  -- 생성 요청 멱등 키 (재시도 시 중복 루틴 방지)
  -- Creation idempotency key (prevents duplicate routines on retry)
  create_request_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_space_idx on public.routines (space_id) where archived_at is null;
create unique index routines_create_request_uniq on public.routines (created_by, create_request_id)
  where create_request_id is not null;

-- 규칙 변경 이력
-- Rule change history
create table public.routine_rules (
  routine_id uuid not null references public.routines (id) on delete cascade,
  version integer not null,
  rule jsonb not null,
  created_at timestamptz not null default now(),
  primary key (routine_id, version)
);

create table public.routine_assignees (
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id),
  sequence_order integer not null,
  primary key (routine_id, user_id),
  unique (routine_id, sequence_order)
);

create table public.routine_occurrences (
  id uuid primary key default gen_random_uuid(),
  -- 생성 순서 (같은 트랜잭션 시각 동률 해소용)
  -- Creation order (tie-breaker when timestamps are equal)
  seq bigint generated always as identity,
  space_id uuid not null references public.spaces (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  rule_version integer not null,
  is_manual boolean not null default false,
  is_fixed_slot boolean not null default false,
  is_single_open boolean not null default false,
  due_local_date date not null,
  -- 교대 순서 기준이 되는 원래 담당자 (도움 수락으로 바뀌지 않음)
  -- Original assignee used for rotation order (unchanged by help acceptance)
  original_assignee_id uuid references public.profiles (user_id),
  assigned_user_id uuid references public.profiles (user_id),
  status public.occurrence_status not null default 'scheduled',
  custom_override boolean not null default false,
  performer_id uuid references public.profiles (user_id),
  resolved_by uuid references public.profiles (user_id),
  resolved_at timestamptz,
  resolved_local_date date,
  -- 완료일 기준 모드에서 이 회차를 만든 이전 회차 (취소 시 후속 영향 판단)
  -- Previous occurrence that spawned this one in after_resolution mode (used for undo impact checks)
  created_from_occurrence_id uuid references public.routine_occurrences (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
-- 고정 일정 회차 중복 생성 방지: 고정 모드만 날짜 슬롯 키를 가진다 (수동은 하루 여러 회차 허용)
-- Prevent duplicate fixed-schedule occurrences: only fixed mode sets a date slot key (manual may repeat daily)
create unique index routine_occurrences_slot_uniq
  on public.routine_occurrences (routine_id, due_local_date) where is_fixed_slot;
-- 완료일 기준 모드는 열린 회차가 동시에 하나만 존재
-- after_resolution mode keeps at most one open occurrence
create unique index routine_occurrences_single_open_uniq
  on public.routine_occurrences (routine_id) where is_single_open and status = 'scheduled';
create index routine_occurrences_space_due_idx on public.routine_occurrences (space_id, due_local_date);
create index routine_occurrences_open_idx on public.routine_occurrences (routine_id) where status = 'scheduled';

-- 이벤트: 불변 기록. 취소/정정은 새 이벤트로 남긴다.
-- Events are immutable; undo/corrections are recorded as new events.
create table public.routine_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  occurrence_id uuid not null references public.routine_occurrences (id) on delete cascade,
  event_type public.routine_event_type not null,
  actor_id uuid not null references public.profiles (user_id),
  performer_id uuid references public.profiles (user_id),
  original_assignee_id uuid references public.profiles (user_id),
  reverts_event_id uuid references public.routine_events (id),
  request_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
-- 멱등성: 같은 사용자의 같은 request_id 는 한 번만 기록
-- Idempotency: one record per (actor, request_id)
create unique index routine_events_request_uniq on public.routine_events (actor_id, request_id);
create index routine_events_space_time_idx on public.routine_events (space_id, recorded_at desc);
create index routine_events_occurrence_idx on public.routine_events (occurrence_id);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  occurrence_id uuid not null references public.routine_occurrences (id) on delete cascade,
  requester_id uuid not null references public.profiles (user_id),
  recipient_id uuid not null references public.profiles (user_id),
  message text check (message is null or char_length(message) <= 100),
  status public.help_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
-- 회차당 대기 중 요청은 하나
-- At most one pending request per occurrence
create unique index help_requests_pending_uniq on public.help_requests (occurrence_id) where status = 'pending';

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  event_id uuid not null references public.routine_events (id) on delete cascade,
  author_id uuid not null references public.profiles (user_id),
  type public.reaction_type not null,
  message text check (message is null or char_length(message) <= 100),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, author_id)
);

-- 신규 가입 시 프로필 자동 생성
-- Auto-create a profile on sign-up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text;
begin
  v_nickname := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), '사용자'), 30);
  insert into public.profiles (user_id, nickname) values (new.id, v_nickname)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
