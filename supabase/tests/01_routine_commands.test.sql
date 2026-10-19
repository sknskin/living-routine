-- 루틴 명령·상태 전이·공간 격리 테스트 (docs/planning/docs/09-test-plan.md T01~T12)
-- Routine command, state transition and space isolation tests (T01~T12 in docs/planning/docs/09-test-plan.md)
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- 테스트 사용자 3명 (A·B 같은 공간, C 다른 공간)
-- Three test users (A and B share a space, C is elsewhere)
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local', '{"nickname":"에이"}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@test.local', '{"nickname":"비"}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'c@test.local', '{"nickname":"씨"}', 'authenticated', 'authenticated');

select is((select nickname from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), '에이', 'profile created on sign-up');

select (now() at time zone 'Asia/Seoul')::date as today \gset

------------------------------------------------------------------------------
-- 공간 생성·초대 (T10)
-- Space creation and invitations (T10)
------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_space('우리집', 'Asia/Seoul') ->> 'space_id') as s1 \gset
select (public.create_invitation(:'s1') ->> 'code') as code \gset
select throws_like($$ select public.create_space('', 'Asia/Seoul') $$, '%VALIDATION_ERROR%', 'empty space name rejected');
select throws_like($$ select public.create_space('x', 'Mars/Base') $$, '%VALIDATION_ERROR%', 'invalid timezone rejected');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is((public.preview_invite(:'code') ->> 'space_name'), '우리집', 'invite preview shows space name');
select is((public.accept_invite(:'code') ->> 'already_member')::boolean, false, 'B joins with invite');
select is((public.accept_invite(:'code') ->> 'already_member')::boolean, true, 'second accept is idempotent');
select throws_like($$ select public.create_invitation('$$ || :'s1' || $$') $$, '%FORBIDDEN%', 'non-admin cannot invite');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_like($$ select public.accept_invite('$$ || :'code' || $$') $$, '%INVITE_INVALID%', 'used invite cannot be reused by another user');
select (public.create_space('씨네', 'Asia/Seoul') ->> 'space_id') as s2 \gset

reset role;
select is((select count(*)::integer from public.space_members where space_id = :'s1' and left_at is null), 2, 'no duplicate membership');

-- 만료 초대
-- Expired invitation
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_invitation(:'s1') ->> 'code') as old_code \gset
reset role;
update public.space_invitations set expires_at = now() - interval '1 minute'
where token_hash = public.hash_invite_code(:'old_code');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_like($$ select public.accept_invite('$$ || :'old_code' || $$') $$, '%INVITE_EXPIRED%', 'expired invite rejected');

------------------------------------------------------------------------------
-- 직접 쓰기 차단·공간 격리 (T09)
-- Direct write denial and space isolation (T09)
------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.routines (space_id, title, mode, created_by) values ('$$ || :'s1' || $$', 'x', 'manual', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  '42501', null, 'direct insert into routines is denied'
);
select is((select count(*)::integer from public.spaces where id = :'s1'), 0, 'C cannot see space 1');

------------------------------------------------------------------------------
-- 완료일 기준 루틴: 완료·교대·건너뛰기·취소 (T01, T02, T03, T05)
-- after_resolution routine: complete, rotate, skip, undo (T01, T02, T03, T05)
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.upsert_routine(
  :'s1', null, '화장실 청소', 'after_resolution',
  jsonb_build_object('interval_days', 7, 'start_date', :'today'),
  'rotate', array['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']::uuid[], true
) ->> 'routine_id') as r1 \gset

select id as o1 from public.routine_occurrences where routine_id = :'r1' and status = 'scheduled' \gset
select is((select assigned_user_id::text from public.routine_occurrences where id = :'o1'), 'aaaaaaaa-0000-0000-0000-000000000001', 'first occurrence assigned to A');

