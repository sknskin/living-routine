-- UX 업데이트 독립 리뷰 회귀 테스트: 슬롯 재생성, 알림 키 충돌, 정정 요청 남용, 비멤버·권한, 탈퇴 담당 회차 이동
-- Regression tests for the UX update review: slot refill, reminder key collision, correction abuse, non-member/permission, moving a departed assignee's occurrence
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'v1@test.local', '{"nickname":"관리"}', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'v2@test.local', '{"nickname":"구성"}', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'v3@test.local', '{"nickname":"외부"}', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'v4@test.local', '{"nickname":"떠남"}', 'authenticated', 'authenticated');

select (now() at time zone 'Asia/Seoul')::date as today \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_space('리뷰2', 'Asia/Seoul') ->> 'space_id') as s1 \gset
select (public.create_invitation(:'s1') ->> 'code') as c2 \gset
select (public.create_invitation(:'s1') ->> 'code') as c4 \gset
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select public.accept_invite(:'c2');
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000004","role":"authenticated"}';
select public.accept_invite(:'c4');

set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
-- 이틀마다 (오늘·모레…) / every 2 days (today, day after tomorrow…)
select (public.upsert_routine(
  :'s1', null, '이틀마다 정리', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 2, 'start_date', :'today', 'time', '00:00'),
  'free', null, true
) ->> 'routine_id') as r1 \gset
select id as o_today from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date \gset

------------------------------------------------------------------------------
-- HIGH-1: 날짜를 옮긴 뒤 원래 슬롯이 다시 생성되지 않는다
-- HIGH-1: the original slot is not re-materialized after a move
------------------------------------------------------------------------------
select public.update_occurrence(:'o_today', (:'today'::date + 1), null, false, gen_random_uuid());
reset role;
select public.materialize_all_spaces();
select is(
  (select count(*)::integer from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date),
  0, 'moved slot is not refilled by the materializer'
);
select is(
  (select slot_date from public.routine_occurrences where id = :'o_today'), :'today'::date, 'moved occurrence keeps its slot'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
-- 동작 정의 변경(재검토 R1): 규칙상 날짜로도 이동 가능, 원래 슬롯으로 되돌리기도 가능
-- Behavior redefined (re-review R1): rule dates are allowed, and moving back to the own slot works
select is(
  (public.update_occurrence(:'o_today', (:'today'::date + 2), null, false, gen_random_uuid()) ->> 'replayed')::boolean,
  false, 'can move onto a rule date'
);
select is(
  (public.update_occurrence(:'o_today', :'today'::date, null, false, gen_random_uuid()) ->> 'replayed')::boolean,
  false, 'can move back to its own slot date'
);
reset role;
select public.materialize_all_spaces();
select is(
  (select count(*)::integer from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date),
  1, 'after moving back, exactly one occurrence on the original date'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';

------------------------------------------------------------------------------
-- HIGH-2: 알림을 끄고 다시 켜면 예약 알림이 되살아난다, 키에 예정일 포함
-- HIGH-2: turning notifications off and on revives the reminder; keys include the due date
------------------------------------------------------------------------------
select (public.upsert_routine(
  :'s1', null, '매일 체크', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', :'today', 'time', '00:00'),
  'free', null, true
) ->> 'routine_id') as r2 \gset
select id as o2 from public.routine_occurrences where routine_id = :'r2' and due_local_date = :'today'::date \gset
reset role;
select public.enqueue_scheduled_notifications();
select ok(
  (select logical_event_key like '%:' || :'today' || ':0' from public.notification_outbox
   where data ->> 'occurrence_id' = :'o2' and kind = 'reminder' and recipient_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'reminder key includes the due date'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select public.set_routine_notification(:'r2', false);
select public.set_routine_notification(:'r2', true);
reset role;
select public.enqueue_scheduled_notifications();
select isnt(
  (select status from public.notification_outbox
   where data ->> 'occurrence_id' = :'o2' and kind = 'reminder' and recipient_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'cancelled', 'reminder revived after re-enabling'
);

-- 발송 직전 개인 알림 끔 재확인
-- Personal opt-out is rechecked right before dispatch
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select public.set_routine_notification(:'r2', false);
reset role;
update public.notification_outbox set status = 'pending', scheduled_at = now() - interval '1 minute'
where data ->> 'occurrence_id' = :'o2' and recipient_id = 'eeeeeeee-0000-0000-0000-000000000002' and kind = 'reminder';
select public.dispatch_due_notifications();
select is(
  (select status from public.notification_outbox
   where data ->> 'occurrence_id' = :'o2' and kind = 'reminder' and recipient_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'cancelled', 'dispatcher honors personal opt-out'
);

------------------------------------------------------------------------------
-- 정정 요청 남용 방지
-- Correction request throttle
------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select public.complete_occurrence(:'o2', gen_random_uuid());
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select public.request_correction(:'o2', null, gen_random_uuid());
select throws_like(
  $$ select public.request_correction('$$ || :'o2' || $$', null, gen_random_uuid()) $$,
  '%RATE_LIMITED%', 'second correction request within the window is rejected'
);

------------------------------------------------------------------------------
-- 비멤버·권한
-- Non-member and permissions
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_like($$ select public.update_occurrence('$$ || :'o_today' || $$', null, null, false, gen_random_uuid()) $$, '%NOT_MEMBER%', 'non-member cannot change occurrence');
select throws_like($$ select public.set_routine_notification('$$ || :'r1' || $$', false) $$, '%NOT_MEMBER%', 'non-member cannot set routine notification');
select throws_like($$ select public.rename_space('$$ || :'s1' || $$', 'x') $$, '%NOT_MEMBER%', 'non-member cannot rename');
select throws_like($$ select public.step_down_admin('$$ || :'s1' || $$') $$, '%NOT_MEMBER%', 'non-member cannot step down');
select throws_like($$ select public.request_correction('$$ || :'o2' || $$', null, gen_random_uuid()) $$, '%NOT_MEMBER%', 'non-member cannot request correction');
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_like($$ select public.rename_space('$$ || :'s1' || $$', 'x') $$, '%FORBIDDEN%', 'plain member cannot rename');

------------------------------------------------------------------------------
-- 탈퇴한 담당자의 회차도 날짜만 바꿀 수 있다
-- A departed assignee's occurrence can still be moved by date only
------------------------------------------------------------------------------
select id as o_far from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date + 4 \gset
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000004","role":"authenticated"}';
select public.leave_space(:'s1');
reset role;
update public.routine_occurrences set assigned_user_id = 'eeeeeeee-0000-0000-0000-000000000004' where id = :'o_far';
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (public.update_occurrence(:'o_far', (:'today'::date + 5), null, false, gen_random_uuid()) ->> 'replayed')::boolean,
  false, 'date-only change succeeds even if the current assignee left'
);
select id as o_other from public.routine_occurrences
where routine_id = :'r1' and status = 'scheduled' and id not in (:'o_far', :'o_today') order by due_local_date limit 1 \gset
select throws_like(
  $$ select public.update_occurrence('$$ || :'o_other' || $$', null, 'eeeeeeee-0000-0000-0000-000000000004', false, gen_random_uuid()) $$,
  '%VALIDATION_ERROR%', 'cannot newly assign a departed member'
);

select * from finish();
rollback;
