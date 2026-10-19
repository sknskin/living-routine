-- 알림 설정·기기·아웃박스 스키마와 큐 적재 헬퍼
-- Notification preferences, devices, outbox schema and enqueue helpers
-- 근거: docs/planning/docs/07-notifications-sync.md
-- Source: docs/planning/docs/07-notifications-sync.md

-- 개인 단위 알림 설정 (DND 는 본인에게만 적용)
-- Per-user preferences (DND applies only to the owner)
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  summary_enabled boolean not null default true,
  summary_time time not null default '08:00',
  quiet_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  timezone text not null default 'Asia/Seoul',
  updated_at timestamptz not null default now()
);

create table public.space_notification_settings (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  enabled boolean not null default true,
  primary key (user_id, space_id)
);

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null unique,
  enabled boolean not null default true,
  invalidated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 논리 알림 1건 = 사용자별 1행. logical_event_key 로 중복 방지.
-- One logical notification per user row; logical_event_key prevents duplicates.
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  logical_event_key text not null unique,
  recipient_id uuid not null references public.profiles (user_id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  kind text not null check (kind in ('daily_summary', 'reminder', 'reminder_repeat', 'help_request', 'help_response')),
  important boolean not null default false,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  -- pending: 예약 대기 / delivered: 앱 내 알림함 노출 / cancelled: 발송 직전 무효 / expired: 기한 초과
  -- pending: scheduled / delivered: visible in inbox / cancelled: invalid at dispatch / expired: past deadline
  status text not null default 'pending' check (status in ('pending', 'delivered', 'cancelled', 'expired')),
  -- 푸시 전송 상태는 앱 내 상태와 분리 (Ticket=접수, Receipt=공급자 처리)
  -- Push status is separate from in-app status (Ticket=accepted, Receipt=provider processed)
  push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'failed', 'skipped')),
  push_retry_count integer not null default 0,
  push_retry_at timestamptz,
  push_ticket_ids jsonb,
  scheduled_at timestamptz not null default now(),
  expires_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_outbox_recipient_idx on public.notification_outbox (recipient_id, scheduled_at desc);
create index notification_outbox_pending_idx on public.notification_outbox (scheduled_at) where status = 'pending';
create index notification_outbox_push_idx on public.notification_outbox (push_retry_at) where status = 'delivered' and push_status = 'pending';

alter table public.notification_preferences enable row level security;
alter table public.space_notification_settings enable row level security;
alter table public.push_devices enable row level security;
alter table public.notification_outbox enable row level security;

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy space_notification_settings_select on public.space_notification_settings
  for select to authenticated using (user_id = auth.uid());
create policy push_devices_select on public.push_devices
  for select to authenticated using (user_id = auth.uid());
create policy notification_outbox_select on public.notification_outbox
  for select to authenticated using (recipient_id = auth.uid() and status = 'delivered');

revoke all on public.notification_preferences, public.space_notification_settings,
  public.push_devices, public.notification_outbox from anon;
revoke insert, update, delete on public.notification_preferences, public.space_notification_settings,
  public.push_devices, public.notification_outbox from authenticated;

-- 재알림 간격(시간)
-- Reminder repeat delay in hours
create function public.reminder_repeat_hours()
returns integer
language sql
immutable
as $$ select 3 $$;

-- 하루 요약 발송 허용 지연(시간): 이보다 늦으면 그날 요약은 만들지 않는다
-- Allowed lateness for daily summaries in hours; later than this, skip that day's summary
create function public.summary_grace_hours()
returns integer
language sql
immutable
as $$ select 3 $$;

-- 푸시 최대 재시도 횟수
-- Maximum push retry attempts
create function public.push_max_retries()
returns integer
language sql
immutable
as $$ select 3 $$;

-- 알림 큐 적재 (중복 키면 무시)
-- Enqueue a notification (ignored on duplicate key)
create function public.enqueue_notification(
  p_recipient_id uuid,
  p_space_id uuid,
  p_kind text,
  p_key text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_scheduled_at timestamptz,
  p_expires_at timestamptz,
  p_important boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_outbox (
    logical_event_key, recipient_id, space_id, kind, title, body, data,
    scheduled_at, expires_at, important
  ) values (
    p_key, p_recipient_id, p_space_id, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb),
    coalesce(p_scheduled_at, now()), p_expires_at, p_important
  )
  on conflict (logical_event_key) do nothing;
end;
$$;

-- 멤버 가입 시 공간 알림 설정과 개인 설정 기본행 생성
-- Create default space and personal notification rows on membership
create function public.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.space_notification_settings (user_id, space_id)
  values (new.user_id, new.space_id)
  on conflict (user_id, space_id) do nothing;
  insert into public.notification_preferences (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_space_member_created
  after insert on public.space_members
  for each row execute function public.handle_new_member();
