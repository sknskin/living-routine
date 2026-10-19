// TanStack Query 키. 공간 단위 키는 두 번째 요소가 spaceId 라서 공간 전환 시 일괄 정리할 수 있다.
// TanStack Query keys. Space-scoped keys carry spaceId as the 2nd element so a space switch can clear them together.

export const SPACE_SCOPE = 'space';

export const queryKeys = {
  mySpaces: (userId: string) => ['my-spaces', userId] as const,
  members: (spaceId: string) => [SPACE_SCOPE, spaceId, 'members'] as const,
  routines: (spaceId: string) => [SPACE_SCOPE, spaceId, 'routines'] as const,
  home: (spaceId: string) => [SPACE_SCOPE, spaceId, 'home'] as const,
  occurrences: (spaceId: string, from: string, to: string) => [SPACE_SCOPE, spaceId, 'occurrences', from, to] as const,
  timeline: (spaceId: string) => [SPACE_SCOPE, spaceId, 'timeline'] as const,
  helpRequests: (spaceId: string) => [SPACE_SCOPE, spaceId, 'help'] as const,
  invitations: (spaceId: string) => [SPACE_SCOPE, spaceId, 'invitations'] as const,
  spaceNotify: (spaceId: string) => [SPACE_SCOPE, spaceId, 'notify'] as const,
  occurrence: (spaceId: string, occurrenceId: string) => [SPACE_SCOPE, spaceId, 'occurrence', occurrenceId] as const,
  resolved: (spaceId: string, from: string, to: string) => [SPACE_SCOPE, spaceId, 'resolved', from, to] as const,
  stats: (spaceId: string, since: string) => [SPACE_SCOPE, spaceId, 'stats', since] as const,
  timelinePages: (spaceId: string) => [SPACE_SCOPE, spaceId, 'timeline-pages'] as const,
  routineNotifyPrefs: (userId: string) => ['routine-notify-prefs', userId] as const,
  nextManual: (spaceId: string, routineId: string) => [SPACE_SCOPE, spaceId, 'next-manual', routineId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  templates: () => ['templates'] as const,
  preferences: (userId: string) => ['preferences', userId] as const,
  devices: (userId: string) => ['devices', userId] as const,
  nickname: (userId: string) => ['nickname', userId] as const,
  preview: (mode: string, rule: string, from: string) => ['preview', mode, rule, from] as const,
};

export function spaceScope(spaceId: string): readonly [string, string] {
  return [SPACE_SCOPE, spaceId];
}
