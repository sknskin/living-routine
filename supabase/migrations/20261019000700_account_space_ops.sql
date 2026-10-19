-- 계정 삭제(CMD-11)·공간 보관·백업 복원 후 재삭제
-- Account deletion (CMD-11), space archiving, re-deletion after backup restore
-- 근거: docs/planning/docs/08-privacy-operations.md (D14, D23)
-- Source: docs/planning/docs/08-privacy-operations.md (D14, D23)

-- 삭제 요청 이력: 복원 후 재삭제 근거. 민감 내용은 저장하지 않는다.
-- Deletion request log: basis for re-deletion after restore. Stores no sensitive content.
create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index deletion_requests_user_idx on public.deletion_requests (user_id);

alter table public.deletion_requests enable row level security;
revoke all on public.deletion_requests from anon, authenticated;

-- 탈퇴 사용자 표시명
-- Display name for deleted users
create function public.deleted_user_nickname()
returns text
language sql
immutable
as $$ select '탈퇴한 사용자' $$;

-- 사용자 개인정보 정리 (계정 삭제 및 복원 후 재삭제 공용)
-- Scrub a user's personal data (shared by account deletion and post-restore re-deletion)
create function public.scrub_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_others integer;
  v_other_admins integer;
  v_successor uuid;
begin
  for v_member in
    select m.space_id, m.role from public.space_members m
    where m.user_id = p_user_id and m.left_at is null
  loop
    select count(*), count(*) filter (where role = 'admin')
    into v_others, v_other_admins
    from public.space_members
    where space_id = v_member.space_id and left_at is null and user_id <> p_user_id;

    if v_others = 0 then
      -- 혼자 쓰던 개인 공간은 삭제 (08 §계정 삭제)
      -- A space used alone is deleted (08 account deletion)
      delete from public.spaces where id = v_member.space_id;
      continue;
    end if;

    if v_member.role = 'admin' and v_other_admins = 0 then
      -- 계정 삭제는 막지 않고 가장 오래된 구성원에게 관리자 이전 (D22 보완 권장안)
      -- Do not block deletion; transfer admin to the longest-standing member (D22 supplementary default)
      select user_id into v_successor from public.space_members
      where space_id = v_member.space_id and left_at is null and user_id <> p_user_id
      order by joined_at
      limit 1;
      update public.space_members set role = 'admin'
      where space_id = v_member.space_id and user_id = v_successor and left_at is null;
    end if;

    perform public.detach_member(v_member.space_id, p_user_id);
  end loop;

  -- 자유 입력 메시지는 재식별 위험이 있어 제거
  -- Remove free-text messages due to re-identification risk
  update public.reactions set message = null where author_id = p_user_id;
  update public.help_requests set message = null where requester_id = p_user_id;

  delete from public.notification_outbox where recipient_id = p_user_id;
  -- 다른 사람의 알림함에 남은 이 사용자 이름이 담긴 알림도 제거 (D23 비식별)
  -- Remove notifications in others' inboxes that carry this user's name (D23 de-identification)
  delete from public.notification_outbox where data ->> 'actor_id' = p_user_id::text;

  -- 이미 떠나 보관된 혼자 쓰던 공간도 삭제 (이 사용자 외 구성원 이력이 없는 공간)
  -- Also delete archived spaces used alone (no membership history besides this user)
  delete from public.spaces s
  where s.archived_at is not null
    and exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = p_user_id)
    and not exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id <> p_user_id);
  delete from public.push_devices where user_id = p_user_id;
  delete from public.space_notification_settings where user_id = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;

  update public.profiles
  set nickname = public.deleted_user_nickname(), deleted_at = coalesce(deleted_at, now())
  where user_id = p_user_id;
end;
$$;

-- 계정 삭제 전 재인증 유효 시간(초): 이 시간 안에 새로 로그인한 토큰만 허용
-- Re-authentication window in seconds: only tokens issued within this window may delete the account
create function public.reauth_window_seconds()
returns integer
language sql
immutable
as $$ select 300 $$;

create function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_request_id uuid;
  v_password_at bigint;
begin
  -- 재인증 필수 (CMD-11, 08): 토큰 갱신으로는 바뀌지 않는 amr 의 비밀번호 인증 시각을 확인
  -- Re-authentication required (CMD-11, 08): check the password auth time in amr, which token refresh does not renew
  select max((entry ->> 'timestamp')::bigint) into v_password_at
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
  where entry ->> 'method' = 'password';
  if v_password_at is null or v_password_at < extract(epoch from now())::bigint - public.reauth_window_seconds() then
    perform public.raise_app_error('REAUTH_REQUIRED');
  end if;

  insert into public.deletion_requests (user_id) values (v_uid) returning id into v_request_id;

  perform public.scrub_user_data(v_uid);

  -- 인증 계정 삭제 (세션·토큰 무효화)
  -- Delete the auth account (invalidates sessions and tokens)
  delete from auth.users where id = v_uid;

  update public.deletion_requests set status = 'completed', completed_at = now() where id = v_request_id;
  return jsonb_build_object('deletion_request_id', v_request_id, 'status', 'completed');
end;
$$;

-- 백업 복원 후 이미 삭제 요청된 사용자를 다시 정리 (운영자 전용)
-- Re-scrub users who had requested deletion after a backup restore (operators only)
create function public.reapply_account_deletions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_count integer := 0;
begin
  for v_user in select distinct user_id from public.deletion_requests where status = 'completed' loop
    perform public.scrub_user_data(v_user.user_id);
    delete from auth.users where id = v_user.user_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 공간 보관(소프트 삭제). 관리자만.
-- Archive (soft delete) a space. Admins only.
create function public.archive_space(p_space_id uuid)
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
  update public.spaces set archived_at = now(), version = version + 1 where id = p_space_id;
  update public.notification_outbox set status = 'cancelled' where space_id = p_space_id and status = 'pending';
  return jsonb_build_object('archived', true);
end;
$$;
