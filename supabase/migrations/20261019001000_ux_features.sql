-- UI/UX 보완 기능 (docs/UX-GAP-ANALYSIS.md):
-- 루틴별 개인 알림, 이번 회차만 변경, 공간 이름 변경, 관리자 내려놓기, 기록 정정 요청, 반응 종류 확장
-- UX gap features (docs/UX-GAP-ANALYSIS.md):
-- per-routine personal notifications, change one occurrence, rename space, step down as admin, correction requests, more reactions

alter type public.routine_event_type add value if not exists 'rescheduled';
alter type public.routine_event_type add value if not exists 'correction_requested';
-- 덕분에 편해졌어요 / 확인했어요
-- "made it easier thanks to you" / "got it"
alter type public.reaction_type add value if not exists 'relieved';
alter type public.reaction_type add value if not exists 'ack';

------------------------------------------------------------------------------
-- 루틴별 개인 알림 (U03 "개인 알림 선택"). 행이 없으면 켜짐.
-- Per-routine personal notifications (U03). No row means enabled.
------------------------------------------------------------------------------
create table public.routine_notification_prefs (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  enabled boolean not null default true,
  primary key (user_id, routine_id)
);
alter table public.routine_notification_prefs enable row level security;
create policy routine_notification_prefs_select on public.routine_notification_prefs
  for select to authenticated using (user_id = auth.uid());
revoke all on public.routine_notification_prefs from anon;
revoke insert, update, delete, truncate, trigger, references on public.routine_notification_prefs from authenticated;

