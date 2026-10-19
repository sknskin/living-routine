-- 독립 리뷰 지적 사항 회귀 테스트 (H2 멱등 키 재사용, M4 탈퇴 재배정, M6 메시지 공개 범위, M7 생성 멱등, M9, L3, L5, L8)
-- Regression tests for independent review findings (H2, M4, M6, M7, M9, L3, L5, L8)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('cccccccc-0000-0000-0000-000000000001', 'r1@test.local', '{"nickname":"하나"}', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000002', 'r2@test.local', '{"nickname":"둘"}', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', 'r3@test.local', '{"nickname":"셋"}', 'authenticated', 'authenticated');

select (now() at time zone 'Asia/Seoul')::date as today \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_space('리뷰집', 'Asia/Seoul') ->> 'space_id') as s1 \gset
select (public.create_invitation(:'s1') ->> 'code') as c2 \gset
select (public.create_invitation(:'s1') ->> 'code') as c3 \gset
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select public.accept_invite(:'c2');
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
select public.accept_invite(:'c3');

------------------------------------------------------------------------------
-- M7: 같은 request_id 로 루틴 생성 재시도 → 1개만 생성
-- M7: retrying routine creation with the same request_id creates only one
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.upsert_routine(
  :'s1', null, '매일 정리', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', :'today'),
  'rotate', array['cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003']::uuid[],
  true, null, false, '30000000-0000-0000-0000-000000000001'
) ->> 'routine_id') as r1 \gset
select is(
  (public.upsert_routine(
    :'s1', null, '매일 정리', 'fixed',
    jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', :'today'),
    'free', null, true, null, false, '30000000-0000-0000-0000-000000000001'
  ) ->> 'replayed')::boolean,
  true, 'M7: create retry replays'
);
select is((select count(*)::integer from public.routines where space_id = :'s1'), 1, 'M7: no duplicate routine');

------------------------------------------------------------------------------
-- H2: 다른 명령에 같은 request_id 재사용 → 성공으로 오인하지 않음
-- H2: reusing a request_id for another command is rejected, not reported as success
------------------------------------------------------------------------------
select id as o1 from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date \gset
select public.complete_occurrence(:'o1', '40000000-0000-0000-0000-000000000001');
select throws_like(
  $$ select public.undo_resolution('$$ || :'o1' || $$', '40000000-0000-0000-0000-000000000001') $$,
  '%request_id reused%', 'H2: completion key reused for undo is rejected'
);
select is((select status::text from public.routine_occurrences where id = :'o1'), 'completed', 'H2: nothing was undone');

------------------------------------------------------------------------------
-- L3: 자기 기록에는 반응 불가
-- L3: cannot react to your own record
------------------------------------------------------------------------------
select id as ev1 from public.routine_events where occurrence_id = :'o1' and event_type = 'completed' \gset
select throws_like($$ select public.send_reaction('$$ || :'ev1' || $$', 'thanks', null) $$, '%own record%', 'L3: self reaction rejected');

------------------------------------------------------------------------------
-- M6: 도움 요청 메시지는 요청자·수신자만 조회
-- M6: help message visible only to requester and recipient
------------------------------------------------------------------------------
select id as h_occ from public.routine_occurrences
where routine_id = :'r1' and status = 'scheduled' and assigned_user_id = 'cccccccc-0000-0000-0000-000000000001'
order by due_local_date limit 1 \gset
select (public.request_help(:'h_occ', 'cccccccc-0000-0000-0000-000000000002', '비밀 메모', gen_random_uuid()) ->> 'help_request_id') as help1 \gset
select is((select message from public.list_help_messages(:'s1') where id = :'help1'), '비밀 메모', 'M6: requester sees message');
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::integer from public.list_help_messages(:'s1')), 0, 'M6: third member cannot read message');
select throws_ok($$ select message from public.help_requests $$, '42501', null, 'M6: message column not directly selectable');

------------------------------------------------------------------------------
-- L5: 요청자가 더 이상 담당이 아니면 수락 시 요청 취소
-- L5: accepting after the requester is no longer assigned cancels the request
------------------------------------------------------------------------------
reset role;
update public.routine_occurrences set assigned_user_id = 'cccccccc-0000-0000-0000-000000000003' where id = :'h_occ';
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select is((public.respond_help(:'help1', true, gen_random_uuid()) ->> 'cancelled')::boolean, true, 'L5: stale acceptance cancelled');
select is((select assigned_user_id::text from public.routine_occurrences where id = :'h_occ'), 'cccccccc-0000-0000-0000-000000000003', 'L5: newer assignee kept');

------------------------------------------------------------------------------
-- M4: 구성원 탈퇴 시 남은 순번으로 고르게 재배정
-- M4: on leave, the leaver's slots are redistributed over the remaining rotation
------------------------------------------------------------------------------
select public.leave_space(:'s1');
reset role;
select is(
  (select count(*)::integer from public.routine_occurrences
   where routine_id = :'r1' and status = 'scheduled' and original_assignee_id = 'cccccccc-0000-0000-0000-000000000002'),
  0, 'M4: no slots left for the leaver'
);
select ok(
  (select abs(
     count(*) filter (where original_assignee_id = 'cccccccc-0000-0000-0000-000000000001')
     - count(*) filter (where original_assignee_id = 'cccccccc-0000-0000-0000-000000000003')) <= 2
   from public.routine_occurrences
   where routine_id = :'r1' and status = 'scheduled' and is_fixed_slot and not custom_override),
  'M4: remaining rotation stays balanced'
);

------------------------------------------------------------------------------
-- M9 / L8: 미리보기 개수 상한, 잘못된 규칙 값은 VALIDATION_ERROR
-- M9 / L8: preview count cap, malformed rule values raise VALIDATION_ERROR
------------------------------------------------------------------------------
select is(
  (select count(*)::integer from public.preview_routine_dates('after_resolution', '{"interval_days":1,"start_date":"2026-01-01"}', '2026-01-01', 100000000)),
  50, 'M9: preview count capped'
);
select throws_like(
  $$ select public.validate_rule('fixed', '{"freq":"daily","start_date":"2026-02-30"}') $$,
  '%VALIDATION_ERROR%', 'L8: invalid date becomes VALIDATION_ERROR'
);

select * from finish();
rollback;
