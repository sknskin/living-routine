-- 서버 검증 명령 RPC (CMD-01 ~ CMD-10). 모든 중요 쓰기는 권한 확인 + 행 잠금 + 멱등 request_id.
-- Server-verified command RPCs (CMD-01..CMD-10). Every important write checks permission, locks rows and uses an idempotent request_id.
-- 근거: docs/planning/docs/04-architecture.md, 06-routine-engine.md
-- Source: docs/planning/docs/04-architecture.md, 06-routine-engine.md

-- 초대 유효 기간(일) — D22 권장 초안 7일
-- Invitation lifetime in days — D22 recommended draft: 7 days
create function public.invite_expiry_days()
returns integer
language sql
immutable
as $$ select 7 $$;

-- 초대 코드 바이트 수 (hex 로 2배 길이)
-- Invitation code byte length (hex doubles the length)
create function public.invite_code_bytes()
returns integer
language sql
immutable
as $$ select 6 $$;

create function public.hash_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
$$;

create function public.require_member(p_space_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_space_member(p_space_id) then
    perform public.raise_app_error('NOT_MEMBER');
  end if;
  return v_uid;
end;
$$;

-- 이미 처리된 request_id 의 이벤트 조회 (멱등 응답용).
-- 같은 키가 다른 명령·대상에 재사용되면 성공으로 오인하지 않도록 VALIDATION_ERROR.
-- 반드시 대상 행을 잠근 뒤 호출해 동시 재시도도 재생 응답을 받게 한다.
-- Look up the event for an already-processed request_id (idempotent replies).
-- A key reused for another command/target raises VALIDATION_ERROR instead of a false success.
-- Call only after locking the target row so concurrent retries also get a replay.
create function public.find_request_event(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_types public.routine_event_type[],
  p_target_id uuid
)
returns public.routine_events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.routine_events%rowtype;
begin
  select * into v_event from public.routine_events where actor_id = p_actor_id and request_id = p_request_id;
  if v_event.id is not null and (
    not (v_event.event_type = any (p_event_types))
    or not coalesce(p_target_id = any (array_remove(array[
      v_event.occurrence_id, v_event.routine_id, (v_event.payload ->> 'help_request_id')::uuid
    ], null)), false)
  ) then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id reused for another command');
  end if;
  return v_event;
end;
$$;

-- 회차를 잠그고 반환. 없거나 비멤버면 오류.
-- 잠금 순서 규칙: 루틴 → 회차 → 도움 요청 (교착 방지). 루틴을 먼저 잠근 뒤 회차를 잠근다.
-- Lock and return an occurrence; error if missing or not a member.
-- Lock order rule: routine → occurrence → help request (deadlock avoidance). Locks the routine first.
create function public.lock_occurrence(p_occurrence_id uuid)
returns public.routine_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.routine_occurrences%rowtype;
  v_routine_id uuid;
begin
  select routine_id into v_routine_id from public.routine_occurrences where id = p_occurrence_id;
  if v_routine_id is null then
    perform public.raise_app_error('NOT_FOUND', 'occurrence');
  end if;
  perform 1 from public.routines where id = v_routine_id for update;
  select * into v_occ from public.routine_occurrences where id = p_occurrence_id for update;
  if v_occ.id is null then
    perform public.raise_app_error('NOT_FOUND', 'occurrence');
  end if;
  perform public.require_member(v_occ.space_id);
  return v_occ;
end;
$$;

------------------------------------------------------------------------------
-- CMD-01 createSpace
------------------------------------------------------------------------------
create function public.create_space(p_name text, p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_name text := trim(coalesce(p_name, ''));
  v_space_id uuid;
begin
  if char_length(v_name) not between 1 and 40 then
    perform public.raise_app_error('VALIDATION_ERROR', 'name length 1..40');
  end if;
  if not public.is_valid_timezone(p_timezone) then
    perform public.raise_app_error('VALIDATION_ERROR', 'invalid timezone');
  end if;

  insert into public.spaces (name, timezone, created_by)
  values (v_name, p_timezone, v_uid)
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (v_space_id, v_uid, 'admin');

  return jsonb_build_object('space_id', v_space_id);
end;
$$;

create function public.update_profile(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_nickname text := trim(coalesce(p_nickname, ''));
begin
  if char_length(v_nickname) not between 1 and 30 then
    perform public.raise_app_error('VALIDATION_ERROR', 'nickname length 1..30');
  end if;
  update public.profiles set nickname = v_nickname where user_id = v_uid and deleted_at is null;
  return jsonb_build_object('nickname', v_nickname);
end;
$$;

------------------------------------------------------------------------------
-- 초대 / Invitations (CMD-02 acceptInvite)
------------------------------------------------------------------------------
create function public.create_invitation(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
  v_code text;
  v_expires timestamptz := now() + make_interval(days => public.invite_expiry_days());
begin
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;

  v_code := upper(encode(extensions.gen_random_bytes(public.invite_code_bytes()), 'hex'));
  insert into public.space_invitations (space_id, token_hash, created_by, expires_at)
  values (p_space_id, public.hash_invite_code(v_code), v_uid, v_expires);

  -- 원문 코드는 이 응답에서만 반환하고 저장하지 않는다
  -- The raw code is returned only here and never stored
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.space_invitations where id = p_invitation_id;
  if v_space_id is null then
    perform public.raise_app_error('NOT_FOUND', 'invitation');
  end if;
  perform public.require_member(v_space_id);
  if not public.is_space_admin(v_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;
  update public.space_invitations set revoked_at = now()
  where id = p_invitation_id and revoked_at is null and accepted_at is null;
  return jsonb_build_object('revoked', true);
end;
$$;

-- 관리자용 초대 목록 (해시 제외)
-- Invitation list for admins (hash excluded)
create function public.list_invitations(p_space_id uuid)
returns table (id uuid, expires_at timestamptz, revoked_at timestamptz, accepted_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_member(p_space_id);
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;
  return query
    select i.id, i.expires_at, i.revoked_at, i.accepted_at, i.created_at
    from public.space_invitations i
    where i.space_id = p_space_id
    order by i.created_at desc;
end;
$$;

-- 초대 유효성 검사 후 잠근 초대 행 반환
-- Validate and return the locked invitation row
create function public.lock_valid_invitation(p_code text)
returns public.space_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.space_invitations%rowtype;
begin
  select * into v_inv from public.space_invitations
  where token_hash = public.hash_invite_code(p_code)
  for update;

  if v_inv.id is null or v_inv.revoked_at is not null then
    perform public.raise_app_error('INVITE_INVALID');
  end if;
  if exists (select 1 from public.spaces where id = v_inv.space_id and archived_at is not null) then
    perform public.raise_app_error('INVITE_INVALID', 'space archived');
  end if;
  if v_inv.expires_at <= now() then
    perform public.raise_app_error('INVITE_EXPIRED');
  end if;
  return v_inv;
end;
$$;

create function public.preview_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_inv public.space_invitations%rowtype;
  v_already boolean;
begin
  v_inv := public.lock_valid_invitation(p_code);
  v_already := exists (
    select 1 from public.space_members
    where space_id = v_inv.space_id and user_id = v_uid and left_at is null
  );
  if v_inv.accepted_at is not null and not v_already then
    perform public.raise_app_error('INVITE_INVALID', 'already used');
  end if;

  return (
    select jsonb_build_object(
      'space_id', s.id,
      'space_name', s.name,
      'member_count', (select count(*) from public.space_members m where m.space_id = s.id and m.left_at is null),
      'expires_at', v_inv.expires_at,
      'already_member', v_already
    )
    from public.spaces s where s.id = v_inv.space_id
  );
end;
$$;

create function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_inv public.space_invitations%rowtype;
  v_member_id uuid;
begin
  v_inv := public.lock_valid_invitation(p_code);

  -- 이미 멤버면 초대를 소모하지 않고 기존 멤버십 반환 (중복 멤버십 방지)
  -- Already a member: keep the invitation unused and return the existing membership (no duplicates)
  select id into v_member_id from public.space_members
  where space_id = v_inv.space_id and user_id = v_uid and left_at is null;
  if v_member_id is not null then
    return jsonb_build_object('space_id', v_inv.space_id, 'membership_id', v_member_id, 'already_member', true);
  end if;

  if v_inv.accepted_at is not null then
    perform public.raise_app_error('INVITE_INVALID', 'already used');
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_inv.space_id, v_uid, 'member')
  returning id into v_member_id;

  update public.space_invitations set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;

  return jsonb_build_object('space_id', v_inv.space_id, 'membership_id', v_member_id, 'already_member', false);
end;
$$;

------------------------------------------------------------------------------
-- 멤버 관리 / Membership (CMD-10 leaveSpace)
------------------------------------------------------------------------------

-- 멤버를 공간에서 분리: 담당 순번 제거, 미래 담당 재배정, 대기 도움 요청 취소
-- Detach a member: drop from rotations, reassign future assignments, cancel pending help requests
create function public.detach_member(p_space_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ record;
  v_next uuid;
  v_routine_id uuid;
  v_affected uuid[];
begin
  -- 잠금 순서: 루틴(id 순) → 회차 → 도움 요청
  -- Lock order: routines (by id) → occurrences → help requests
  perform 1 from public.routines where space_id = p_space_id order by id for update;

  update public.space_members set left_at = now()
  where space_id = p_space_id and user_id = p_user_id and left_at is null;

  -- 1) 떠나는 사람이 도움으로 맡았던 회차는 원래 담당에게 돌려준다
  -- 1) Slots the leaver took over via help go back to the original assignee
  for v_occ in
    select o.id, o.original_assignee_id
    from public.routine_occurrences o
    where o.space_id = p_space_id and o.status = 'scheduled'
      and (o.assigned_user_id = p_user_id or o.original_assignee_id = p_user_id)
    order by o.id
    for update
  loop
    if v_occ.original_assignee_id is distinct from p_user_id and exists (
      select 1 from public.space_members
      where space_id = p_space_id and user_id = v_occ.original_assignee_id and left_at is null
    ) then
      update public.routine_occurrences
      set assigned_user_id = v_occ.original_assignee_id, custom_override = false, version = version + 1
      where id = v_occ.id;
    end if;
  end loop;

  update public.help_requests set status = 'cancelled', responded_at = now()
  where space_id = p_space_id and status = 'pending'
    and (requester_id = p_user_id or recipient_id = p_user_id);

  -- 떠나는 사람이 순번에 있던 루틴 목록 (순번 삭제 전에 확보)
  -- Routines whose rotation included the leaver (captured before removing the assignee)
  select coalesce(array_agg(ra.routine_id), '{}') into v_affected
  from public.routine_assignees ra
  join public.routines r on r.id = ra.routine_id
  where r.space_id = p_space_id and ra.user_id = p_user_id;

  delete from public.routine_assignees ra
  using public.routines r
  where ra.routine_id = r.id and r.space_id = p_space_id and ra.user_id = p_user_id;

  -- 2) 해당 루틴의 일반 미래 고정 회차는 지우고 남은 순번으로 다시 생성 (규칙 변경과 같은 재계산, 교대 균형 유지).
  --    오늘 회차는 떠나는 사람 차례일 때만 다시 만든다.
  -- 2) Plain future fixed slots of those routines are recomputed with the remaining rotation (same as a rule change).
  --    Today's slot is recomputed only if it was the leaver's turn.
  delete from public.routine_occurrences o
  where o.routine_id = any (v_affected)
    and o.status = 'scheduled' and o.is_fixed_slot and not o.custom_override
    and (o.due_local_date > public.space_today(p_space_id)
      or (o.due_local_date = public.space_today(p_space_id) and o.original_assignee_id = p_user_id))
    and not exists (select 1 from public.routine_events e where e.occurrence_id = o.id)
    and not exists (select 1 from public.help_requests h where h.occurrence_id = o.id);

  -- 3) 남은 회차(완료일 기준 열린 회차·개별 변경·이력 있는 회차)는 재배정 (D22)
  -- 3) Remaining slots (open after_resolution, overridden, with history) are reassigned (D22)
  for v_occ in
    select o.id, o.routine_id, o.assigned_user_id, o.original_assignee_id
    from public.routine_occurrences o
    where o.space_id = p_space_id and o.status = 'scheduled'
      and (o.assigned_user_id = p_user_id or o.original_assignee_id = p_user_id)
    order by o.id
  loop
    v_next := public.pick_assignee(v_occ.routine_id, null);
    update public.routine_occurrences
    set original_assignee_id = case when original_assignee_id = p_user_id then v_next else original_assignee_id end,
        assigned_user_id = case when assigned_user_id = p_user_id then v_next else assigned_user_id end,
        version = version + 1
    where id = v_occ.id;
  end loop;

  for v_routine_id in
    select id from public.routines where space_id = p_space_id and mode = 'fixed' and archived_at is null order by id
  loop
    perform public.materialize_fixed(v_routine_id);
  end loop;

  update public.notification_outbox set status = 'cancelled'
  where space_id = p_space_id and recipient_id = p_user_id and status = 'pending';
