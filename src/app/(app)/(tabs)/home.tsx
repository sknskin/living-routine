// 홈: 내 할 일 우선 + 전체 필터. 화면 순서는 03 문서 "현재 할 일 → 요청/미완료 → 오늘의 완료 → 최근 활동".
// 참고 이미지의 구성원 아바타·오늘의 진행 링·하루 요약 카드를 반영 (D08, FR-07).
// Home: my tasks first + all filter. Order follows doc 03 "current → requests/overdue → done today → recent activity".
// Adds the reference-image member avatars, today's progress ring and daily summary card (D08, FR-07).
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProgressRing } from '@/components/charts/progress-ring';
import { StatTile } from '@/components/charts/stat-tile';
import { HelpRequestCard } from '@/components/help-request-card';
import { EmptyHomeIllustration, TogetherIllustration } from '@/components/illustrations/scenes';
import { ManualRunRow } from '@/components/manual-run-row';
import { MembersStrip } from '@/components/members-strip';
import { RoutineRow } from '@/components/routine-row';
import { SpaceHeader } from '@/components/space-header';
import { TimelineEvent } from '@/components/timeline-event';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { ErrorState, LoadingView, NoticeBanner } from '@/components/ui/states';
import { Spacing, useThemeColors } from '@/constants/theme';
import {
  useHelpRequests,
  useHomeOccurrences,
  useMemberNames,
  useMembers,
  useRoutineMap,
  useRoutines,
  useSpaceStats,
  useSpaceToday,
  useTimeline,
} from '@/hooks/use-space-data';
import { ensureSpaceOccurrences } from '@/lib/api/commands';
import { HOME_LOOKAHEAD_DAYS, RECENT_ACTIVITY_COUNT } from '@/lib/config';
import { formatDate } from '@/lib/dates';
import { classifyHome, type HomeFilter } from '@/lib/home-sections';
import { occurrenceBadge } from '@/lib/occurrence-badge';
import { ruleSummary } from '@/lib/routine-labels';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace } from '@/providers/space-provider';
import type { Occurrence } from '@/types/domain';

// 지난 미완료 접힘 상태에서 보여줄 개수
// Number of overdue items shown when collapsed
const OVERDUE_PREVIEW = 3;
const RING_SIZE = 104;

