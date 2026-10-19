// 읽기 전용 조회. RLS 가 공간 멤버십으로 결과를 제한한다.
// Read-only queries. RLS limits results by space membership.
import { OVERDUE_LOOKBACK_DAYS, STATS_EVENT_LIMIT, TIMELINE_PAGE_SIZE } from '@/lib/config';
import { addDays } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { toRule } from '@/lib/json';
import { supabase } from '@/lib/supabase';
import type {
  EventWithReactions,
  HelpRequest,
  Member,
  MySpace,
  NotificationItem,
  NotificationPreferences,
  Occurrence,
  PushDevice,
  RoutineMode,
  RoutineRule,
  RoutineTemplate,
  RoutineWithRule,
} from '@/types/domain';

// supabase 응답에서 오류를 던지고 데이터 반환
// Throw on supabase error and return data
function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw toAppError(result.error);
  }
  if (result.data === null) {
    throw toAppError({ message: 'NOT_FOUND' });
  }
  return result.data;
}

export async function fetchMySpaces(userId: string): Promise<MySpace[]> {
  const rows = unwrap(
    await supabase
      .from('space_members')
      .select('role, space:spaces(id, name, timezone, archived_at, created_at)')
      .eq('user_id', userId)
      .is('left_at', null),
  );
  return rows
    .flatMap((row) => (row.space && !row.space.archived_at ? [{ row, space: row.space }] : []))
    .sort((a, b) => a.space.created_at.localeCompare(b.space.created_at))
    .map(({ row, space }) => ({ id: space.id, name: space.name, timezone: space.timezone, role: row.role }));
}

// 과거 구성원 포함 (기록의 이름 표시용)
// Includes past members (for names in history)
export async function fetchMembers(spaceId: string): Promise<Member[]> {
  const rows = unwrap(
    await supabase
      .from('space_members')
      .select('user_id, role, left_at, joined_at, profile:profiles(nickname)')
      .eq('space_id', spaceId)
      .order('joined_at'),
  );
  const byUser = new Map<string, Member>();
  for (const row of rows) {
    const active = row.left_at === null;
    const existing = byUser.get(row.user_id);
    if (!existing || active) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        nickname: row.profile?.nickname ?? '알 수 없음',
        role: row.role,
        active,
      });
    }
  }
  return [...byUser.values()];
}

export async function fetchRoutines(spaceId: string): Promise<RoutineWithRule[]> {
  const rows = unwrap(
    await supabase
      .from('routines')
      .select('*, routine_rules(version, rule), routine_assignees(user_id, sequence_order)')
      .eq('space_id', spaceId)
      .order('created_at'),
  );
  return rows.map(({ routine_rules: rules, routine_assignees: assignees, ...routine }) => ({
    ...routine,
    rule: toRule(rules.find((rule) => rule.version === routine.current_rule_version)?.rule),
    assignees: [...assignees].sort((a, b) => a.sequence_order - b.sequence_order).map((a) => a.user_id),
  }));
}

// 기간 내 회차 (취소된 수동 실행 제외)
// Occurrences in a date range (excluding voided manual runs)
export async function fetchOccurrences(spaceId: string, from: string, to: string): Promise<Occurrence[]> {
  return unwrap(
    await supabase
      .from('routine_occurrences')
      .select('*')
      .eq('space_id', spaceId)
      .gte('due_local_date', from)
      .lte('due_local_date', to)
      .neq('status', 'void')
      .order('due_local_date')
      .order('seq'),
  );
}

// 홈: 지난 미완료 + 앞으로의 예정 + 오늘 처리분
// Home: past overdue + upcoming + resolved today
export async function fetchHomeOccurrences(spaceId: string, today: string, lookahead: number): Promise<Occurrence[]> {
  return fetchOccurrences(spaceId, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, lookahead));
}

export async function fetchTimeline(spaceId: string): Promise<EventWithReactions[]> {
  const rows = unwrap(
    await supabase
      .from('routine_events')
      .select('*, reactions(*)')
      .eq('space_id', spaceId)
      .order('recorded_at', { ascending: false })
      .limit(TIMELINE_PAGE_SIZE),
  );
  return rows.map((row) => ({ ...row, reactions: row.reactions.filter((reaction) => !reaction.removed_at) }));
}

