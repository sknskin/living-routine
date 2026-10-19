-- 추천 루틴 템플릿, Realtime 발행 대상, 함수 실행 권한 정리
-- Recommended routine templates, Realtime publication, function execute grants

-- 추천 템플릿 (start_date 는 선택 시점에 클라이언트가 채운다)
-- Recommended templates (the client fills start_date at selection time)
insert into public.routine_templates (id, category, title, mode, rule, sort_order) values
  ('trash', '청소', '쓰레기 버리기', 'fixed', '{"freq":"weekly","weekdays":[2,5],"interval":1}', 10),
  ('recycle', '청소', '분리수거', 'fixed', '{"freq":"weekly","weekdays":[0],"interval":1}', 20),
  ('bathroom', '청소', '화장실 청소', 'after_resolution', '{"interval_days":7}', 30),
  ('vacuum', '청소', '청소기 돌리기', 'after_resolution', '{"interval_days":3}', 40),
  ('laundry', '세탁', '빨래', 'manual', '{}', 50),
  ('bedding', '세탁', '침구 세탁', 'after_resolution', '{"interval_days":14}', 60),
  ('dishes', '주방', '설거지', 'manual', '{}', 70),
  ('fridge', '주방', '냉장고 정리', 'after_resolution', '{"interval_days":14}', 80),
  ('plants', '생활', '화분 물주기', 'after_resolution', '{"interval_days":4}', 90),
  ('filter', '생활', '정수기 필터 확인', 'fixed', '{"freq":"monthly","day":1,"interval":1}', 100),
  ('bills', '생활', '공과금 납부', 'fixed', '{"freq":"monthly","day":25,"interval":1}', 110);

-- Realtime 은 재조회 신호로만 사용 (RLS 적용)
-- Realtime is only an invalidation signal (RLS applies)
-- help_requests 는 메시지 본문이 있어 발행하지 않는다. 도움 요청 변경은 routine_events 이벤트로 감지된다.
-- help_requests is not published (it has message text); help changes are detected via routine_events.
alter publication supabase_realtime add table
  public.routines,
  public.routine_occurrences,
  public.routine_events,
  public.reactions,
  public.space_members,
  public.notification_outbox;

-- 기본 실행 권한 회수 후 클라이언트용 RPC 만 authenticated 에 허용
-- Revoke default execute, then grant only client-facing RPCs to authenticated
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_space_member(uuid),
  public.is_space_admin(uuid),
  public.shares_space_with(uuid),
  public.create_space(text, text),
  public.update_profile(text),
  public.create_invitation(uuid),
  public.revoke_invitation(uuid),
  public.list_invitations(uuid),
  public.preview_invite(text),
  public.accept_invite(text),
  public.leave_space(uuid),
  public.transfer_admin(uuid, uuid),
  public.remove_member(uuid, uuid),
  public.upsert_routine(uuid, uuid, text, public.routine_mode, jsonb, public.assignment_mode, uuid[], boolean, integer, boolean, uuid),
  public.set_routine_archived(uuid, boolean),
  public.ensure_space_occurrences(uuid),
  public.complete_occurrence(uuid, uuid),
  public.skip_occurrence(uuid, uuid),
  public.run_manual_routine(uuid, uuid),
  public.next_manual_assignee(uuid),
  public.undo_resolution(uuid, uuid),
  public.request_help(uuid, uuid, text, uuid),
  public.respond_help(uuid, boolean, uuid),
  public.send_reaction(uuid, public.reaction_type, text),
  public.remove_reaction(uuid),
  public.preview_routine_dates(public.routine_mode, jsonb, date, integer),
  public.update_notification_preferences(boolean, time, boolean, time, time, text),
  public.set_space_notifications(uuid, boolean),
  public.register_push_device(text, text),
  public.set_push_device_enabled(uuid, boolean),
  public.mark_notifications_read(uuid[]),
  public.request_account_deletion(),
  public.list_help_messages(uuid),
  public.archive_space(uuid)
to authenticated;

-- 이후 생성되는 함수도 기본적으로 공개 실행 불가
-- Functions created later are not publicly executable by default
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 모든 테이블 생성 후, PostgREST 가 쓰지 않는 불필요 권한 회수
-- After all tables exist, revoke privileges PostgREST never needs
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;

-- 도움 요청 메시지 열은 직접 조회 불가 (list_help_messages RPC 로만)
-- The help request message column is not directly selectable (list_help_messages RPC only)
revoke select on public.help_requests from authenticated;
grant select (id, space_id, occurrence_id, requester_id, recipient_id, status, responded_at, created_at)
  on public.help_requests to authenticated;
