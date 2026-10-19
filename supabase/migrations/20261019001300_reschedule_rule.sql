-- 독립 재검토 반영: 회차 이동 날짜 충돌 규칙이 매일 루틴 이동·원래 날짜 복귀까지 막던 퇴행(R1) 수정,
-- 상수 함수 실행 권한 정리(R3)
-- Re-review fixes: the date-conflict rule blocked moving daily routines and moving back to the own slot (R1);
-- tidy execute grants on a constant function (R3)
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
  -- 날짜 충돌 검사 없음: 원래 슬롯은 slot_date 로 계속 점유되어 다시 생성되지 않으므로,
  -- 미래 어느 날로든 옮길 수 있다 (매일 루틴을 내일로 미루면 내일 할 일이 2개가 되는 것이 실제와 일치)
  -- No date-conflict check: the original slot stays occupied via slot_date and is never re-materialized,
  -- so any future date is allowed (postponing a daily routine to tomorrow honestly yields two tasks tomorrow)

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

revoke execute on function public.correction_throttle_hours() from public, anon, authenticated;
