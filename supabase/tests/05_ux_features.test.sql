-- UX 보완 기능 테스트: 개인 알림, 이번 회차만 변경, 정정 요청, 공간 이름 변경, 관리자 내려놓기, 반응 확장
-- UX feature tests: personal notifications, single occurrence change, correction request, rename, step down, reactions
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('dddddddd-0000-0000-0000-000000000001', 'u1@test.local', '{"nickname":"가"}', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000002', 'u2@test.local', '{"nickname":"나"}', 'authenticated', 'authenticated');

select (now() at time zone 'Asia/Seoul')::date as today \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_space('기능집', 'Asia/Seoul') ->> 'space_id') as s1 \gset
select (public.create_invitation(:'s1') ->> 'code') as code \gset
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select public.accept_invite(:'code');
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.upsert_routine(
  :'s1', null, '매일 물주기', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', :'today', 'time', '00:00'),
  'free', null, true
) ->> 'routine_id') as r1 \gset
select id as o_today from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date \gset
select id as o_next from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date + 1 \gset

------------------------------------------------------------------------------
-- 개인 알림: 끈 사람에게는 개별 알림이 생기지 않음 (U03)
-- Personal notifications: no reminder for a member who turned it off (U03)
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select public.set_routine_notification(:'r1', false);
reset role;
select public.enqueue_scheduled_notifications();
select is(
  (select count(*)::integer from public.notification_outbox where data ->> 'occurrence_id' = :'o_today' and kind = 'reminder'
     and recipient_id = 'dddddddd-0000-0000-0000-000000000002'),
  0, 'member who opted out gets no reminder'
);
select is(
  (select count(*)::integer from public.notification_outbox where data ->> 'occurrence_id' = :'o_today' and kind = 'reminder'
     and recipient_id = 'dddddddd-0000-0000-0000-000000000001'),
  1, 'other member still gets the reminder'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select enabled from public.routine_notification_prefs where routine_id = :'r1'), false, 'own preference readable');
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.routine_notification_prefs), 0, 'others'' preferences hidden');

------------------------------------------------------------------------------
-- 이번 회차만 변경 (06 §4, §7)
-- Change this occurrence only (06 §4, §7)
------------------------------------------------------------------------------
-- 동작 정의 변경(재검토 R1): 같은 날짜에 다른 회차가 있어도 미래 날짜로 옮길 수 있다 (원래 슬롯은 slot_date 로 유지)
-- Behavior redefined (re-review R1): moving onto a future date is allowed even if another occurrence is there (slot kept via slot_date)
select is(
  (public.update_occurrence(:'o_next', (:'today'::date + 2), null, false, gen_random_uuid()) ->> 'replayed')::boolean,
  false, 'daily occurrence can be postponed onto a date that has another occurrence'
);
select throws_like(
  $$ select public.update_occurrence('$$ || :'o_next' || $$', ('$$ || :'today' || $$'::date - 1), null, false, gen_random_uuid()) $$,
  '%date in the past%', 'cannot move into the past'
);
select is(
  (public.update_occurrence(:'o_today', null, 'dddddddd-0000-0000-0000-000000000002', false, '50000000-0000-0000-0000-000000000001') ->> 'replayed')::boolean,
  false, 'assignee changed for this occurrence'
);
select is((select custom_override from public.routine_occurrences where id = :'o_today'), true, 'marked as individual change');
select is(
  (select assigned_user_id::text from public.routine_occurrences where id = :'o_today'),
  'dddddddd-0000-0000-0000-000000000002', 'new assignee stored'
);
-- 취소된 알림은 RLS 상 본인에게도 보이지 않으므로 관리자 권한으로 확인
-- Cancelled notifications are hidden by RLS even from the owner, so check with the admin role
reset role;
select is(
  (select status from public.notification_outbox where data ->> 'occurrence_id' = :'o_today' and kind = 'reminder'
     and recipient_id = 'dddddddd-0000-0000-0000-000000000001'),
  'cancelled', 'old reminder cancelled after change'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.routine_events where occurrence_id = :'o_today' and event_type = 'rescheduled'), 1, 'change recorded as event');

-- 규칙을 바꿔도 개별 변경 회차는 보존
-- Individually changed occurrence survives a rule change
select public.upsert_routine(
  :'s1', :'r1', '매일 물주기', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 3, 'start_date', :'today'),
  'free', null, true, null, true
);
select ok(exists (select 1 from public.routine_occurrences where id = :'o_today'), 'override kept after rule change with apply-to-current');

------------------------------------------------------------------------------
-- 정정 요청 (D18, O05)
-- Correction request (D18, O05)
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select public.complete_occurrence(:'o_today', gen_random_uuid());
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is((public.request_correction(:'o_today', '제가 했어요', gen_random_uuid()) ->> 'replayed')::boolean, false, 'correction requested');
reset role;
select is(
  (select status from public.notification_outbox where kind = 'correction_request' and recipient_id = 'dddddddd-0000-0000-0000-000000000002'),
  'delivered', 'recorder notified immediately'
);
select is(
  (select data ->> 'message' from public.notification_outbox where kind = 'correction_request' and recipient_id = 'dddddddd-0000-0000-0000-000000000002'),
  '제가 했어요', 'correction message kept in recipient-only notification data'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_like($$ select public.request_correction('$$ || :'o_today' || $$', null, gen_random_uuid()) $$, '%undo your own record%', 'recorder undoes directly instead');

------------------------------------------------------------------------------
-- 반응 확장, 공간 이름 변경, 관리자 내려놓기
-- Extra reactions, rename, step down
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select id as ev1 from public.routine_events where occurrence_id = :'o_today' and event_type = 'completed' \gset
select ok((public.send_reaction(:'ev1', 'relieved', null) ->> 'reaction_id') is not null, 'new reaction type accepted');
select public.rename_space(:'s1', '새 이름');
select is((select name from public.spaces where id = :'s1'), '새 이름', 'admin renamed space');
select throws_like($$ select public.step_down_admin('$$ || :'s1' || $$') $$, '%LAST_ADMIN%', 'last admin cannot step down');

select * from finish();
rollback;