create function public.set_routine_notification(p_routine_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_uid uuid;
begin
  select space_id into v_space_id from public.routines where id = p_routine_id;
  if v_space_id is null then
    perform public.raise_app_error('NOT_FOUND', 'routine');
  end if;
  v_uid := public.require_member(v_space_id);
  insert into public.routine_notification_prefs (user_id, routine_id, enabled)
  values (v_uid, p_routine_id, p_enabled)
  on conflict (user_id, routine_id) do update set enabled = excluded.enabled;
  if not p_enabled then
    -- 이미 예약된 이 루틴 알림 취소
    -- Cancel already scheduled notifications for this routine
    update public.notification_outbox set status = 'cancelled'
    where recipient_id = v_uid and status = 'pending' and data ->> 'routine_id' = p_routine_id::text;
  end if;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

-- 루틴별 개인 알림을 반영한 예약 알림 적재 (기존 함수 대체)
-- Scheduled notification enqueue honoring per-routine personal settings (replaces the existing function)
create or replace function public.enqueue_scheduled_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_at timestamptz;
  v_candidate timestamptz;
  v_offset integer;
  v_todo integer;
begin
  -- 하루 요약: 개인 시간대의 요약 시각 이후 허용 지연 이내에만 생성
  -- Daily summary: only within the grace window after the user's summary time
  for v_row in
    select p.user_id, p.summary_time, p.timezone, m.space_id, s.name as space_name, s.timezone as space_tz
    from public.notification_preferences p
    join public.space_members m on m.user_id = p.user_id and m.left_at is null
    join public.spaces s on s.id = m.space_id and s.archived_at is null
    join public.space_notification_settings sns on sns.user_id = p.user_id and sns.space_id = m.space_id and sns.enabled
    where p.summary_enabled
  loop
    -- 요약 시각 + 허용 지연이 자정을 넘을 수 있어 오늘·어제 기준 시각을 모두 확인
    -- Summary time + grace may cross midnight, so check both today's and yesterday's slot
    v_at := null;
    for v_offset in 0 .. 1 loop
      v_candidate := (((now() at time zone v_row.timezone)::date - v_offset) + v_row.summary_time) at time zone v_row.timezone;
      if now() >= v_candidate and now() < v_candidate + make_interval(hours => public.summary_grace_hours()) then
        v_at := v_candidate;
        exit;
      end if;
    end loop;
    continue when v_at is null;

    select count(*) into v_todo
    from public.routine_occurrences o
    join public.routines r on r.id = o.routine_id and r.archived_at is null
    where o.space_id = v_row.space_id
      and o.status = 'scheduled'
      and o.due_local_date <= (now() at time zone v_row.space_tz)::date
      and (o.assigned_user_id = v_row.user_id or o.assigned_user_id is null);
    continue when v_todo = 0;

    perform public.enqueue_notification(
      v_row.user_id, v_row.space_id, 'daily_summary',
      'summary:' || v_row.user_id || ':' || v_row.space_id || ':' || (v_at at time zone v_row.timezone)::date,
      v_row.space_name, '오늘 할 일 ' || v_todo || '개가 있어요',
      jsonb_build_object('space_id', v_row.space_id),
      v_at, v_at + make_interval(hours => public.summary_grace_hours()), false
    );
    v_count := v_count + 1;
  end loop;

  -- 개별 예정 알림: 시각이 지정되고 알림이 켜진 루틴의 오늘 회차. 최초 1회 + 미완료 시 재알림 1회.
  -- Per-routine reminders: today's occurrences of routines with a time and notifications on. Initial + one repeat.
  for v_row in
    select o.id as occurrence_id, o.space_id, o.routine_id, o.due_local_date, r.title, s.timezone as space_tz,
      rr.rule ->> 'time' as remind_time, m.user_id
    from public.routine_occurrences o
    join public.routines r on r.id = o.routine_id and r.archived_at is null and r.notify_enabled
    join public.routine_rules rr on rr.routine_id = r.id and rr.version = r.current_rule_version
    join public.spaces s on s.id = o.space_id and s.archived_at is null
    join public.space_members m on m.space_id = o.space_id and m.left_at is null
      and (m.user_id = o.assigned_user_id or o.assigned_user_id is null)
    where o.status = 'scheduled'
      -- 개인이 이 루틴 알림을 끈 경우 제외 (U03 개인 알림 선택)
      -- Skip members who turned off this routine's notifications (U03 personal choice)
      and not exists (
        select 1 from public.routine_notification_prefs np
        where np.user_id = m.user_id and np.routine_id = o.routine_id and not np.enabled
      )
      and not o.is_manual
      and rr.rule ? 'time'
      and o.due_local_date = (now() at time zone s.timezone)::date
  loop
    v_at := (v_row.due_local_date + (v_row.remind_time)::time) at time zone v_row.space_tz;
    perform public.enqueue_notification(
      v_row.user_id, v_row.space_id, 'reminder',
      'reminder:' || v_row.occurrence_id || ':' || v_row.user_id || ':0',
      v_row.title, '오늘 할 일이에요',
      jsonb_build_object('occurrence_id', v_row.occurrence_id, 'routine_id', v_row.routine_id, 'space_id', v_row.space_id),
      v_at, (v_row.due_local_date + 1) at time zone v_row.space_tz, false
    );
    perform public.enqueue_notification(
      v_row.user_id, v_row.space_id, 'reminder_repeat',
      'reminder:' || v_row.occurrence_id || ':' || v_row.user_id || ':1',
      v_row.title, '아직 완료되지 않았어요',
      jsonb_build_object('occurrence_id', v_row.occurrence_id, 'routine_id', v_row.routine_id, 'space_id', v_row.space_id),
      v_at + make_interval(hours => public.reminder_repeat_hours()),
      (v_row.due_local_date + 1) at time zone v_row.space_tz, false
    );
    v_count := v_count + 2;
  end loop;

  return v_count;
end;
$$;

------------------------------------------------------------------------------
-- 이번 회차만 변경 (날짜·담당). 개별 변경 표시 → 규칙 재계산에서 보존 (06 §4, §7)
-- Change this occurrence only (date/assignee). Marked as override → preserved by rule recompute (06 §4, §7)
------------------------------------------------------------------------------
create function public.update_occurrence(
  p_occurrence_id uuid,
  p_due_local_date date,
  p_assignee_id uuid,
  p_clear_assignee boolean,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_occ public.routine_occurrences%rowtype;
  v_existing public.routine_events%rowtype;
  v_title text;
  v_new_due date;
  v_new_assignee uuid;
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  v_occ := public.lock_occurrence(p_occurrence_id);
  v_existing := public.find_request_event(v_uid, p_request_id, array['rescheduled'::public.routine_event_type], p_occurrence_id);
  if v_existing.id is not null then
    return jsonb_build_object('occurrence_id', v_occ.id, 'replayed', true);
  end if;

  if v_occ.status <> 'scheduled' then
    perform public.raise_app_error('ALREADY_RESOLVED', v_occ.status::text);
  end if;
  if v_occ.is_manual then
    perform public.raise_app_error('VALIDATION_ERROR', 'manual runs cannot be rescheduled');
  end if;
  if exists (select 1 from public.help_requests where occurrence_id = v_occ.id and status = 'pending') then
    perform public.raise_app_error('CONFLICT_VERSION', 'pending help request');
  end if;

  v_new_due := coalesce(p_due_local_date, v_occ.due_local_date);
  v_new_assignee := case when p_clear_assignee then null else coalesce(p_assignee_id, v_occ.assigned_user_id) end;

  if v_new_due < public.space_today(v_occ.space_id) then
    perform public.raise_app_error('VALIDATION_ERROR', 'date in the past');
  end if;
  if v_new_assignee is not null and not exists (
    select 1 from public.space_members
    where space_id = v_occ.space_id and user_id = v_new_assignee and left_at is null
  ) then
    perform public.raise_app_error('VALIDATION_ERROR', 'assignee must be an active member');
  end if;
  -- 고정 일정은 같은 날짜에 회차가 하나뿐
  -- Fixed schedules have one occurrence per date
  if v_occ.is_fixed_slot and v_new_due <> v_occ.due_local_date and exists (
    select 1 from public.routine_occurrences
    where routine_id = v_occ.routine_id and is_fixed_slot and due_local_date = v_new_due
  ) then
    perform public.raise_app_error('CONFLICT_VERSION', 'another occurrence on that date');
  end if;

  update public.routine_occurrences
  set due_local_date = v_new_due,
      assigned_user_id = v_new_assignee,
      custom_override = true,
      version = version + 1
  where id = v_occ.id;

  -- 바뀐 일정에 맞춰 예약 알림은 다시 계산되도록 취소
  -- Cancel scheduled reminders so they are recomputed for the new schedule
  update public.notification_outbox set status = 'cancelled'
  where status = 'pending' and data ->> 'occurrence_id' = v_occ.id::text;

  select title into v_title from public.routines where id = v_occ.routine_id;
  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, original_assignee_id, request_id, payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id, 'rescheduled', v_uid, v_occ.original_assignee_id, p_request_id,
    jsonb_build_object(
      'title', v_title,
      'from_date', v_occ.due_local_date, 'to_date', v_new_due,
      'from_assignee', v_occ.assigned_user_id, 'to_assignee', v_new_assignee
    )
  );

  return jsonb_build_object('occurrence_id', v_occ.id, 'replayed', false);
end;
$$;

------------------------------------------------------------------------------
-- 기록 정정 요청: 타인이 남긴 완료·건너뛰기 기록은 기록자에게 정정을 요청 (D18, O05 권장 초안)
-- Correction request: ask the recorder to correct someone else's completion/skip record (D18, O05 draft)
------------------------------------------------------------------------------
create function public.request_correction(p_occurrence_id uuid, p_message text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_occ public.routine_occurrences%rowtype;
  v_existing public.routine_events%rowtype;
  v_title text;
  v_name text;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  v_occ := public.lock_occurrence(p_occurrence_id);
  v_existing := public.find_request_event(
    v_uid, p_request_id, array['correction_requested'::public.routine_event_type], p_occurrence_id
  );
  if v_existing.id is not null then
    return jsonb_build_object('occurrence_id', v_occ.id, 'replayed', true);
  end if;
  if v_occ.status not in ('completed', 'skipped') or v_occ.resolved_by is null then
    perform public.raise_app_error('ALREADY_RESOLVED', 'nothing to correct');
  end if;
  if v_occ.resolved_by = v_uid then
    perform public.raise_app_error('VALIDATION_ERROR', 'undo your own record directly');
  end if;
  if char_length(coalesce(v_message, '')) > 100 then
    perform public.raise_app_error('VALIDATION_ERROR', 'message too long');
  end if;

  select title into v_title from public.routines where id = v_occ.routine_id;
  select nickname into v_name from public.profiles where user_id = v_uid;

  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, original_assignee_id, request_id, payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id, 'correction_requested', v_uid, v_occ.original_assignee_id, p_request_id,
    jsonb_build_object('title', v_title, 'recorder_id', v_occ.resolved_by)
  );

  -- 기록자에게 즉시 알림 (메시지 본문은 알림에 싣지 않음)
  -- Notify the recorder immediately (message text is not included)
  perform public.enqueue_notification(
    v_occ.resolved_by, v_occ.space_id, 'correction_request',
    'correction:' || v_occ.id || ':' || p_request_id,
    '기록 정정 요청', v_name || '님이 "' || v_title || '" 기록 확인을 요청했어요',
    jsonb_build_object('occurrence_id', v_occ.id, 'routine_id', v_occ.routine_id, 'actor_id', v_uid,
      'has_message', v_message is not null),
    now(), null, true
  );
  return jsonb_build_object('occurrence_id', v_occ.id, 'replayed', false);
end;
$$;

alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('daily_summary', 'reminder', 'reminder_repeat', 'help_request', 'help_response', 'correction_request'));

