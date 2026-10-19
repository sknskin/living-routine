-- 공간 격리 RLS: 읽기는 활성 멤버만, 업무 쓰기는 서버 검증 RPC(security definer)로만 허용
-- Space isolation RLS: reads for active members only; business writes only through verified RPCs (security definer)
-- 근거: docs/planning/docs/05-data-model-security.md 접근 제어 매트릭스
-- Source: access control matrix in docs/planning/docs/05-data-model-security.md

-- 공통 오류 발생 헬퍼: 메시지는 'CODE: 상세' 형식으로 클라이언트가 코드를 파싱한다.
-- Common error helper: message format 'CODE: detail' so the client can parse the code.
create function public.raise_app_error(p_code text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code || coalesce(': ' || p_detail, '');
end;
$$;

-- 현재 사용자 ID (미인증이면 UNAUTHORIZED)
-- Current user id (UNAUTHORIZED when not signed in)
create function public.require_user()
returns uuid
language plpgsql
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform public.raise_app_error('UNAUTHORIZED');
  end if;
  -- 계정 삭제 후 아직 만료되지 않은 토큰으로의 쓰기 차단
  -- Block writes from not-yet-expired tokens after account deletion
  if not exists (select 1 from public.profiles where user_id = v_uid and deleted_at is null) then
    perform public.raise_app_error('UNAUTHORIZED', 'account deleted');
  end if;
  return v_uid;
end;
$$;

create function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    join public.spaces s on s.id = m.space_id
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.left_at is null
      and s.archived_at is null
  );
$$;

create function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.left_at is null
      and m.role = 'admin'
  );
$$;

-- 대상 사용자와 현재 사용자가 같은 공간에 속하는지 (탈퇴 이력 포함: 과거 기록의 이름 표시용)
-- Whether the target shares any space with the current user (including past members, for history display)
create function public.shares_space_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members mine
    join public.space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = auth.uid()
      and mine.left_at is null
      and theirs.user_id = p_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invitations enable row level security;
alter table public.routine_templates enable row level security;
alter table public.routines enable row level security;
alter table public.routine_rules enable row level security;
alter table public.routine_assignees enable row level security;
alter table public.routine_occurrences enable row level security;
alter table public.routine_events enable row level security;
alter table public.help_requests enable row level security;
alter table public.reactions enable row level security;

-- 비로그인(anon)은 어떤 테이블에도 접근하지 않는다.
-- Anonymous role has no table access.
revoke all on all tables in schema public from anon;

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_space_with(user_id));

create policy spaces_select on public.spaces
  for select to authenticated
  using (public.is_space_member(id));

create policy space_members_select on public.space_members
  for select to authenticated
  using (public.is_space_member(space_id));

-- 초대 원문/해시는 RPC 로만 다룬다. 직접 조회 정책 없음.
-- Invitations are handled only via RPC; no direct select policy.

create policy routine_templates_select on public.routine_templates
  for select to authenticated
  using (true);

create policy routines_select on public.routines
  for select to authenticated
  using (public.is_space_member(space_id));

create policy routine_rules_select on public.routine_rules
  for select to authenticated
  using (exists (
    select 1 from public.routines r where r.id = routine_id and public.is_space_member(r.space_id)
  ));

create policy routine_assignees_select on public.routine_assignees
  for select to authenticated
  using (exists (
    select 1 from public.routines r where r.id = routine_id and public.is_space_member(r.space_id)
  ));

create policy routine_occurrences_select on public.routine_occurrences
  for select to authenticated
  using (public.is_space_member(space_id));

create policy routine_events_select on public.routine_events
  for select to authenticated
  using (public.is_space_member(space_id));

create policy help_requests_select on public.help_requests
  for select to authenticated
  using (public.is_space_member(space_id));

create policy reactions_select on public.reactions
  for select to authenticated
  using (public.is_space_member(space_id));

-- 업무 테이블에 대한 직접 쓰기 권한 회수 (RPC 경유 강제)
-- Revoke direct writes on business tables (force RPC path)
revoke insert, update, delete on
  public.profiles, public.spaces, public.space_members, public.space_invitations,
  public.routine_templates, public.routines, public.routine_rules, public.routine_assignees,
  public.routine_occurrences, public.routine_events, public.help_requests, public.reactions
from authenticated;
