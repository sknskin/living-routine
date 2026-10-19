// 서버 검증 명령 RPC 래퍼. 중요 쓰기는 request_id 로 멱등 처리한다.
// Server-verified command RPC wrappers. Important writes are idempotent via request_id.
import { toAppError } from '@/lib/errors';
import { asRecord, getBoolean, getString, type JsonRecord } from '@/lib/json';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type { AssignmentMode, ReactionType, RoutineMode, RoutineRule } from '@/types/domain';

// RPC 결과를 JsonRecord 로 반환, 오류는 AppError
// Return RPC result as JsonRecord; errors become AppError
async function callRecord(promise: PromiseLike<{ data: Json | null; error: unknown }>): Promise<JsonRecord> {
  const result = await promise;
  if (result.error) {
    throw toAppError(result.error);
  }
  return asRecord(result.data);
}

function requireString(record: JsonRecord, key: string): string {
  const value = getString(record, key);
  if (!value) {
    throw toAppError({ message: `TEMPORARY_FAILURE: missing ${key}` });
  }
  return value;
}

export async function createSpace(name: string, timezone: string): Promise<string> {
  const record = await callRecord(supabase.rpc('create_space', { p_name: name, p_timezone: timezone }));
  return requireString(record, 'space_id');
}

export async function updateProfile(nickname: string): Promise<void> {
  await callRecord(supabase.rpc('update_profile', { p_nickname: nickname }));
}

export type CreatedInvitation = { code: string; expiresAt: string };

export async function createInvitation(spaceId: string): Promise<CreatedInvitation> {
  const record = await callRecord(supabase.rpc('create_invitation', { p_space_id: spaceId }));
  return { code: requireString(record, 'code'), expiresAt: requireString(record, 'expires_at') };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await callRecord(supabase.rpc('revoke_invitation', { p_invitation_id: invitationId }));
}

export type InvitePreview = {
  spaceId: string;
  spaceName: string;
  memberCount: number;
  expiresAt: string;
  alreadyMember: boolean;
};

export async function previewInvite(code: string): Promise<InvitePreview> {
  const record = await callRecord(supabase.rpc('preview_invite', { p_code: code }));
  return {
    spaceId: requireString(record, 'space_id'),
    spaceName: requireString(record, 'space_name'),
    memberCount: typeof record.member_count === 'number' ? record.member_count : 0,
    expiresAt: requireString(record, 'expires_at'),
    alreadyMember: getBoolean(record, 'already_member'),
  };
}

export async function acceptInvite(code: string): Promise<string> {
  const record = await callRecord(supabase.rpc('accept_invite', { p_code: code }));
  return requireString(record, 'space_id');
}

export async function leaveSpace(spaceId: string): Promise<void> {
  await callRecord(supabase.rpc('leave_space', { p_space_id: spaceId }));
}

export async function transferAdmin(spaceId: string, userId: string): Promise<void> {
  await callRecord(supabase.rpc('transfer_admin', { p_space_id: spaceId, p_user_id: userId }));
}

export async function removeMember(spaceId: string, userId: string): Promise<void> {
  await callRecord(supabase.rpc('remove_member', { p_space_id: spaceId, p_user_id: userId }));
}

export async function archiveSpace(spaceId: string): Promise<void> {
  await callRecord(supabase.rpc('archive_space', { p_space_id: spaceId }));
}

export type RoutineInput = {
  spaceId: string;
  routineId: string | null;
  title: string;
  mode: RoutineMode;
  rule: RoutineRule;
  assignmentMode: AssignmentMode;
  assignees: string[];
  notifyEnabled: boolean;
  expectedVersion: number | null;
  applyToCurrent: boolean;
  // 신규 생성 멱등 키 (수정 시 생략)
  // Creation idempotency key (omit when editing)
  requestId?: string;
};

export async function upsertRoutine(input: RoutineInput): Promise<string> {
  const record = await callRecord(
    supabase.rpc('upsert_routine', {
      p_space_id: input.spaceId,
      // 신규 생성은 null 을 보낸다 (생성 타입은 null 을 표현하지 못함)
      // New routines send null (generated types cannot express null here)
      p_routine_id: input.routineId as string,
      p_title: input.title,
      p_mode: input.mode,
      p_rule: input.rule,
      p_assignment_mode: input.assignmentMode,
      p_assignees: input.assignees,
      p_notify_enabled: input.notifyEnabled,
      p_expected_version: input.expectedVersion ?? undefined,
      p_apply_to_current: input.applyToCurrent,
      p_request_id: input.requestId,
    }),
  );
  return requireString(record, 'routine_id');
}

export async function setRoutineArchived(routineId: string, archived: boolean): Promise<void> {
  await callRecord(supabase.rpc('set_routine_archived', { p_routine_id: routineId, p_archived: archived }));
}

export async function ensureSpaceOccurrences(spaceId: string): Promise<void> {
  const result = await supabase.rpc('ensure_space_occurrences', { p_space_id: spaceId });
  if (result.error) {
    throw toAppError(result.error);
  }
}

