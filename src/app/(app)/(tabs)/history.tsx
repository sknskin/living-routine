// 기록 탭: 최근 7일 함께 완료 차트 + 나의 기록 + 타임라인(구성원 필터·더 보기) (FR-09, 03 "사람·수행·감사 흐름").
// 구성원끼리 비교하는 차트는 두지 않는다 (점수·비교·랭킹 없음).
// History tab: 7-day "done together" chart + my record + timeline (member filter, load more) (FR-09).
// No member-vs-member comparison charts (no scores, comparisons or rankings).
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StatTile } from '@/components/charts/stat-tile';
import { WeekBars } from '@/components/charts/week-bars';
import { TogetherIllustration } from '@/components/illustrations/scenes';
import { SpaceHeader } from '@/components/space-header';
import { TimelineEvent } from '@/components/timeline-event';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { ErrorState, LoadingView } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { useMemberNames, useMembers, useSpaceStats, useSpaceToday } from '@/hooks/use-space-data';
import { fetchTimelinePage } from '@/lib/api/queries';
import { TIMELINE_PAGE_SIZE } from '@/lib/config';
import { queryKeys } from '@/lib/query-keys';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace } from '@/providers/space-provider';
import type { RoutineEventType } from '@/types/domain';

type Filter = 'done' | 'all';

// 기본 보기: 완료·실행·건너뛰기 (요청·취소·변경은 전체 활동에서)
// Default view: completions/runs/skips (requests, undos and changes under "all")
const DONE_TYPES: RoutineEventType[] = ['completed', 'manual_run', 'skipped'];

export default function HistoryScreen() {
  const userId = useUserId();
  const space = useCurrentSpace();
  const today = useSpaceToday();
  const members = useMembers();
  const nameOf = useMemberNames();
  const { stats } = useSpaceStats();
  const [filter, setFilter] = useState<Filter>('done');
  const [person, setPerson] = useState<string | null>(null);

  const pages = useInfiniteQuery({
    queryKey: queryKeys.timelinePages(space.id),
    queryFn: ({ pageParam }) => fetchTimelinePage(space.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length < TIMELINE_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.recorded_at ?? undefined,
  });

  const events = useMemo(
    () =>
      (pages.data?.pages.flat() ?? []).filter(
        (event) =>
          (filter === 'all' || DONE_TYPES.includes(event.event_type)) && (!person || event.actor_id === person),
      ),
    [pages.data, filter, person],
  );

  if (pages.isPending) return <LoadingView />;
  if (pages.error) return <ErrorState error={pages.error} onRetry={() => pages.refetch()} />;

  const activeMembers = (members.data ?? []).filter((member) => member.active);
  const solo = activeMembers.length <= 1;

  return (
    <Screen refreshing={pages.isRefetching} onRefresh={() => pages.refetch()}>
      <SpaceHeader title={solo ? '내 활동 기록' : '함께한 기록'} />

      {stats ? (
        <Card>
          <AppText weight="bold">{solo ? '최근 7일 완료' : '최근 7일 함께 완료'}</AppText>
          <WeekBars days={stats.week} today={today} />
        </Card>
      ) : null}

      {stats ? (
        <Card>
          <AppText weight="bold">나의 7일</AppText>
          <View style={styles.tiles}>
            <StatTile icon="checkmark-done-outline" tone="green" value={stats.mine.done} label="내가 한 일" />
            <StatTile icon="heart-outline" tone="pink" value={stats.mine.reactionsReceived} label="받은 반응" />
            {!solo ? <StatTile icon="hand-left-outline" tone="blue" value={stats.mine.helped} label="도와준 일" /> : null}
          </View>
        </Card>
      ) : null}

      <SectionHeader title="타임라인" />
      <Row role="radiogroup" label="기록 종류">
        <Chip label="완료 기록" selected={filter === 'done'} onPress={() => setFilter('done')} />
        <Chip label="전체 활동" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </Row>
      {!solo ? (
        <Row role="radiogroup" label="구성원">
          <Chip label="모두" selected={person === null} onPress={() => setPerson(null)} />
          {activeMembers.map((member) => (
            <Chip
              key={member.userId}
              label={member.userId === userId ? '나' : member.nickname}
              selected={person === member.userId}
              onPress={() => setPerson(member.userId)}
            />
          ))}
        </Row>
      ) : null}

      {events.length === 0 ? (
        <Card style={styles.empty}>
          <TogetherIllustration size={140} label="두 사람 일러스트" />
          <AppText variant="title">아직 기록이 없어요</AppText>
          <AppText tone="secondary">루틴을 완료하면 여기에 쌓여요.</AppText>
        </Card>
      ) : (
        <Card>
          {events.map((event) => (
            <TimelineEvent key={event.id} event={event} userId={userId} nameOf={nameOf} />
          ))}
          {pages.hasNextPage ? (
            <Button
              variant="ghost"
              label="이전 기록 더 보기"
              loading={pages.isFetchingNextPage}
              onPress={() => {
                pages.fetchNextPage().catch((error: unknown) => console.warn('[history] next page failed', error));
              }}
            />
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: Spacing.md },
  empty: { alignItems: 'center', gap: Spacing.sm },
});
