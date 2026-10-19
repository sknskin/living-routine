-- 알림 예약 적재·발송 직전 검증·사용자 설정 RPC, pg_cron 예약 작업
-- Notification scheduling, pre-dispatch validation, preference RPCs and pg_cron jobs
-- 근거: docs/planning/docs/07-notifications-sync.md (D07, D21)
-- Source: docs/planning/docs/07-notifications-sync.md (D07, D21)

-- 사용자 현지 시각이 방해 금지 구간인지
-- Whether the user's local time falls inside quiet hours
create function public.in_quiet_hours(p_user_id uuid, p_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pref public.notification_preferences%rowtype;
  v_local time;
begin
  select * into v_pref from public.notification_preferences where user_id = p_user_id;
  if v_pref.user_id is null or not v_pref.quiet_enabled then
    return false;
  end if;
  v_local := (p_at at time zone v_pref.timezone)::time;
  if v_pref.quiet_start <= v_pref.quiet_end then
    return v_local >= v_pref.quiet_start and v_local < v_pref.quiet_end;
  end if;
  -- 자정을 넘는 구간 (예: 22:00~08:00)
  -- Range crossing midnight (e.g. 22:00~08:00)
  return v_local >= v_pref.quiet_start or v_local < v_pref.quiet_end;
end;
$$;

-- 방해 금지 종료 시각 (다음 quiet_end)
-- Next quiet-hours end time
create function public.next_quiet_end(p_user_id uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pref public.notification_preferences%rowtype;
  v_local timestamp;
  v_candidate timestamp;
begin
  select * into v_pref from public.notification_preferences where user_id = p_user_id;
  v_local := p_at at time zone v_pref.timezone;
  v_candidate := v_local::date + v_pref.quiet_end;
  if v_candidate <= v_local then
    v_candidate := v_candidate + interval '1 day';
  end if;
  return v_candidate at time zone v_pref.timezone;
end;
$$;

-- 하루 요약과 개별 예정 알림·재알림 적재 (논리 키로 중복 방지, 중복 Cron 안전)
-- Enqueue daily summaries and per-routine reminders/repeats (logical keys dedupe; safe under duplicate cron runs)
create function public.enqueue_scheduled_notifications()
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

-- 발송 직전 최신 상태 검증 후 앱 내 알림함으로 전달하고 푸시 상태 결정
-- Validate latest state right before dispatch, deliver to the in-app inbox and decide push status
create function public.dispatch_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_valid boolean;
  v_push_allowed boolean;
  v_count integer := 0;
begin
  for v_row in
    select * from public.notification_outbox
    where status = 'pending' and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    if v_row.expires_at is not null and v_row.expires_at <= now() then
      update public.notification_outbox set status = 'expired' where id = v_row.id;
      continue;
    end if;

    v_valid := exists (
      select 1 from public.space_members
      where space_id = v_row.space_id and user_id = v_row.recipient_id and left_at is null
    );

    if v_valid and v_row.kind in ('reminder', 'reminder_repeat') then
      select * into v_occ from public.routine_occurrences where id = (v_row.data ->> 'occurrence_id')::uuid;
      -- 완료·건너뛰기·담당 변경 시 재알림 취소 (07 §알림 채널)
      -- Cancel when completed, skipped or reassigned (07 notification channels)
      v_valid := v_occ.id is not null and v_occ.status = 'scheduled'
        and (v_occ.assigned_user_id is null or v_occ.assigned_user_id = v_row.recipient_id);
    end if;

    if not v_valid then
      update public.notification_outbox set status = 'cancelled' where id = v_row.id;
      continue;
    end if;

    v_push_allowed := exists (
      select 1 from public.space_notification_settings
      where user_id = v_row.recipient_id and space_id = v_row.space_id and enabled
    ) and exists (
      select 1 from public.push_devices where user_id = v_row.recipient_id and enabled and invalidated_at is null
    );

    update public.notification_outbox
    set status = 'delivered',
        push_status = case when v_push_allowed then 'pending' else 'skipped' end,
        push_retry_at = case
          when v_push_allowed and public.in_quiet_hours(v_row.recipient_id, now())
            then public.next_quiet_end(v_row.recipient_id, now())
          else now()
        end
    where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 매 실행 시 모든 공간의 가까운 미래 회차 보충 (cron 용, 사용자 컨텍스트 없음)
-- Top up near-future occurrences for all spaces (for cron, no user context)
create function public.materialize_all_spaces()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine record;
  v_created integer := 0;
begin
  for v_routine in
    select r.id, r.mode from public.routines r
    join public.spaces s on s.id = r.space_id and s.archived_at is null
    where r.archived_at is null and r.mode <> 'manual'
    order by r.id
  loop
    perform 1 from public.routines where id = v_routine.id for update;
    if v_routine.mode = 'fixed' then
      v_created := v_created + public.materialize_fixed(v_routine.id);
    else
      perform public.ensure_first_after_resolution(v_routine.id);
    end if;
  end loop;
  return v_created;
end;
$$;

------------------------------------------------------------------------------
-- 사용자 알림 설정 RPC / User notification setting RPCs
------------------------------------------------------------------------------
create function public.update_notification_preferences(
  p_summary_enabled boolean,
  p_summary_time time,
  p_quiet_enabled boolean,
  p_quiet_start time,
  p_quiet_end time,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_valid_timezone(p_timezone) then
    perform public.raise_app_error('VALIDATION_ERROR', 'invalid timezone');
  end if;
  insert into public.notification_preferences (
    user_id, summary_enabled, summary_time, quiet_enabled, quiet_start, quiet_end, timezone, updated_at
  ) values (
    v_uid, p_summary_enabled, p_summary_time, p_quiet_enabled, p_quiet_start, p_quiet_end, p_timezone, now()
  )
  on conflict (user_id) do update set
    summary_enabled = excluded.summary_enabled,
    summary_time = excluded.summary_time,
    quiet_enabled = excluded.quiet_enabled,
    quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end,
    timezone = excluded.timezone,
    updated_at = now();
  return jsonb_build_object('updated', true);
end;
$$;

create function public.set_space_notifications(p_space_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
begin
  insert into public.space_notification_settings (user_id, space_id, enabled)
  values (v_uid, p_space_id, p_enabled)
  on conflict (user_id, space_id) do update set enabled = excluded.enabled;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

create function public.register_push_device(p_token text, p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_id uuid;
begin
  if p_token is null or char_length(p_token) not between 10 and 300 then
    perform public.raise_app_error('VALIDATION_ERROR', 'invalid token');
  end if;
  -- 같은 토큰이 다른 계정에 있었다면 현재 계정으로 이전 (기기 재로그인)
  -- If the token belonged to another account, move it to the current one (device re-login)
  insert into public.push_devices (user_id, platform, token)
  values (v_uid, p_platform, p_token)
  on conflict (token) do update set
    user_id = excluded.user_id, platform = excluded.platform, enabled = true,
    invalidated_at = null, last_seen_at = now()
  returning id into v_id;
  return jsonb_build_object('device_id', v_id);
end;
$$;

create function public.set_push_device_enabled(p_device_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.push_devices set enabled = p_enabled where id = p_device_id and user_id = v_uid;
  if not found then
    perform public.raise_app_error('NOT_FOUND', 'device');
  end if;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

-- 앱 내 읽음 상태는 계정 단위 공유 (D21)
-- In-app read state is shared per account (D21)
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_count integer;
begin
  update public.notification_outbox
  set read_at = now()
  where recipient_id = v_uid and status = 'delivered' and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

------------------------------------------------------------------------------
-- pg_cron 예약 작업 / pg_cron jobs
------------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('lr-materialize-occurrences', '7 * * * *', 'select public.materialize_all_spaces()');
select cron.schedule('lr-enqueue-notifications', '*/5 * * * *', 'select public.enqueue_scheduled_notifications()');
select cron.schedule('lr-dispatch-notifications', '* * * * *', 'select public.dispatch_due_notifications()');