// 메시지 열은 직접 조회할 수 없어 요청자·수신자 전용 RPC 로 합친다 (07 보안)
// The message column is not selectable, so merge it from the requester/recipient-only RPC (07 security)
export async function fetchPendingHelpRequests(spaceId: string): Promise<HelpRequest[]> {
  const rows = unwrap(
    await supabase
      .from('help_requests')
      .select('id, space_id, occurrence_id, requester_id, recipient_id, status, responded_at, created_at')
      .eq('space_id', spaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  );
  const messages = await supabase.rpc('list_help_messages', { p_space_id: spaceId });
  if (messages.error) {
    throw toAppError(messages.error);
  }
  const byId = new Map((messages.data ?? []).map((item) => [item.id, item.message]));
  return rows.map((row) => ({ ...row, message: byId.get(row.id) ?? null }));
}

export async function fetchTemplates(): Promise<RoutineTemplate[]> {
  return unwrap(await supabase.from('routine_templates').select('*').order('sort_order'));
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return unwrap(
    await supabase
      .from('notification_outbox')
      .select('*')
      .order('scheduled_at', { ascending: false })
      .limit(TIMELINE_PAGE_SIZE),
  );
}

export async function fetchPreferences(userId: string): Promise<NotificationPreferences | null> {
  const result = await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data;
}

export async function fetchSpaceNotificationEnabled(spaceId: string, userId: string): Promise<boolean> {
  const result = await supabase
    .from('space_notification_settings')
    .select('enabled')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data?.enabled ?? true;
}

export async function fetchPushDevices(): Promise<PushDevice[]> {
  return unwrap(await supabase.from('push_devices').select('*').order('created_at'));
}

export async function fetchMyNickname(userId: string): Promise<string> {
  const result = await supabase.from('profiles').select('nickname').eq('user_id', userId).maybeSingle();
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data?.nickname ?? '';
}

export async function previewDates(mode: RoutineMode, rule: RoutineRule, from: string, count: number): Promise<string[]> {
  const result = await supabase.rpc('preview_routine_dates', {
    p_mode: mode,
    p_rule: rule,
    p_from: from,
    p_count: count,
  });
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data ?? [];
}

export async function fetchNextManualAssignee(routineId: string): Promise<string | null> {
  const result = await supabase.rpc('next_manual_assignee', { p_routine_id: routineId });
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data ?? null;
}

export type InvitationSummary = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export async function fetchInvitations(spaceId: string): Promise<InvitationSummary[]> {
  const result = await supabase.rpc('list_invitations', { p_space_id: spaceId });
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data ?? [];
}

export async function fetchOccurrence(occurrenceId: string): Promise<Occurrence | null> {
  const result = await supabase.from('routine_occurrences').select('*').eq('id', occurrenceId).maybeSingle();
  if (result.error) {
    throw toAppError(result.error);
  }
  return result.data;
}

export async function fetchOccurrenceEvents(occurrenceId: string): Promise<EventWithReactions[]> {
  const rows = unwrap(
    await supabase
      .from('routine_events')
      .select('*, reactions(*)')
      .eq('occurrence_id', occurrenceId)
      .order('recorded_at', { ascending: false }),
  );
  return rows.map((row) => ({ ...row, reactions: row.reactions.filter((reaction) => !reaction.removed_at) }));
}

// 기간 내에 실제로 처리된 회차 (캘린더의 실제 완료일 표시용)
// Occurrences actually resolved within a range (for actual completion dates in the calendar)
export async function fetchResolvedInRange(spaceId: string, from: string, to: string): Promise<Occurrence[]> {
  return unwrap(
    await supabase
      .from('routine_occurrences')
      .select('*')
      .eq('space_id', spaceId)
      .in('status', ['completed', 'skipped'])
      .gte('resolved_local_date', from)
      .lte('resolved_local_date', to),
  );
}

// 기간 내 이벤트 (주간 통계·최근 활동용, 반응 포함)
// Events within a range (for weekly stats and recent activity, with reactions)
export async function fetchEventsSince(spaceId: string, sinceIso: string): Promise<EventWithReactions[]> {
  const rows = unwrap(
    await supabase
      .from('routine_events')
      .select('*, reactions(*)')
      .eq('space_id', spaceId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
      .limit(STATS_EVENT_LIMIT),
  );
  return rows.map((row) => ({ ...row, reactions: row.reactions.filter((reaction) => !reaction.removed_at) }));
}

// 타임라인 페이지 조회 (recorded_at 커서)
// Paged timeline (recorded_at cursor)
export async function fetchTimelinePage(spaceId: string, before: string | null): Promise<EventWithReactions[]> {
  let query = supabase
    .from('routine_events')
    .select('*, reactions(*)')
    .eq('space_id', spaceId)
    .order('recorded_at', { ascending: false })
    .limit(TIMELINE_PAGE_SIZE);
  if (before) {
    query = query.lt('recorded_at', before);
  }
  const rows = unwrap(await query);
  return rows.map((row) => ({ ...row, reactions: row.reactions.filter((reaction) => !reaction.removed_at) }));
}

export async function fetchRoutineNotificationPrefs(): Promise<Map<string, boolean>> {
  const rows = unwrap(await supabase.from('routine_notification_prefs').select('routine_id, enabled'));
  return new Map(rows.map((row) => [row.routine_id, row.enabled]));
}