export async function completeOccurrence(occurrenceId: string, requestId: string): Promise<void> {
  await callRecord(supabase.rpc('complete_occurrence', { p_occurrence_id: occurrenceId, p_request_id: requestId }));
}

export async function skipOccurrence(occurrenceId: string, requestId: string): Promise<void> {
  await callRecord(supabase.rpc('skip_occurrence', { p_occurrence_id: occurrenceId, p_request_id: requestId }));
}

export async function undoResolution(occurrenceId: string, requestId: string): Promise<void> {
  await callRecord(supabase.rpc('undo_resolution', { p_occurrence_id: occurrenceId, p_request_id: requestId }));
}

export async function runManualRoutine(routineId: string, requestId: string): Promise<string> {
  const record = await callRecord(supabase.rpc('run_manual_routine', { p_routine_id: routineId, p_request_id: requestId }));
  return requireString(record, 'occurrence_id');
}

export async function requestHelp(
  occurrenceId: string,
  recipientId: string,
  message: string,
  requestId: string,
): Promise<void> {
  await callRecord(
    supabase.rpc('request_help', {
      p_occurrence_id: occurrenceId,
      p_recipient_id: recipientId,
      p_message: message,
      p_request_id: requestId,
    }),
  );
}

// 반환값: 요청이 이미 무효(처리됨·담당 변경)라 서버가 취소했는지 여부
// Returns whether the server cancelled the request because it was stale (resolved or reassigned)
export async function respondHelp(helpRequestId: string, accept: boolean, requestId: string): Promise<boolean> {
  const record = await callRecord(
    supabase.rpc('respond_help', { p_help_request_id: helpRequestId, p_accept: accept, p_request_id: requestId }),
  );
  return getBoolean(record, 'cancelled');
}

export async function sendReaction(eventId: string, type: ReactionType, message: string): Promise<void> {
  await callRecord(supabase.rpc('send_reaction', { p_event_id: eventId, p_type: type, p_message: message }));
}

export async function removeReaction(eventId: string): Promise<void> {
  await callRecord(supabase.rpc('remove_reaction', { p_event_id: eventId }));
}

export type PreferencesInput = {
  summaryEnabled: boolean;
  summaryTime: string;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
};

export async function updatePreferences(input: PreferencesInput): Promise<void> {
  await callRecord(
    supabase.rpc('update_notification_preferences', {
      p_summary_enabled: input.summaryEnabled,
      p_summary_time: input.summaryTime,
      p_quiet_enabled: input.quietEnabled,
      p_quiet_start: input.quietStart,
      p_quiet_end: input.quietEnd,
      p_timezone: input.timezone,
    }),
  );
}

export async function setSpaceNotifications(spaceId: string, enabled: boolean): Promise<void> {
  await callRecord(supabase.rpc('set_space_notifications', { p_space_id: spaceId, p_enabled: enabled }));
}

export async function setPushDeviceEnabled(deviceId: string, enabled: boolean): Promise<void> {
  await callRecord(supabase.rpc('set_push_device_enabled', { p_device_id: deviceId, p_enabled: enabled }));
}

export async function markNotificationsRead(ids: string[] | null): Promise<void> {
  const result = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {});
  if (result.error) {
    throw toAppError(result.error);
  }
}

export async function requestAccountDeletion(): Promise<void> {
  await callRecord(supabase.rpc('request_account_deletion'));
}

export async function setRoutineNotification(routineId: string, enabled: boolean): Promise<void> {
  await callRecord(supabase.rpc('set_routine_notification', { p_routine_id: routineId, p_enabled: enabled }));
}

export type OccurrenceChange = {
  occurrenceId: string;
  dueLocalDate: string | null;
  assigneeId: string | null;
  clearAssignee: boolean;
  requestId: string;
};

// 이번 회차만 변경 (날짜·담당)
// Change this occurrence only (date/assignee)
export async function updateOccurrence(change: OccurrenceChange): Promise<void> {
  await callRecord(
    supabase.rpc('update_occurrence', {
      p_occurrence_id: change.occurrenceId,
      // null 은 "변경 없음" (생성 타입은 null 을 표현하지 못함)
      // null means "unchanged" (generated types cannot express null here)
      p_due_local_date: change.dueLocalDate as string,
      p_assignee_id: change.assigneeId as string,
      p_clear_assignee: change.clearAssignee,
      p_request_id: change.requestId,
    }),
  );
}

export async function requestCorrection(occurrenceId: string, message: string, requestId: string): Promise<void> {
  await callRecord(
    supabase.rpc('request_correction', { p_occurrence_id: occurrenceId, p_message: message, p_request_id: requestId }),
  );
}

export async function renameSpace(spaceId: string, name: string): Promise<void> {
  await callRecord(supabase.rpc('rename_space', { p_space_id: spaceId, p_name: name }));
}

export async function stepDownAdmin(spaceId: string): Promise<void> {
  await callRecord(supabase.rpc('step_down_admin', { p_space_id: spaceId }));
}
