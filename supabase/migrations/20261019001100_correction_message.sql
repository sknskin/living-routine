-- 정정 요청 메시지를 수신자 전용 알림 데이터에 보관 (이전 버전은 메시지를 저장하지 않았음)
-- Keep the correction message in recipient-only notification data (the previous version did not store it)
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
