// DB 생성 타입 기반 도메인 타입
// Domain types derived from generated DB types
import type { Database, Enums, Tables } from '@/types/database';

export type RoutineMode = Enums<'routine_mode'>;
export type AssignmentMode = Enums<'assignment_mode'>;
export type OccurrenceStatus = Enums<'occurrence_status'>;
export type RoutineEventType = Enums<'routine_event_type'>;
export type ReactionType = Enums<'reaction_type'>;
export type SpaceRole = Enums<'space_role'>;

export type Space = Tables<'spaces'>;
export type Occurrence = Tables<'routine_occurrences'>;
export type RoutineEvent = Tables<'routine_events'>;
export type Reaction = Tables<'reactions'>;
export type HelpRequest = Tables<'help_requests'>;
export type RoutineTemplate = Tables<'routine_templates'>;
export type NotificationItem = Tables<'notification_outbox'>;
export type NotificationPreferences = Tables<'notification_preferences'>;
export type PushDevice = Tables<'push_devices'>;

export type PublicFunctions = Database['public']['Functions'];

export type FixedFreq = 'daily' | 'weekly' | 'monthly';

// 규칙 JSON (supabase/migrations/..._routine_engine.sql 형식과 동일)
// Rule JSON (same shape as supabase/migrations/..._routine_engine.sql)
export type RoutineRule = {
  freq?: FixedFreq;
  interval?: number;
  weekdays?: number[];
  day?: number;
  interval_days?: number;
  start_date?: string;
  time?: string;
};

export type MySpace = {
  id: string;
  name: string;
  timezone: string;
  role: SpaceRole;
};

export type Member = {
  userId: string;
  nickname: string;
  role: SpaceRole;
  active: boolean;
};

export type RoutineWithRule = Tables<'routines'> & {
  rule: RoutineRule;
  assignees: string[];
};

export type EventWithReactions = RoutineEvent & {
  reactions: Reaction[];
};