select is((public.complete_occurrence(:'o1', '10000000-0000-0000-0000-000000000001') ->> 'status'), 'completed', 'A completes occurrence');
select is((public.complete_occurrence(:'o1', '10000000-0000-0000-0000-000000000001') ->> 'replayed')::boolean, true, 'same request_id replays without duplicate');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_like($$ select public.complete_occurrence('$$ || :'o1' || $$', gen_random_uuid()) $$, '%ALREADY_RESOLVED%', 'T01: second completer gets ALREADY_RESOLVED');
select throws_like($$ select public.skip_occurrence('$$ || :'o1' || $$', gen_random_uuid()) $$, '%ALREADY_RESOLVED%', 'T02: skip after completion rejected');

select id as o2 from public.routine_occurrences where routine_id = :'r1' and status = 'scheduled' \gset
select is((select assigned_user_id::text from public.routine_occurrences where id = :'o2'), 'aaaaaaaa-0000-0000-0000-000000000002', 'rotation: next occurrence assigned to B');
select is((select due_local_date from public.routine_occurrences where id = :'o2'), (:'today'::date + 7), 'next due = completion date + 7');
select is((select count(*)::integer from public.routine_events where occurrence_id = :'o1' and event_type = 'completed'), 1, 'exactly one completion event');
select throws_like($$ select public.undo_resolution('$$ || :'o1' || $$', gen_random_uuid()) $$, '%FORBIDDEN%', 'B cannot undo A''s record');

-- B 가 다음 회차를 완료하면 A 의 취소는 충돌 (T03)
-- If B completes the follow-up, A's undo conflicts (T03)
select is((public.complete_occurrence(:'o2', gen_random_uuid()) ->> 'status'), 'completed', 'B completes follow-up');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_like($$ select public.undo_resolution('$$ || :'o1' || $$', gen_random_uuid()) $$, '%CONFLICT_VERSION%', 'T03: undo with changed follow-up conflicts');
select is((select status::text from public.routine_occurrences where id = :'o1'), 'completed', 'T03: original completion kept');

-- 건너뛰기: 담당 유지, 건너뛴 날부터 새 주기 (T05)
-- Skip: assignee kept, new cycle from skip date (T05)
select id as o3 from public.routine_occurrences where routine_id = :'r1' and status = 'scheduled' \gset
select assigned_user_id as o3_assignee from public.routine_occurrences where id = :'o3' \gset
select is((public.skip_occurrence(:'o3', gen_random_uuid()) ->> 'status'), 'skipped', 'occurrence skipped');
select id as o4 from public.routine_occurrences where routine_id = :'r1' and status = 'scheduled' \gset
select is((select due_local_date from public.routine_occurrences where id = :'o4'), (:'today'::date + 7), 'T05: next due = skip date + 7');
select is((select assigned_user_id::text from public.routine_occurrences where id = :'o4'), :'o3_assignee', 'T05: skip keeps assignee');
select is((select count(*)::integer from public.routine_events where routine_id = :'r1' and event_type = 'completed'), 2, 'T05: skip not counted as completion');

-- 후속 회차 변경 없으면 취소 시 자동 복구
-- Undo auto-restores when the follow-up is untouched
select is((public.undo_resolution(:'o3', gen_random_uuid()) ->> 'replayed')::boolean, false, 'undo skip succeeds');
select is((select status::text from public.routine_occurrences where id = :'o3'), 'scheduled', 'skipped occurrence reopened');
select is((select count(*)::integer from public.routine_occurrences where id = :'o4'), 0, 'untouched follow-up removed');
select is((select count(*)::integer from public.routine_events where occurrence_id = :'o3'), 2, 'skip event preserved plus undo event');

------------------------------------------------------------------------------
-- 수동 루틴: 하루 여러 번·순차 교대·멱등 (T06)
-- Manual routine: multiple runs a day, sequential rotation, idempotency (T06)
------------------------------------------------------------------------------
select (public.upsert_routine(
  :'s1', null, '빨래', 'manual', '{}'::jsonb,
  'rotate', array['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']::uuid[], false
) ->> 'routine_id') as r2 \gset
select public.run_manual_routine(:'r2', '20000000-0000-0000-0000-000000000001');
select public.run_manual_routine(:'r2', '20000000-0000-0000-0000-000000000001');
select public.run_manual_routine(:'r2', '20000000-0000-0000-0000-000000000002');
select public.run_manual_routine(:'r2', '20000000-0000-0000-0000-000000000003');
select is((select count(*)::integer from public.routine_occurrences where routine_id = :'r2'), 3, 'T06: three independent runs, retry not duplicated');
select is(
  (select array_agg(original_assignee_id::text order by seq) from public.routine_occurrences where routine_id = :'r2'),
  array['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'],
  'T06: rotation A → B → A'
);