------------------------------------------------------------------------------
-- 공간 이름 변경 (관리자) / 관리자 내려놓기 (다른 관리자가 있을 때만)
-- Rename space (admins) / step down as admin (only when another admin exists)
------------------------------------------------------------------------------
create function public.rename_space(p_space_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  perform public.require_member(p_space_id);
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;
  if char_length(v_name) not between 1 and 40 then
    perform public.raise_app_error('VALIDATION_ERROR', 'name length 1..40');
  end if;
  update public.spaces set name = v_name, version = version + 1 where id = p_space_id;
  return jsonb_build_object('name', v_name);
end;
$$;

create function public.step_down_admin(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
begin
  perform 1 from public.spaces where id = p_space_id for update;
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'not an admin');
  end if;
  if not exists (
    select 1 from public.space_members
    where space_id = p_space_id and role = 'admin' and left_at is null and user_id <> v_uid
  ) then
    perform public.raise_app_error('LAST_ADMIN');
  end if;
  update public.space_members set role = 'member'
  where space_id = p_space_id and user_id = v_uid and left_at is null;
  return jsonb_build_object('role', 'member');
end;
$$;

-- 회차 이벤트에 정정 요청이 생기면 그 기록에 반응하지 못하게 할 필요는 없음 (반응은 완료 이벤트 기준)
-- Correction requests do not block reactions (reactions target completion events)

revoke execute on function public.update_occurrence(uuid, date, uuid, boolean, uuid) from public, anon;
revoke execute on function public.request_correction(uuid, text, uuid) from public, anon;
revoke execute on function public.rename_space(uuid, text) from public, anon;
revoke execute on function public.step_down_admin(uuid) from public, anon;
revoke execute on function public.set_routine_notification(uuid, boolean) from public, anon;
grant execute on function
  public.update_occurrence(uuid, date, uuid, boolean, uuid),
  public.request_correction(uuid, text, uuid),
  public.rename_space(uuid, text),
  public.step_down_admin(uuid),
  public.set_routine_notification(uuid, boolean)
to authenticated;
