// 현재 공간 데이터 조회 훅
// Data hooks for the current space
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  fetchEventsSince,
  fetchHomeOccurrences,
  fetchMembers,
  fetchNotifications,
  fetchPendingHelpRequests,
  fetchRoutines,
  fetchTimeline,
} from '@/lib/api/queries';
import { HOME_LOOKAHEAD_DAYS, STATS_WINDOW_DAYS } from '@/lib/config';
import { addDays, todayIn } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';
import { computeStats, type SpaceStats } from '@/lib/stats';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace } from '@/providers/space-provider';
import type { Member, RoutineWithRule } from '@/types/domain';

export function useMembers() {
  const space = useCurrentSpace();
  return useQuery({ queryKey: queryKeys.members(space.id), queryFn: () => fetchMembers(space.id) });
}

// 사용자 ID → 닉네임 조회 함수
// Lookup function from user id to nickname
export function useMemberNames(): (userId: string | null | undefined) => string {
  const { data } = useMembers();
  return useMemo(() => {
    const map = new Map((data ?? []).map((member: Member) => [member.userId, member.nickname]));
    return (userId) => (userId ? map.get(userId) ?? '탈퇴한 사용자' : '누구나');
  }, [data]);
}

export function useRoutines() {
  const space = useCurrentSpace();
  return useQuery({ queryKey: queryKeys.routines(space.id), queryFn: () => fetchRoutines(space.id) });
}

export function useRoutineMap(): Map<string, RoutineWithRule> {
  const { data } = useRoutines();
  return useMemo(() => new Map((data ?? []).map((routine) => [routine.id, routine])), [data]);
}

export function useSpaceToday(): string {
  const space = useCurrentSpace();
  return todayIn(space.timezone);
}

export function useHomeOccurrences() {
  const space = useCurrentSpace();
  const today = useSpaceToday();
  return useQuery({
    queryKey: queryKeys.home(space.id),
    queryFn: () => fetchHomeOccurrences(space.id, today, HOME_LOOKAHEAD_DAYS),
  });
}

export function useTimeline() {
  const space = useCurrentSpace();
  return useQuery({ queryKey: queryKeys.timeline(space.id), queryFn: () => fetchTimeline(space.id) });
}

export function useHelpRequests() {
  const space = useCurrentSpace();
  return useQuery({ queryKey: queryKeys.helpRequests(space.id), queryFn: () => fetchPendingHelpRequests(space.id) });
}

export function useNotifications() {
  const userId = useUserId();
  return useQuery({ queryKey: queryKeys.notifications(userId), queryFn: fetchNotifications });
}

// 최근 7일 통계 (함께 한 양 + 나의 기록). 창 시작보다 하루 여유를 두고 조회.
// Last-7-day stats (together totals + my record). Fetch with a one-day margin before the window.
export function useSpaceStats(): { stats: SpaceStats | null; isPending: boolean; error: unknown; refetch: () => void } {
  const space = useCurrentSpace();
  const userId = useUserId();
  const today = useSpaceToday();
  const since = `${addDays(today, -STATS_WINDOW_DAYS)}T00:00:00Z`;
  const query = useQuery({
    queryKey: queryKeys.stats(space.id, since),
    queryFn: () => fetchEventsSince(space.id, since),
  });
  const stats = useMemo(
    () => (query.data ? computeStats(query.data, today, userId, STATS_WINDOW_DAYS, space.timezone) : null),
    [query.data, today, userId, space.timezone],
  );
  return { stats, isPending: query.isPending, error: query.error, refetch: () => void query.refetch() };
}
