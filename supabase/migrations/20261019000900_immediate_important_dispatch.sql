-- 중요 이벤트(도움 요청/응답)는 Cron 주기를 기다리지 않고 적재 즉시 전달 (D06 "중요 이벤트만 즉시")
-- Important events (help request/response) are dispatched on enqueue instead of waiting for cron (D06)

-- 단일 알림 발송 직전 검증·전달 (기존 dispatch_due_notifications 의 행 단위 로직)
-- Validate and deliver one notification (row logic previously inside dispatch_due_notifications)
create function public.dispatch_notification(p_id uuid)
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
      and (v_occ.assigned_user_id is null or v_occ.assigned_user_id = v_row.recipient_id);
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

create or replace function public.dispatch_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.notification_outbox
    where status = 'pending' and scheduled_at <= now()
    order by scheduled_at
  loop
    if public.dispatch_notification(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
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
  on conflict (logical_event_key) do nothing
  returning id into v_id;

  -- 중요 이벤트는 묶음 지연 없이 즉시 전달 (07 전송 정합성)
  -- Important events are delivered immediately without batching delay (07 delivery consistency)
  if v_id is not null and p_important then
    perform public.dispatch_notification(v_id);
  end if;
end;
$$;

-- 내부 함수는 클라이언트 실행 불가
-- Internal function is not client-executable
revoke execute on function public.dispatch_notification(uuid) from public, anon, authenticated;
