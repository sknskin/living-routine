-- 독립 리뷰 반영 (UX 업데이트):
--  1) 회차 날짜 이동 후 원래 슬롯이 다시 생성되던 문제 → slot_date 분리
--  2) 취소된 예약 알림 키가 새 알림을 막던 문제 → 키에 예정일 포함 + 취소 행 재사용, 발송 직전 개인 설정 재확인
--  3) 회차 변경: 날짜 충돌 규칙 강화, 담당은 바뀔 때만 검증, 보관 루틴 차단
--  4) 정정 요청 남용 방지 (같은 회차·같은 요청자 24시간 1회), 개인 알림 설정 보관 루틴 차단
-- Independent review fixes (UX update):
--  1) moved occurrence's original slot was re-materialized → separate slot_date
--  2) cancelled reminder keys blocked new reminders → due date in the key + revive cancelled rows, recheck personal prefs at dispatch
--  3) occurrence change: stricter date conflicts, validate assignee only when it changes, block archived routines
--  4) correction request throttle (once per occurrence/requester per 24h), block archived routines for personal prefs

-- 고정 일정의 "원래 슬롯 날짜". 예정일을 옮겨도 슬롯은 그대로 점유된다.
-- Original slot date of a fixed occurrence. Moving the due date keeps the slot occupied.
alter table public.routine_occurrences add column slot_date date;
update public.routine_occurrences set slot_date = due_local_date where is_fixed_slot;
drop index public.routine_occurrences_slot_uniq;
create unique index routine_occurrences_slot_uniq on public.routine_occurrences (routine_id, slot_date) where is_fixed_slot;
alter table public.routine_occurrences add constraint routine_occurrences_slot_date_check
  check (not is_fixed_slot or slot_date is not null);

-- 정정 요청 제한 시간(시간)
-- Correction request throttle window in hours
create function public.correction_throttle_hours()
returns integer
language sql
immutable
as $$ select 24 $$;


