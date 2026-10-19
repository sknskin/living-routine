-- 알림 중복 방지·발송 직전 취소·DND, 계정 삭제 (T13, T14, T17)
-- Notification dedupe, pre-dispatch cancel, DND, account deletion (T13, T14, T17)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'na@test.local', '{"nickname":"나"}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ne@test.local', '{"nickname":"너"}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'solo@test.local', '{"nickname":"혼자"}', 'authenticated', 'authenticated');

select (now() at time zone 'Asia/Seoul')::date as today \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select (public.create_space('알림집', 'Asia/Seoul') ->> 'space_id') as s1 \gset
select (public.create_invitation(:'s1') ->> 'code') as code \gset
-- 00:00 예정 시각 → 오늘 알림은 이미 발송 대상
-- 00:00 reminder time → today's reminder is already due
select (public.upsert_routine(
  :'s1', null, '약 먹기', 'fixed',
  jsonb_build_object('freq', 'daily', 'interval', 1, 'start_date', :'today', 'time', '00:00'),
  'fixed', array['bbbbbbbb-0000-0000-0000-000000000001']::uuid[], true
) ->> 'routine_id') as r1 \gset
select id as o1 from public.routine_occurrences where routine_id = :'r1' and due_local_date = :'today'::date \gset

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
select public.accept_invite(:'code');

------------------------------------------------------------------------------
-- T13: 중복 Cron → 논리 알림 1개
-- T13: duplicate cron runs → one logical notification
------------------------------------------------------------------------------
reset role;
select public.enqueue_scheduled_notifications();
select public.enqueue_scheduled_notifications();
select is(
  (select count(*)::integer from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder'),
  1, 'T13: one reminder despite duplicate cron'
);
select is(
  (select count(*)::integer from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat'),
  1, 'one repeat reminder (max 1)'
);
select is(
  (select recipient_id::text from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder'),
  'bbbbbbbb-0000-0000-0000-000000000001', 'reminder goes only to the assignee'
);

-- 실행 시각과 무관하게 재알림이 아직 미래가 되도록 고정
-- Pin the repeat into the future regardless of when the test runs
update public.notification_outbox set scheduled_at = now() + interval '1 hour'
where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat';

-- 기기 등록 + DND(종일) → 앱 내 전달, 푸시는 DND 종료까지 지연
-- Device + all-day DND → delivered in-app, push deferred until DND ends
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select public.register_push_device('ExponentPushToken[test-device-0001]', 'ios');
select public.update_notification_preferences(true, '08:00', true, '00:00', '23:59', 'Asia/Seoul');
reset role;
select public.dispatch_due_notifications();
select is(
  (select status from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder'),
  'delivered', 'due reminder delivered to inbox'
);
select ok(
  (select push_retry_at > now() from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder'),
  'DND defers push'
);
select is(
  (select status from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat'),
  'pending', 'repeat still pending (scheduled later)'
);

------------------------------------------------------------------------------
-- T14: 완료 후 남은 재알림 취소
-- T14: pending repeat cancelled after completion
------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select public.complete_occurrence(:'o1', gen_random_uuid());
reset role;
select is(
  (select status from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat'),
  'cancelled', 'T14: repeat cancelled after completion'
);

-- 발송 직전 재검증: 완료된 회차의 대기 알림은 취소
-- Pre-dispatch recheck: pending reminder of a resolved occurrence is cancelled
update public.notification_outbox set status = 'pending', scheduled_at = now() - interval '1 minute'
where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat';
select public.dispatch_due_notifications();
select is(
  (select status from public.notification_outbox where data ->> 'occurrence_id' = :'o1' and kind = 'reminder_repeat'),
  'cancelled', 'T14: dispatcher cancels stale reminder'
);

-- 수신자만 자기 알림 조회
-- Only the recipient can see their notifications
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.notification_outbox where recipient_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'other users cannot read my inbox');

------------------------------------------------------------------------------
-- 반응 (FR-09)
-- Reactions (FR-09)
------------------------------------------------------------------------------
select id as ev1 from public.routine_events where occurrence_id = :'o1' and event_type = 'completed' \gset
select ok((public.send_reaction(:'ev1', 'thanks', '고마워') ->> 'reaction_id') is not null, 'member can thank a completion');
select is((select count(*)::integer from public.reactions where event_id = :'ev1'), 1, 'reaction stored');

------------------------------------------------------------------------------
-- T17: 계정 삭제
-- T17: account deletion
------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000003","role":"authenticated"}';
select (public.create_space('혼자집', 'Asia/Seoul') ->> 'space_id') as solo \gset
-- 재인증(최근 발급 토큰) 없이는 삭제 불가
-- Deletion requires re-authentication (freshly issued token)
select throws_like($$ select public.request_account_deletion() $$, '%REAUTH_REQUIRED%', 'T17: deletion requires re-authentication');
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000003', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select public.request_account_deletion();
select throws_like($$ select public.create_space('좀비', 'Asia/Seoul') $$, '%UNAUTHORIZED%', 'deleted account token cannot write');

-- 관리자 A 탈퇴 → 남은 B 가 관리자, 공동 이력은 비식별 묘비로 보존
-- Admin A deletes account → remaining B becomes admin; shared history kept with a tombstone
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000001', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select public.request_account_deletion();
reset role;

select is((select count(*)::integer from public.spaces where id = :'solo'), 0, 'T17: solo space deleted');
select is((select count(*)::integer from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'T17: auth user deleted');
select is((select nickname from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000001'), '탈퇴한 사용자', 'T17: profile de-identified');
select is(
  (select role::text from public.space_members where space_id = :'s1' and user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and left_at is null),
  'admin', 'T17: remaining member promoted to admin'
);
select is(
  (select count(*)::integer from public.routine_events where occurrence_id = :'o1' and event_type = 'completed'),
  1, 'T17: shared completion history preserved'
);

select * from finish();
rollback;