end;
$$;

create function public.leave_space(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
  v_is_admin boolean := public.is_space_admin(p_space_id);
  v_other_admins integer;
  v_other_members integer;
begin
  perform 1 from public.spaces where id = p_space_id for update;

  select count(*) filter (where role = 'admin'), count(*)
  into v_other_admins, v_other_members
  from public.space_members
  where space_id = p_space_id and left_at is null and user_id <> v_uid;

  -- 마지막 관리자는 권한 이전 후 탈퇴 (D22)
  -- The last admin must transfer the role before leaving (D22)
  if v_is_admin and v_other_admins = 0 and v_other_members > 0 then
    perform public.raise_app_error('LAST_ADMIN');
  end if;

  perform public.detach_member(p_space_id, v_uid);

  if v_other_members = 0 then
    update public.spaces set archived_at = now(), version = version + 1 where id = p_space_id;
  end if;

  return jsonb_build_object('left', true, 'space_archived', v_other_members = 0);
end;
$$;

create function public.transfer_admin(p_space_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_member(p_space_id);
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;
  update public.space_members set role = 'admin'
  where space_id = p_space_id and user_id = p_user_id and left_at is null;
  if not found then
    perform public.raise_app_error('NOT_MEMBER', 'target');
  end if;
  return jsonb_build_object('admin', p_user_id);
end;
$$;

create function public.remove_member(p_space_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
begin
  if not public.is_space_admin(p_space_id) then
    perform public.raise_app_error('FORBIDDEN', 'admin only');
  end if;
  if p_user_id = v_uid then
    perform public.raise_app_error('VALIDATION_ERROR', 'use leave_space for self');
  end if;
  if not exists (
    select 1 from public.space_members where space_id = p_space_id and user_id = p_user_id and left_at is null
  ) then
    perform public.raise_app_error('NOT_MEMBER', 'target');
  end if;
  perform public.detach_member(p_space_id, p_user_id);
  return jsonb_build_object('removed', p_user_id);
end;
$$;

------------------------------------------------------------------------------
-- CMD-03 upsertRoutine
------------------------------------------------------------------------------

-- 담당자 목록 검증 후 교체
-- Validate and replace the assignee list
create function public.replace_assignees(
  p_routine_id uuid,
  p_space_id uuid,
  p_mode public.assignment_mode,
  p_assignees uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid[] := coalesce(p_assignees, '{}');
  v_idx integer;
begin
  if p_mode = 'fixed' and cardinality(v_list) <> 1 then
    perform public.raise_app_error('VALIDATION_ERROR', 'fixed assignment needs exactly one assignee');
  end if;
  if p_mode = 'rotate' and cardinality(v_list) < 1 then
    perform public.raise_app_error('VALIDATION_ERROR', 'rotation needs at least one assignee');
  end if;
  if p_mode = 'free' then
    v_list := '{}';
  end if;
  if cardinality(v_list) <> (select count(distinct x) from unnest(v_list) as x) then
    perform public.raise_app_error('VALIDATION_ERROR', 'duplicate assignee');
  end if;
  if exists (
    select 1 from unnest(v_list) as a(uid)
    where not exists (
      select 1 from public.space_members m
      where m.space_id = p_space_id and m.user_id = a.uid and m.left_at is null
    )
  ) then
    perform public.raise_app_error('VALIDATION_ERROR', 'assignee must be an active member');
  end if;

  delete from public.routine_assignees where routine_id = p_routine_id;
  for v_idx in 1 .. coalesce(array_length(v_list, 1), 0) loop
    insert into public.routine_assignees (routine_id, user_id, sequence_order)
    values (p_routine_id, v_list[v_idx], v_idx);
  end loop;
end;
$$;

-- 일반(개별 변경·이력 없는) 미래 고정 회차 삭제. p_include_today 면 오늘 회차도 포함.
-- Delete plain future fixed occurrences (no override, no history). p_include_today also covers today.
create function public.drop_plain_future_fixed(p_routine_id uuid, p_today date, p_include_today boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.routine_occurrences o
  where o.routine_id = p_routine_id
    and o.is_fixed_slot
    and o.status = 'scheduled'
    and not o.custom_override
    and (o.due_local_date > p_today or (p_include_today and o.due_local_date = p_today))
    and not exists (select 1 from public.routine_events e where e.occurrence_id = o.id)
    and not exists (select 1 from public.help_requests h where h.occurrence_id = o.id);
end;
$$;

-- 완료일 기준 열린 회차를 새 규칙/담당에 맞춰 조정 (현재 회차 적용을 선택했거나 담당자가 목록에서 빠졌을 때)
-- Adjust the open after_resolution occurrence to the new rule/assignees (when applying to current or the assignee left the list)
create function public.adjust_open_after_resolution(p_routine_id uuid, p_apply_to_current boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine public.routines%rowtype;
  v_rule jsonb;
  v_open public.routine_occurrences%rowtype;
  v_base date;
  v_mode public.assignment_mode;
  v_assignee_valid boolean;
  v_next uuid;
begin
  select * into v_routine from public.routines where id = p_routine_id;
  select rule into v_rule from public.routine_rules where routine_id = p_routine_id and version = v_routine.current_rule_version;
  select * into v_open from public.routine_occurrences
  where routine_id = p_routine_id and status = 'scheduled' and not is_manual
  for update;
  if v_open.id is null then
    perform public.ensure_first_after_resolution(p_routine_id);
    return;
  end if;
  v_mode := v_routine.assignment_mode;

  if p_apply_to_current and not v_open.custom_override then
    select resolved_local_date into v_base from public.routine_occurrences where id = v_open.created_from_occurrence_id;
    if v_base is null then
      update public.routine_occurrences
      set due_local_date = (v_rule ->> 'start_date')::date, rule_version = v_routine.current_rule_version, version = version + 1
      where id = v_open.id;
    else
      update public.routine_occurrences
      set due_local_date = v_base + (v_rule ->> 'interval_days')::integer,
          rule_version = v_routine.current_rule_version, version = version + 1
      where id = v_open.id;
    end if;
  end if;

  v_assignee_valid := case
    when v_mode = 'free' then v_open.assigned_user_id is null
    else exists (select 1 from public.routine_assignees where routine_id = p_routine_id and user_id = v_open.assigned_user_id)
  end;
  if not v_assignee_valid or p_apply_to_current then
    v_next := public.pick_assignee(p_routine_id, null);
    if not v_assignee_valid or v_mode = 'free' or v_open.assigned_user_id is null then
      update public.routine_occurrences
      set assigned_user_id = v_next, original_assignee_id = v_next, version = version + 1
      where id = v_open.id;
    end if;
  end if;
end;
$$;

create function public.upsert_routine(
  p_space_id uuid,
  p_routine_id uuid,
  p_title text,
  p_mode public.routine_mode,
  p_rule jsonb,
  p_assignment_mode public.assignment_mode,
  p_assignees uuid[],
  p_notify_enabled boolean,
  p_expected_version integer default null,
  p_apply_to_current boolean default false,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
  v_title text := trim(coalesce(p_title, ''));
  v_routine public.routines%rowtype;
  v_current_rule jsonb;
  v_rule_changed boolean;
  v_today date := public.space_today(p_space_id);
begin
  if char_length(v_title) not between 1 and 40 then
    perform public.raise_app_error('VALIDATION_ERROR', 'title length 1..40');
  end if;
  perform public.validate_rule(p_mode, p_rule);

  if p_routine_id is null then
    -- 같은 생성 요청의 재시도면 기존 루틴을 그대로 반환 (멱등)
    -- A retry of the same create request returns the existing routine (idempotent)
    if p_request_id is not null then
      select * into v_routine from public.routines where created_by = v_uid and create_request_id = p_request_id;
      if v_routine.id is not null then
        if v_routine.space_id <> p_space_id then
          perform public.raise_app_error('VALIDATION_ERROR', 'request_id reused for another command');
        end if;
        return jsonb_build_object('routine_id', v_routine.id, 'version', v_routine.version, 'replayed', true);
      end if;
    end if;
    begin
      insert into public.routines (space_id, title, mode, assignment_mode, notify_enabled, created_by, create_request_id)
      values (p_space_id, v_title, p_mode, p_assignment_mode, coalesce(p_notify_enabled, true), v_uid, p_request_id)
      returning * into v_routine;
    exception when unique_violation then
      -- 같은 키의 동시 요청이 먼저 커밋됨 → 재생 응답
      -- A concurrent request with the same key committed first → replay
      select * into v_routine from public.routines where created_by = v_uid and create_request_id = p_request_id;
      return jsonb_build_object('routine_id', v_routine.id, 'version', v_routine.version, 'replayed', true);
    end;
    insert into public.routine_rules (routine_id, version, rule) values (v_routine.id, 1, p_rule);
    perform public.replace_assignees(v_routine.id, p_space_id, p_assignment_mode, p_assignees);
  else
    select * into v_routine from public.routines where id = p_routine_id for update;
    if v_routine.id is null or v_routine.space_id <> p_space_id then
      perform public.raise_app_error('NOT_FOUND', 'routine');
    end if;
    if v_routine.archived_at is not null then
      perform public.raise_app_error('VALIDATION_ERROR', 'routine archived');
    end if;
    if p_expected_version is not null and p_expected_version <> v_routine.version then
      perform public.raise_app_error('CONFLICT_VERSION');
    end if;
    -- 반복 모드는 생성 후 변경하지 않는다 (이력 해석 일관성)
    -- Repeat mode is immutable after creation (keeps history interpretation consistent)
    if p_mode <> v_routine.mode then
      perform public.raise_app_error('VALIDATION_ERROR', 'mode cannot change');
    end if;

    select rule into v_current_rule from public.routine_rules
    where routine_id = v_routine.id and version = v_routine.current_rule_version;
    v_rule_changed := v_current_rule is distinct from p_rule;

    if v_rule_changed then
      insert into public.routine_rules (routine_id, version, rule)
      values (v_routine.id, v_routine.current_rule_version + 1, p_rule);
    end if;

    update public.routines
    set title = v_title,
        assignment_mode = p_assignment_mode,
        notify_enabled = coalesce(p_notify_enabled, notify_enabled),
        current_rule_version = current_rule_version + case when v_rule_changed then 1 else 0 end,
        version = version + 1,
        updated_at = now()
    where id = v_routine.id
    returning * into v_routine;

    perform public.replace_assignees(v_routine.id, p_space_id, p_assignment_mode, p_assignees);

    if p_mode = 'fixed' then
      -- 과거·개별 변경 회차는 보존, 일반 미래 회차만 재계산 (D20)
      -- Keep past and overridden occurrences; recompute only plain future ones (D20)
      perform public.drop_plain_future_fixed(v_routine.id, v_today, coalesce(p_apply_to_current, false));
    elsif p_mode = 'after_resolution' then
      perform public.adjust_open_after_resolution(v_routine.id, coalesce(p_apply_to_current, false));
    end if;
  end if;

  if p_mode = 'fixed' then
    perform public.materialize_fixed(v_routine.id);
  elsif p_mode = 'after_resolution' then
    perform public.ensure_first_after_resolution(v_routine.id);
  end if;

  return jsonb_build_object('routine_id', v_routine.id, 'version', v_routine.version);
end;
$$;

create function public.set_routine_archived(p_routine_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine public.routines%rowtype;
begin
  select * into v_routine from public.routines where id = p_routine_id for update;
  if v_routine.id is null then
    perform public.raise_app_error('NOT_FOUND', 'routine');
  end if;
  perform public.require_member(v_routine.space_id);

  -- 소프트 삭제: 과거 기록 보존 (D13)
  -- Soft delete keeps past records (D13)
  update public.routines
  set archived_at = case when p_archived then now() else null end,
      version = version + 1,
      updated_at = now()
  where id = p_routine_id;

  if p_archived then
    update public.notification_outbox o set status = 'cancelled'
    where o.status = 'pending' and o.data ->> 'routine_id' = p_routine_id::text;
  elsif v_routine.mode = 'fixed' then
    perform public.materialize_fixed(p_routine_id);
  elsif v_routine.mode = 'after_resolution' then
    perform public.ensure_first_after_resolution(p_routine_id);
  end if;

  return jsonb_build_object('routine_id', p_routine_id, 'archived', p_archived);
end;
$$;

-- 앱 진입 시 가까운 미래 회차 보충 (멱등)
-- Top up near-future occurrences on app entry (idempotent)
create function public.ensure_space_occurrences(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine record;
  v_created integer := 0;
begin
  perform public.require_member(p_space_id);
  for v_routine in
    select id, mode from public.routines
    where space_id = p_space_id and archived_at is null and mode <> 'manual'
    order by id
    for update
  loop
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
-- CMD-04 completeOccurrence / CMD-06 skipOccurrence
------------------------------------------------------------------------------

-- 완료/건너뛰기 공통 처리
-- Shared completion/skip handling
create function public.resolve_occurrence(
  p_occurrence_id uuid,
  p_request_id uuid,
  p_status public.occurrence_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.routine_events%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_routine public.routines%rowtype;
  v_today date;
  v_event_id uuid;
  v_next_id uuid;
  v_event_type public.routine_event_type;
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;

  v_event_type := case when p_status = 'completed' then 'completed' else 'skipped' end;

  -- 잠금 후 재생 확인: 같은 키의 동시 재시도도 오류가 아닌 재생 응답을 받는다
  -- Replay check after locking: concurrent retries with the same key get a replay, not an error
  v_occ := public.lock_occurrence(p_occurrence_id);
  v_existing := public.find_request_event(v_uid, p_request_id, array[v_event_type], p_occurrence_id);
  if v_existing.id is not null then
    return jsonb_build_object('event_id', v_existing.id, 'occurrence_id', v_existing.occurrence_id, 'replayed', true);
  end if;

  select * into v_routine from public.routines where id = v_occ.routine_id;
  if v_routine.archived_at is not null then
    perform public.raise_app_error('VALIDATION_ERROR', 'routine archived');
  end if;

  -- 동시 완료: 서버에서 먼저 확정된 요청만 인정 (D13)
  -- Concurrent completion: only the first server-confirmed request wins (D13)
  if v_occ.status <> 'scheduled' then
    perform public.raise_app_error('ALREADY_RESOLVED', v_occ.status::text);
  end if;

  v_today := public.space_today(v_occ.space_id);

  -- MVP: 수행자는 본인만 기록 (D18 권장 초안)
  -- MVP: the performer is always the caller (D18 recommended draft)
  update public.routine_occurrences
  set status = p_status,
      performer_id = case when p_status = 'completed' then v_uid else null end,
      resolved_by = v_uid,
      resolved_at = now(),
      resolved_local_date = v_today,
      version = version + 1
  where id = v_occ.id;

  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, performer_id, original_assignee_id, request_id,
    payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id, v_event_type, v_uid,
    case when p_status = 'completed' then v_uid else null end,
    v_occ.original_assignee_id, p_request_id,
    jsonb_build_object('due_local_date', v_occ.due_local_date, 'resolved_local_date', v_today, 'title', v_routine.title)
  )
  returning id into v_event_id;

  update public.help_requests set status = 'cancelled', responded_at = now()
  where occurrence_id = v_occ.id and status = 'pending';

  update public.notification_outbox o set status = 'cancelled'
  where o.status = 'pending' and o.data ->> 'occurrence_id' = v_occ.id::text;

  if v_routine.mode = 'after_resolution' then
    -- 완료 후 교대, 건너뛰기는 담당 유지. 건너뛴 날부터 새 주기 (D05, D12)
    -- Rotate after completion; skipping keeps the assignee. New cycle starts from the skip date (D05, D12)
    v_next_id := public.spawn_next_after_resolution(v_occ.id, v_today, p_status = 'completed');
  elsif v_routine.mode = 'fixed' then
    perform public.materialize_fixed(v_routine.id);
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'occurrence_id', v_occ.id,
    'status', p_status,
    'next_occurrence_id', v_next_id,
    'replayed', false
  );
end;
$$;

create function public.complete_occurrence(p_occurrence_id uuid, p_request_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.resolve_occurrence(p_occurrence_id, p_request_id, 'completed');
$$;

create function public.skip_occurrence(p_occurrence_id uuid, p_request_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.resolve_occurrence(p_occurrence_id, p_request_id, 'skipped');
$$;

------------------------------------------------------------------------------
-- 수동 실행 / Manual run
------------------------------------------------------------------------------
create function public.run_manual_routine(p_routine_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.routine_events%rowtype;
  v_routine public.routines%rowtype;
  v_prev uuid;
  v_assignee uuid;
  v_today date;
  v_occ_id uuid;
  v_event_id uuid;
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  select * into v_routine from public.routines where id = p_routine_id for update;
  if v_routine.id is null then
    perform public.raise_app_error('NOT_FOUND', 'routine');
  end if;
  perform public.require_member(v_routine.space_id);

  -- 같은 request_id 재시도는 같은 결과, 새 request_id 는 독립 실행 (06 §1). 루틴 잠금 후 확인.
  -- Retrying the same request_id replays; a new one is an independent run (06 §1). Checked after the routine lock.
  v_existing := public.find_request_event(v_uid, p_request_id, array['manual_run'::public.routine_event_type], p_routine_id);
  if v_existing.id is not null then
    return jsonb_build_object('event_id', v_existing.id, 'occurrence_id', v_existing.occurrence_id, 'replayed', true);
  end if;
  if v_routine.mode <> 'manual' or v_routine.archived_at is not null then
    perform public.raise_app_error('VALIDATION_ERROR', 'not an active manual routine');
  end if;

  -- 유효한 마지막 실행의 원래 담당자 다음 순번으로 교대 (D19)
  -- Rotate to the next after the last valid run's original assignee (D19)
  select original_assignee_id into v_prev
  from public.routine_occurrences
  where routine_id = p_routine_id and is_manual and status = 'completed'
  order by resolved_at desc, seq desc
  limit 1;
  v_assignee := public.pick_assignee(p_routine_id, v_prev);
  v_today := public.space_today(v_routine.space_id);

  insert into public.routine_occurrences (
    space_id, routine_id, rule_version, is_manual, due_local_date, original_assignee_id, assigned_user_id,
    status, performer_id, resolved_by, resolved_at, resolved_local_date
  ) values (
    v_routine.space_id, p_routine_id, v_routine.current_rule_version, true, v_today, v_assignee, v_assignee,
    'completed', v_uid, v_uid, now(), v_today
  )
  returning id into v_occ_id;

  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, performer_id, original_assignee_id, request_id, payload
  ) values (
    v_routine.space_id, p_routine_id, v_occ_id, 'manual_run', v_uid, v_uid, v_assignee, p_request_id,
    jsonb_build_object('resolved_local_date', v_today, 'title', v_routine.title)
  )
  returning id into v_event_id;

  return jsonb_build_object('event_id', v_event_id, 'occurrence_id', v_occ_id, 'replayed', false);
end;
$$;

-- 수동 루틴의 다음 담당자 (화면 표시용)
-- Next assignee of a manual routine (for display)
create function public.next_manual_assignee(p_routine_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_prev uuid;
begin
  select space_id into v_space_id from public.routines where id = p_routine_id;
  if v_space_id is null or not public.is_space_member(v_space_id) then
    perform public.raise_app_error('NOT_MEMBER');
  end if;
  select original_assignee_id into v_prev
  from public.routine_occurrences
  where routine_id = p_routine_id and is_manual and status = 'completed'
  order by resolved_at desc, seq desc
  limit 1;
  return public.pick_assignee(p_routine_id, v_prev);
end;
$$;

------------------------------------------------------------------------------
-- CMD-05 undoCompletion (완료·건너뛰기·수동 실행 취소)
-- CMD-05 undoCompletion (undo completion, skip or manual run)
------------------------------------------------------------------------------
create function public.undo_resolution(p_occurrence_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.routine_events%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_routine public.routines%rowtype;
  v_resolve_event public.routine_events%rowtype;
  v_follow public.routine_occurrences%rowtype;
  v_event_id uuid;
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  v_occ := public.lock_occurrence(p_occurrence_id);
  v_existing := public.find_request_event(v_uid, p_request_id, array['undone'::public.routine_event_type], p_occurrence_id);
  if v_existing.id is not null then
    return jsonb_build_object('event_id', v_existing.id, 'occurrence_id', v_existing.occurrence_id, 'replayed', true);
  end if;

  select * into v_routine from public.routines where id = v_occ.routine_id;
  if v_routine.archived_at is not null then
    perform public.raise_app_error('VALIDATION_ERROR', 'routine archived');
  end if;

  if v_occ.status not in ('completed', 'skipped') then
    perform public.raise_app_error('ALREADY_RESOLVED', 'nothing to undo');
  end if;

  -- 본인 기록만 직접 정정, 타인 기록은 정정 요청 (D18 권장 초안)
  -- Only one's own record can be corrected directly; others need a correction request (D18 draft)
  if v_occ.resolved_by is distinct from v_uid then
    perform public.raise_app_error('FORBIDDEN', 'only the recorder can undo');
  end if;

  select * into v_resolve_event from public.routine_events
  where occurrence_id = v_occ.id and event_type in ('completed', 'skipped', 'manual_run')
    and not exists (select 1 from public.routine_events u where u.reverts_event_id = routine_events.id)
  order by recorded_at desc
  limit 1;

  if v_occ.is_manual then
    -- 이후 실행이 이미 있으면 교대 순서 자동 재작성 금지
    -- If later runs exist, do not rewrite rotation automatically
    if exists (
      select 1 from public.routine_occurrences
      where routine_id = v_occ.routine_id and is_manual and status = 'completed'
        and (resolved_at > v_occ.resolved_at or (resolved_at = v_occ.resolved_at and seq > v_occ.seq))
    ) then
      perform public.raise_app_error('CONFLICT_VERSION', 'later runs exist');
    end if;
    update public.routine_occurrences set status = 'void', version = version + 1 where id = v_occ.id;
  else
    if v_routine.mode = 'after_resolution' then
      select * into v_follow from public.routine_occurrences
      where created_from_occurrence_id = v_occ.id
      for update;
      if v_follow.id is not null then
        -- 후속 회차가 변경·완료·도움 요청되었으면 충돌로 반환 (자동 삭제 금지)
        -- If the follow-up was changed, resolved or has help requests, report a conflict (no auto delete)
        if v_follow.status <> 'scheduled' or v_follow.custom_override or v_follow.version > 1
          or exists (select 1 from public.help_requests h where h.occurrence_id = v_follow.id)
          or exists (select 1 from public.routine_events e where e.occurrence_id = v_follow.id) then
          perform public.raise_app_error('CONFLICT_VERSION', 'follow-up occurrence changed');
        end if;
        update public.notification_outbox o set status = 'cancelled'
        where o.status = 'pending' and o.data ->> 'occurrence_id' = v_follow.id::text;
        delete from public.routine_occurrences where id = v_follow.id;
      end if;
    end if;

    update public.routine_occurrences
    set status = 'scheduled', performer_id = null, resolved_by = null, resolved_at = null,
        resolved_local_date = null, version = version + 1
    where id = v_occ.id;
  end if;

  -- 원 이벤트는 지우지 않고 취소 이벤트를 추가한다
  -- Keep the original event and append an undo event
  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, original_assignee_id, reverts_event_id, request_id, payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id, 'undone', v_uid, v_occ.original_assignee_id, v_resolve_event.id,
    p_request_id, jsonb_build_object('previous_status', v_occ.status, 'title', v_routine.title)
  )
  returning id into v_event_id;

  return jsonb_build_object('event_id', v_event_id, 'occurrence_id', v_occ.id, 'replayed', false);
end;
$$;

------------------------------------------------------------------------------
-- CMD-07 requestHelp / CMD-08 respondHelp
------------------------------------------------------------------------------
create function public.request_help(
  p_occurrence_id uuid,
  p_recipient_id uuid,
  p_message text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.routine_events%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_title text;
  v_requester_name text;
  v_help_id uuid;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  v_occ := public.lock_occurrence(p_occurrence_id);
  v_existing := public.find_request_event(
    v_uid, p_request_id, array['help_requested'::public.routine_event_type], p_occurrence_id
  );
  if v_existing.id is not null then
    return jsonb_build_object('help_request_id', v_existing.payload ->> 'help_request_id', 'replayed', true);
  end if;
  if v_occ.status <> 'scheduled' then
    perform public.raise_app_error('ALREADY_RESOLVED');
  end if;
  if v_occ.assigned_user_id is distinct from v_uid then
    perform public.raise_app_error('FORBIDDEN', 'only the assignee can ask for help');
  end if;
  if p_recipient_id = v_uid then
    perform public.raise_app_error('VALIDATION_ERROR', 'cannot ask yourself');
  end if;
  if not exists (
    select 1 from public.space_members
    where space_id = v_occ.space_id and user_id = p_recipient_id and left_at is null
  ) then
    perform public.raise_app_error('NOT_MEMBER', 'recipient');
  end if;
  if exists (select 1 from public.help_requests where occurrence_id = v_occ.id and status = 'pending') then
    perform public.raise_app_error('CONFLICT_VERSION', 'pending request exists');
  end if;
  if char_length(coalesce(v_message, '')) > 100 then
    perform public.raise_app_error('VALIDATION_ERROR', 'message too long');
  end if;

  insert into public.help_requests (space_id, occurrence_id, requester_id, recipient_id, message)
  values (v_occ.space_id, v_occ.id, v_uid, p_recipient_id, v_message)
  returning id into v_help_id;

  select title into v_title from public.routines where id = v_occ.routine_id;
  select nickname into v_requester_name from public.profiles where user_id = v_uid;

  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, original_assignee_id, request_id, payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id, 'help_requested', v_uid, v_occ.original_assignee_id, p_request_id,
    jsonb_build_object('help_request_id', v_help_id, 'recipient_id', p_recipient_id, 'title', v_title)
  );

  -- 행동이 필요한 중요 이벤트는 즉시 알림 (D06). 메시지 본문은 알림에 싣지 않는다.
  -- Important actionable events notify immediately (D06). Message text is not included in the push.
  perform public.enqueue_notification(
    p_recipient_id, v_occ.space_id, 'help_request', 'help_request:' || v_help_id,
    '도움 요청', v_requester_name || '님이 "' || v_title || '" 도움을 요청했어요',
    jsonb_build_object('help_request_id', v_help_id, 'occurrence_id', v_occ.id, 'routine_id', v_occ.routine_id, 'actor_id', v_uid),
    now(), null, true
  );

  return jsonb_build_object('help_request_id', v_help_id, 'replayed', false);
end;
$$;

create function public.respond_help(p_help_request_id uuid, p_accept boolean, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.routine_events%rowtype;
  v_help public.help_requests%rowtype;
  v_occ public.routine_occurrences%rowtype;
  v_occurrence_id uuid;
  v_title text;
  v_name text;
begin
  if p_request_id is null then
    perform public.raise_app_error('VALIDATION_ERROR', 'request_id required');
  end if;
  -- 잠금 순서: 루틴 → 회차 → 도움 요청 (완료 처리와 교착 방지)
  -- Lock order: routine → occurrence → help request (avoids deadlock with completion)
  select occurrence_id into v_occurrence_id from public.help_requests where id = p_help_request_id;
  if v_occurrence_id is null then
    perform public.raise_app_error('NOT_FOUND', 'help request');
  end if;
  v_occ := public.lock_occurrence(v_occurrence_id);
  select * into v_help from public.help_requests where id = p_help_request_id for update;

  v_existing := public.find_request_event(
    v_uid, p_request_id,
    array[case when p_accept then 'help_accepted' else 'help_declined' end::public.routine_event_type],
    p_help_request_id
  );
  if v_existing.id is not null then
    return jsonb_build_object('help_request_id', p_help_request_id, 'replayed', true);
  end if;

  if v_help.recipient_id <> v_uid then
    perform public.raise_app_error('FORBIDDEN', 'only the recipient can respond');
  end if;
  if v_help.status <> 'pending' then
    perform public.raise_app_error('ALREADY_RESOLVED', v_help.status::text);
  end if;

  -- 이미 처리됐거나 요청자가 더 이상 담당이 아니면 요청을 취소 처리하고 알린다 (예외 대신 반환해 커밋 유지)
  -- If resolved or the requester is no longer assigned, cancel the request and report it (return, not raise, so it commits)
  if p_accept and (v_occ.status <> 'scheduled' or v_occ.assigned_user_id is distinct from v_help.requester_id) then
    update public.help_requests set status = 'cancelled', responded_at = now() where id = v_help.id;
    return jsonb_build_object('help_request_id', v_help.id, 'accepted', false, 'cancelled', true, 'replayed', false);
  end if;

  update public.help_requests
  set status = case when p_accept then 'accepted'::public.help_status else 'declined'::public.help_status end,
      responded_at = now()
  where id = v_help.id;

  if p_accept then
    -- 수락 후에만 담당 변경. 원래 담당자(교대 기준)는 유지 (D18)
    -- Assignment changes only after acceptance; the original assignee (rotation basis) is kept (D18)
    update public.routine_occurrences
    set assigned_user_id = v_uid, custom_override = true, version = version + 1
    where id = v_occ.id;
  end if;

  select title into v_title from public.routines where id = v_occ.routine_id;
  select nickname into v_name from public.profiles where user_id = v_uid;

  insert into public.routine_events (
    space_id, routine_id, occurrence_id, event_type, actor_id, original_assignee_id, request_id, payload
  ) values (
    v_occ.space_id, v_occ.routine_id, v_occ.id,
    case when p_accept then 'help_accepted'::public.routine_event_type else 'help_declined'::public.routine_event_type end,
    v_uid, v_occ.original_assignee_id, p_request_id,
    jsonb_build_object('help_request_id', v_help.id, 'requester_id', v_help.requester_id, 'title', v_title)
  );

  perform public.enqueue_notification(
    v_help.requester_id, v_occ.space_id, 'help_response', 'help_response:' || v_help.id,
    case when p_accept then '도움 수락' else '도움 요청 거절' end,
    v_name || '님이 "' || v_title || '" 요청을 ' || case when p_accept then '수락했어요' else '거절했어요' end,
    jsonb_build_object('help_request_id', v_help.id, 'occurrence_id', v_occ.id, 'routine_id', v_occ.routine_id, 'actor_id', v_uid),
    now(), null, true
  );

  return jsonb_build_object('help_request_id', v_help.id, 'accepted', p_accept, 'replayed', false);
end;
$$;

------------------------------------------------------------------------------
-- CMD-09 sendReaction
------------------------------------------------------------------------------
create function public.send_reaction(p_event_id uuid, p_type public.reaction_type, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_event public.routine_events%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_reaction_id uuid;
begin
  select * into v_event from public.routine_events where id = p_event_id;
  if v_event.id is null then
    perform public.raise_app_error('NOT_FOUND', 'event');
  end if;
  perform public.require_member(v_event.space_id);
  if v_event.event_type not in ('completed', 'manual_run') then
    perform public.raise_app_error('VALIDATION_ERROR', 'only completions can receive reactions');
  end if;
  if v_event.actor_id = v_uid then
    perform public.raise_app_error('VALIDATION_ERROR', 'cannot react to your own record');
  end if;
  if exists (select 1 from public.routine_events u where u.reverts_event_id = v_event.id) then
    perform public.raise_app_error('ALREADY_RESOLVED', 'record was undone');
  end if;
  if char_length(coalesce(v_message, '')) > 100 then
    perform public.raise_app_error('VALIDATION_ERROR', 'message too long');
  end if;

  insert into public.reactions (space_id, event_id, author_id, type, message)
  values (v_event.space_id, v_event.id, v_uid, p_type, v_message)
  on conflict (event_id, author_id) do update
    set type = excluded.type, message = excluded.message, removed_at = null, created_at = now()
  returning id into v_reaction_id;

  return jsonb_build_object('reaction_id', v_reaction_id);
end;
$$;

create function public.remove_reaction(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.reactions set removed_at = now(), message = null
  where event_id = p_event_id and author_id = v_uid and removed_at is null;
  return jsonb_build_object('removed', found);
end;
$$;

-- 도움 요청 메시지는 요청자·수신자에게만 공개 (07 보안: 민감 본문 최소 노출)
-- Help request messages are visible only to requester and recipient (07 security: minimize sensitive text)
create function public.list_help_messages(p_space_id uuid)
returns table (id uuid, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member(p_space_id);
begin
  return query
    select h.id, h.message
    from public.help_requests h
    where h.space_id = p_space_id
      and h.status = 'pending'
      and h.message is not null
      and (h.requester_id = v_uid or h.recipient_id = v_uid);
end;
$$;