------------------------------------------------------------------------------
-- 고정 일정: 미래 생성·개별 수정 보존·규칙 변경 (T04, T07)
-- Fixed schedule: future materialization, override preservation, rule change (T04, T07)
------------------------------------------------------------------------------
select (public.upsert_routine(
  :'s1', null, '물 주기', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', (:'today'::date - 10)),
  'rotate', array['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']::uuid[], true
) ->> 'routine_id') as r3 \gset
select is((select count(*)::integer from public.routine_occurrences where routine_id = :'r3'), 31, 'T04: 30-day window materialized (today..+30)');
select is((select min(due_local_date) from public.routine_occurrences where routine_id = :'r3'), :'today'::date, 'T04: no backfill before today');

-- 개별 수정된 미래 회차를 표시하고 규칙 변경
-- Mark one future occurrence as overridden, then change the rule
reset role;
update public.routine_occurrences set custom_override = true
where routine_id = :'r3' and due_local_date = :'today'::date + 3;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select public.upsert_routine(
  :'s1', :'r3', '물 주기', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 2, 'start_date', :'today'),
  'rotate', array['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']::uuid[], true
);
select ok(
  exists (select 1 from public.routine_occurrences where routine_id = :'r3' and due_local_date = :'today'::date + 3),
  'T07: overridden occurrence preserved'
);
select ok(
  not exists (select 1 from public.routine_occurrences where routine_id = :'r3' and due_local_date = :'today'::date + 5),
  'T07: plain future occurrence recomputed (odd day removed)'
);
select ok(
  exists (select 1 from public.routine_occurrences where routine_id = :'r3' and due_local_date = :'today'::date),
  'T07: current occurrence kept by default'
);
select throws_like(
  $$ select public.upsert_routine('$$ || :'s1' || $$', '$$ || :'r3' || $$', 'x', 'fixed', '{"freq":"daily","start_date":"2026-01-01"}', 'free', null, true, 1) $$,
  '%CONFLICT_VERSION%', 'stale expected_version rejected'
);

------------------------------------------------------------------------------
-- 도움 요청 (T11)
-- Help requests (T11)
------------------------------------------------------------------------------
select id as h_occ from public.routine_occurrences
where routine_id = :'r3' and status = 'scheduled' and assigned_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
order by due_local_date limit 1 \gset
select (public.request_help(:'h_occ', 'aaaaaaaa-0000-0000-0000-000000000002', '부탁해', gen_random_uuid()) ->> 'help_request_id') as help1 \gset
select is((select assigned_user_id::text from public.routine_occurrences where id = :'h_occ'), 'aaaaaaaa-0000-0000-0000-000000000001', 'T11: assignee unchanged before acceptance');
reset role;
select is(
  (select status from public.notification_outbox where logical_event_key = 'help_request:' || :'help1'),
  'delivered', 'important help request delivered immediately to inbox'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_like($$ select public.respond_help('$$ || :'help1' || $$', true, gen_random_uuid()) $$, '%FORBIDDEN%', 'T11: only the recipient can respond');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is((public.respond_help(:'help1', true, gen_random_uuid()) ->> 'accepted')::boolean, true, 'T11: recipient accepts');
select is((select assigned_user_id::text from public.routine_occurrences where id = :'h_occ'), 'aaaaaaaa-0000-0000-0000-000000000002', 'T11: assignee changed after acceptance');
select throws_like($$ select public.respond_help('$$ || :'help1' || $$', false, gen_random_uuid()) $$, '%ALREADY_RESOLVED%', 'T11: second response rejected');

------------------------------------------------------------------------------
-- 마지막 관리자 탈퇴 (T12)
-- Last admin leaving (T12)
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_like($$ select public.leave_space('$$ || :'s1' || $$') $$, '%LAST_ADMIN%', 'T12: last admin cannot leave while members remain');

select * from finish();
rollback;