-- 슬롯 날짜 기준으로 생성·교대 계산
-- Materialize and rotate by slot date
create or replace function public.materialize_fixed(p_routine_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine public.routines%rowtype;
  v_rule jsonb;
  v_today date;
  v_day date;
  v_prev uuid;
  v_assignee uuid;
  v_created integer := 0;
begin
  select * into v_routine from public.routines where id = p_routine_id;
  if v_routine.id is null or v_routine.mode <> 'fixed' or v_routine.archived_at is not null then
    return 0;
  end if;

  select rule into v_rule from public.routine_rules
  where routine_id = p_routine_id and version = v_routine.current_rule_version;
  v_today := public.space_today(v_routine.space_id);

  for v_day in
    select d::date
    from generate_series(v_today, v_today + public.materialize_window_days(), interval '1 day') as d
  loop
    continue when not public.rule_matches(v_rule, v_day);
    continue when exists (
      select 1 from public.routine_occurrences
      where routine_id = p_routine_id and is_fixed_slot and slot_date = v_day
    );

    select original_assignee_id into v_prev
    from public.routine_occurrences
    where routine_id = p_routine_id and is_fixed_slot and slot_date < v_day
    order by slot_date desc
    limit 1;

    v_assignee := public.pick_assignee(p_routine_id, v_prev);

    insert into public.routine_occurrences (
      space_id, routine_id, rule_version, is_fixed_slot, due_local_date, slot_date,
      original_assignee_id, assigned_user_id
    ) values (
      v_routine.space_id, p_routine_id, v_routine.current_rule_version, true, v_day, v_day,
      v_assignee, v_assignee
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

create or replace function public.update_occurrence(
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
  if exists (select 1 from public.routines where id = v_occ.routine_id and archived_at is not null) then
    perform public.raise_app_error('VALIDATION_ERROR', 'routine archived');
  end if;
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
  -- 담당은 실제로 바뀔 때만 검증 (탈퇴한 담당자의 회차도 날짜는 옮길 수 있게)
  -- Validate the assignee only when it changes (so a departed assignee's occurrence can still be moved)
  if v_new_assignee is distinct from v_occ.assigned_user_id and v_new_assignee is not null and not exists (
    select 1 from public.space_members
    where space_id = v_occ.space_id and user_id = v_new_assignee and left_at is null
  ) then
    perform public.raise_app_error('VALIDATION_ERROR', 'assignee must be an active member');
  end if;
  -- 고정 일정은 같은 날짜에 회차가 하나뿐
  -- Fixed schedules have one occurrence per date
  -- 고정 일정: 다른 회차의 예정일·슬롯이거나 규칙상 회차가 생길 날짜로는 옮길 수 없다 (같은 날 중복 방지)
  -- Fixed schedule: cannot move onto another occurrence's date/slot or a date the rule will generate (no same-day duplicates)
  if v_occ.is_fixed_slot and v_new_due <> v_occ.due_local_date and (
    exists (
      select 1 from public.routine_occurrences
      where routine_id = v_occ.routine_id and is_fixed_slot and id <> v_occ.id
        and (due_local_date = v_new_due or slot_date = v_new_due)
    )
    or public.rule_matches(
      (select rr.rule from public.routine_rules rr join public.routines r on r.id = rr.routine_id
       where r.id = v_occ.routine_id and rr.version = r.current_rule_version),
      v_new_due
    )
  ) then
    perform public.raise_app_error('CONFLICT_VERSION', 'another occurrence on that date');
  end if;

  update public.routine_occurrences
  set due_local_date = v_new_due,
      assigned_user_id = v_new_assignee,
      custom_override = true,
      version = version + 1
  where id = v_occ.id;

  -- 예약 알림 취소. 알림 키에 예정일이 들어가므로 새 날짜의 알림은 다음 적재 때 새로 생성된다
  -- Cancel scheduled reminders. Reminder keys include the due date, so the new date gets fresh reminders on the next enqueue
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

create or replace function public.enqueue_notification(
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
declare
  v_id uuid;
begin
  insert into public.notification_outbox (
    logical_event_key, recipient_id, space_id, kind, title, body, data,
    scheduled_at, expires_at, important
  ) values (
    p_key, p_recipient_id, p_space_id, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb),
    coalesce(p_scheduled_at, now()), p_expires_at, p_important
  )
  -- 같은 키가 취소 상태로 남아 있으면 되살려 다시 예약 (발송 직전에 최신 상태로 재검증됨)
  -- If the same key exists as cancelled, revive and reschedule it (revalidated right before dispatch)
  on conflict (logical_event_key) do update
    set status = 'pending',
        scheduled_at = excluded.scheduled_at,
        expires_at = excluded.expires_at,
        push_status = 'pending',
        read_at = null
    where public.notification_outbox.status = 'cancelled'
  returning id into v_id;

  -- 중요 이벤트는 묶음 지연 없이 즉시 전달 (07 전송 정합성)
  -- Important events are delivered immediately without batching delay (07 delivery consistency)
  if v_id is not null and p_important then
    perform public.dispatch_notification(v_id);
  end if;
end;
$$;

-- 예약 알림 키에 예정일 포함 (회차 날짜를 옮기면 새 알림이 생성되도록)
-- Include the due date in reminder keys (a moved occurrence gets fresh reminders)
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
      'reminder:' || v_row.occurrence_id || ':' || v_row.user_id || ':' || v_row.due_local_date || ':0',
      v_row.title, '오늘 할 일이에요',
      jsonb_build_object('occurrence_id', v_row.occurrence_id, 'routine_id', v_row.routine_id, 'space_id', v_row.space_id),
      v_at, (v_row.due_local_date + 1) at time zone v_row.space_tz, false
    );
    perform public.enqueue_notification(
      v_row.user_id, v_row.space_id, 'reminder_repeat',
      'reminder:' || v_row.occurrence_id || ':' || v_row.user_id || ':' || v_row.due_local_date || ':1',
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

create or replace function public.dispatch_notification(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_valid boolean;
  v_push_allowed boolean;
begin
  select * into v_row from public.notification_outbox
  where id = p_id and status = 'pending' and scheduled_at <= now()
  for update skip locked;
  if v_row.id is null then
    return false;
  end if;

  if v_row.expires_at is not null and v_row.expires_at <= now() then
    update public.notification_outbox set status = 'expired' where id = v_row.id;
    return false;
  end if;

  v_valid := exists (
    select 1 from public.space_members
    where space_id = v_row.space_id and user_id = v_row.recipient_id and left_at is null
  );

  if v_valid and v_row.kind in ('reminder', 'reminder_repeat') then
    select * into v_occ from public.routine_occurrences where id = (v_row.data ->> 'occurrence_id')::uuid;
    -- 완료·건너뛰기·담당 변경 시 재알림 취소
    -- Cancel when completed, skipped or reassigned
    v_valid := v_occ.id is not null and v_occ.status = 'scheduled'
      and (v_occ.assigned_user_id is null or v_occ.assigned_user_id = v_row.recipient_id)
      and v_occ.due_local_date::text = split_part(v_row.logical_event_key, ':', 4)
      -- 발송 직전에 개인 알림 끔 여부 재확인
      -- Recheck the personal opt-out right before dispatch
      and not exists (
        select 1 from public.routine_notification_prefs np
        where np.user_id = v_row.recipient_id and np.routine_id = v_occ.routine_id and not np.enabled
      );
  end if;

  if not v_valid then
    update public.notification_outbox set status = 'cancelled' where id = v_row.id;
    return false;
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
  return true;
end;
$$;

create or replace function public.set_routine_notification(p_routine_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_uid uuid;
begin
  select space_id into v_space_id from public.routines where id = p_routine_id and archived_at is null;
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

create or replace function public.request_correction(p_occurrence_id uuid, p_message text, p_request_id uuid)
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
  -- 같은 회차에 대한 같은 사람의 정정 요청은 제한 시간 안에 한 번만 (중요 알림 남용 방지)
  -- One correction request per occurrence and requester within the window (prevents important-notification abuse)
  if exists (
    select 1 from public.routine_events
    where occurrence_id = v_occ.id and actor_id = v_uid and event_type = 'correction_requested'
      and recorded_at > now() - make_interval(hours => public.correction_throttle_hours())
  ) then
    perform public.raise_app_error('RATE_LIMITED', 'correction already requested');
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

  -- 기록자에게 즉시 알림. 메시지는 수신자만 읽는 앱 내 알림 데이터에만 저장 (푸시 본문·이벤트에는 넣지 않음)
  -- 주의: 향후 푸시 발송기는 data 를 통째로 푸시 페이로드에 복사하면 안 된다 (07 민감 본문 최소화)
  -- Note: a future push sender must never copy data wholesale into the push payload (07 minimize sensitive text)
  -- Notify the recorder immediately. The message is kept only in the recipient-only in-app notification data
  -- (never in the push body or the shared event)
  perform public.enqueue_notification(
    v_occ.resolved_by, v_occ.space_id, 'correction_request',
    'correction:' || v_occ.id || ':' || p_request_id,
    '기록 정정 요청', v_name || '님이 "' || v_title || '" 기록 확인을 요청했어요',
    jsonb_build_object('occurrence_id', v_occ.id, 'routine_id', v_occ.routine_id, 'actor_id', v_uid,
      'message', v_message),
    now(), null, true
  );
  return jsonb_build_object('occurrence_id', v_occ.id, 'replayed', false);
end;
$$;