export default function HomeScreen() {
  const colors = useThemeColors();
  const userId = useUserId();
  const space = useCurrentSpace();
  const today = useSpaceToday();
  const [filter, setFilter] = useState<HomeFilter>('mine');
  const [showAllOverdue, setShowAllOverdue] = useState(false);

  const occurrences = useHomeOccurrences();
  const routinesQuery = useRoutines();
  const routines = useRoutineMap();
  const members = useMembers();
  const help = useHelpRequests();
  const timeline = useTimeline();
  const { stats } = useSpaceStats();
  const nameOf = useMemberNames();

  // 진입 시 가까운 미래 회차 보충 (멱등)
  // Top up near-future occurrences on entry (idempotent)
  const topUp = useMutation({ mutationFn: () => ensureSpaceOccurrences(space.id) });
  const { mutate: runTopUp } = topUp;
  useEffect(() => {
    runTopUp(undefined, {
      onSuccess: () => occurrences.refetch(),
      onError: (error) => console.warn('[home] top-up failed', error),
    });
    // 공간이 바뀔 때만 실행
    // Run only when the space changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  const sections = useMemo(
    () =>
      classifyHome({
        occurrences: occurrences.data ?? [],
        routines,
        today,
        lookaheadDays: HOME_LOOKAHEAD_DAYS,
        filter,
        userId,
      }),
    [occurrences.data, routines, today, filter, userId],
  );
  // 진행 링은 필터와 무관하게 "내 몫"과 "공간 전체"를 함께 보여준다
  // The ring shows both "mine" and "whole space" regardless of the filter
  const allSections = useMemo(
    () =>
      classifyHome({
        occurrences: occurrences.data ?? [],
        routines,
        today,
        lookaheadDays: HOME_LOOKAHEAD_DAYS,
        filter: 'all',
        userId,
      }),
    [occurrences.data, routines, today, userId],
  );

  if (occurrences.isPending || routinesQuery.isPending) {
    return <LoadingView />;
  }
  if (occurrences.error) {
    return <ErrorState error={occurrences.error} onRetry={() => occurrences.refetch()} />;
  }

  const activeRoutines = (routinesQuery.data ?? []).filter((routine) => !routine.archived_at);
  const manualRoutines = activeRoutines.filter((routine) => routine.mode === 'manual');
  const incomingHelp = (help.data ?? []).filter((request) => request.recipient_id === userId);
  const outgoingHelp = (help.data ?? []).filter((request) => request.requester_id === userId);
  const activeMembers = (members.data ?? []).filter((member) => member.active);
  const doneTodayAll = allSections.doneToday.filter((item) => item.status === 'completed');
  const totalToday = doneTodayAll.length + allSections.current.length;
  const myDoneToday = doneTodayAll.filter((item) => item.performer_id === userId).length;
  const recent = (timeline.data ?? []).slice(0, RECENT_ACTIVITY_COUNT);

  const routineOf = (occurrence: Occurrence) => routines.get(occurrence.routine_id);
  const openOccurrence = (occurrence: Occurrence) =>
    router.push({ pathname: '/occurrence/[id]', params: { id: occurrence.id } });
  const renderRow = (occurrence: Occurrence, subtitleOverride?: string) => {
    const routine = routineOf(occurrence);
    const avatarUserId = occurrence.status === 'completed' ? occurrence.performer_id : occurrence.assigned_user_id;
    const who = occurrence.status === 'completed' ? `${nameOf(occurrence.performer_id)} 완료` : nameOf(occurrence.assigned_user_id);
    return (
      <RoutineRow
        key={occurrence.id}
        occurrence={occurrence}
        title={routine?.title ?? ''}
        avatarUserId={avatarUserId}
        subtitle={subtitleOverride ?? `${who} · ${routine ? ruleSummary(routine.mode, routine.rule) : ''}`}
        badge={occurrenceBadge(occurrence, today)}
        onOpen={() => openOccurrence(occurrence)}
      />
    );
  };
  const visibleOverdue = showAllOverdue ? sections.overdue : sections.overdue.slice(0, OVERDUE_PREVIEW);
  const hasActivityToday = stats && (stats.today.done > 0 || stats.today.requests > 0 || stats.today.reactions > 0);

  return (
    <Screen refreshing={occurrences.isRefetching} onRefresh={() => occurrences.refetch()}>
      <SpaceHeader title={`오늘의 생활 · ${formatDate(today)}`} />

      <Card>
        <MembersStrip members={members.data ?? []} userId={userId} />
        {activeMembers.length === 1 ? (
          <View style={styles.invite}>
            <AppText variant="small" tone="secondary" style={styles.inviteText}>
              함께 사는 사람이 있다면 초대해 담당을 나눠 보세요. 혼자 써도 괜찮아요.
            </AppText>
            <Button compact variant="secondary" label="초대하기" onPress={() => router.push('/space')} />
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText weight="bold">오늘의 진행</AppText>
        <View style={styles.progress}>
          <ProgressRing done={doneTodayAll.length} total={totalToday} size={RING_SIZE} />
          <View style={styles.progressList}>
            <ProgressLine label="나의 완료" value={myDoneToday} />
            <ProgressLine label="함께 완료" value={doneTodayAll.length} />
            <ProgressLine label="남은 일" value={allSections.current.length} />
          </View>
        </View>
      </Card>

      <Row role="radiogroup" label="보기 범위">
        <Chip label="내 할 일" selected={filter === 'mine'} onPress={() => setFilter('mine')} />
        <Chip label="전체" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </Row>

      {activeRoutines.length === 0 ? (
        <Card style={styles.empty}>
          <EmptyHomeIllustration label="빈 집 일러스트" />
          <AppText variant="title">아직 루틴이 없어요</AppText>
          <AppText tone="secondary" style={styles.center}>
            추천 루틴을 고르거나 직접 만들어 보세요.
          </AppText>
          <Button label="루틴 추가하기" onPress={() => router.push('/routines')} />
        </Card>
      ) : (
        <View style={styles.section}>
          <SectionHeader title={`지금 할 일 ${sections.current.length}`} />
          <Card>
            {sections.current.length > 0 ? (
              sections.current.map((occurrence) => renderRow(occurrence))
            ) : (
              <AppText tone="secondary">지금 할 일이 없어요. 가벼운 하루예요 🌿</AppText>
            )}
          </Card>
        </View>
      )}

      {manualRoutines.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="필요할 때" />
          <Card>
            {manualRoutines.map((routine) => (
              <ManualRunRow key={routine.id} routine={routine} nameOf={nameOf} />
            ))}
          </Card>
        </View>
      ) : null}

      {incomingHelp.length > 0 || outgoingHelp.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="요청" />
          {incomingHelp.map((request) => {
            const target = (occurrences.data ?? []).find((item) => item.id === request.occurrence_id);
            return (
              <HelpRequestCard
                key={request.id}
                request={request}
                title={target ? routineOf(target)?.title ?? '루틴' : '루틴'}
                requesterName={nameOf(request.requester_id)}
              />
            );
          })}
          {outgoingHelp.map((request) => {
            const target = (occurrences.data ?? []).find((item) => item.id === request.occurrence_id);
            return (
              <NoticeBanner
                key={request.id}
                message={`${nameOf(request.recipient_id)}님에게 “${target ? routineOf(target)?.title ?? '' : ''}” 도움을 요청했어요 · 수락 대기 중`}
              />
            );
          })}
        </View>
      ) : null}

      {sections.overdue.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={`지난 미완료 ${sections.overdue.length}`} />
          <NoticeBanner tone="warning" message="지난 회차는 자동으로 넘기지 않아요. 완료하거나 건너뛸 수 있어요." />
          <Card>
            {visibleOverdue.map((occurrence) => renderRow(occurrence))}
            {sections.overdue.length > OVERDUE_PREVIEW ? (
              <Button
                variant="ghost"
                label={showAllOverdue ? '접기' : `모두 보기 (${sections.overdue.length})`}
                onPress={() => setShowAllOverdue(!showAllOverdue)}
              />
            ) : null}
          </Card>
        </View>
      ) : null}

      {sections.doneToday.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="오늘 처리함" />
          <Card>
            {sections.doneToday.map((occurrence) =>
              renderRow(
                occurrence,
                occurrence.status === 'skipped' ? '건너뛴 회차 (완료로 세지 않아요)' : `${nameOf(occurrence.performer_id)} 완료`,
              ),
            )}
          </Card>
        </View>
      ) : null}

      {recent.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title="최근 활동"
            action={<Button compact variant="ghost" label="전체 기록" onPress={() => router.push('/history')} />}
          />
          <Card>
            {recent.map((event) => (
              <TimelineEvent key={event.id} event={event} userId={userId} nameOf={nameOf} compact />
            ))}
          </Card>
        </View>
      ) : null}

      {sections.upcoming.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="다가오는 일" />
          <Card>{sections.upcoming.map((occurrence) => renderRow(occurrence))}</Card>
        </View>
      ) : null}

      {hasActivityToday && stats ? (
        <Card style={[styles.summary, { backgroundColor: colors.warm, borderColor: colors.warm }]}>
          <AppText variant="title">오늘도 수고했어요 🌿</AppText>
          <AppText variant="small" tone="secondary">
            {space.name}에서 함께 한 일
          </AppText>
          <View style={styles.tiles}>
            <StatTile icon="checkmark-done-outline" tone="green" value={stats.today.done} label="완료한 일" />
            <StatTile icon="hand-left-outline" tone="blue" value={stats.today.requests} label="서로 보낸 요청" />
            <StatTile icon="heart-outline" tone="pink" value={stats.today.reactions} label="주고받은 반응" />
          </View>
          <View style={styles.center}>
            <TogetherIllustration size={150} label="서로 응원하는 두 사람 일러스트" />
            <AppText variant="small" weight="medium">
              작은 인정이 큰 힘이 돼요 💛
            </AppText>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}개`} style={styles.progressLine}>
      <AppText variant="small" tone="secondary">
        {label}
      </AppText>
      <AppText weight="bold">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  invite: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inviteText: { flex: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl },
  progressList: { flex: 1, gap: Spacing.sm },
  progressLine: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { alignItems: 'center' },
  center: { alignItems: 'center', textAlign: 'center' },
  summary: { gap: Spacing.md },
  tiles: { flexDirection: 'row', gap: Spacing.md },
});
