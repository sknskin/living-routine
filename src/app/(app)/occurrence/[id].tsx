// 회차 상세: 완료·건너뛰기·도움 요청·기록 취소 (U04, U05)
// Occurrence detail: complete, skip, help request, undo (U04, U05)
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SpaceGate } from '@/components/space-gate';
import { CategoryIcon } from '@/components/category-icon';
import { CorrectionRequestForm } from '@/components/correction-request-form';
import { HelpRequestForm } from '@/components/help-request-form';
import { MemberAvatar } from '@/components/illustrations/member-avatar';
import { CompletionIllustration } from '@/components/illustrations/scenes';
import { OccurrenceChangeForm } from '@/components/occurrence-change-form';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen, SectionHeader } from '@/components/ui/layout';
import { EmptyState, ErrorState, LoadingView, NoticeBanner } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { useHelpRequests, useMemberNames, useMembers, useRoutineMap, useSpaceToday } from '@/hooks/use-space-data';
import { occurrenceBadge } from '@/lib/occurrence-badge';
import { completeOccurrence, skipOccurrence, undoResolution } from '@/lib/api/commands';
import { fetchOccurrence, fetchOccurrenceEvents } from '@/lib/api/queries';
import { formatDate, formatDateTime } from '@/lib/dates';
import { completionHaptic, confirmAction } from '@/lib/feedback';
import { queryKeys } from '@/lib/query-keys';
import { eventVerb, routineDescription } from '@/lib/routine-labels';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace } from '@/providers/space-provider';

const STATUS_LABEL = { scheduled: '예정', completed: '완료', skipped: '건너뜀', void: '취소됨' } as const;

export default function OccurrenceScreen() {
  return (
    <SpaceGate>
      <OccurrenceScreenContent />
    </SpaceGate>
  );
}

function OccurrenceScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const space = useCurrentSpace();
  const routines = useRoutineMap();
  const nameOf = useMemberNames();
  const members = useMembers();
  const help = useHelpRequests();
  const [helpOpen, setHelpOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const today = useSpaceToday();
  const [conflict, setConflict] = useState<string | null>(null);
  // 명령마다 별도 멱등 키 (다른 명령에 같은 키를 쓰지 않음)
  // A separate idempotency key per command (never reuse a key across commands)
  const completeKey = useRequestKey();
  const skipKey = useRequestKey();
  const undoKey = useRequestKey();

  const occurrenceKey = queryKeys.occurrence(space.id, id);
  const occurrence = useQuery({ queryKey: occurrenceKey, queryFn: () => fetchOccurrence(id) });
  const events = useQuery({
    queryKey: [...occurrenceKey, 'events'],
    queryFn: () => fetchOccurrenceEvents(id),
  });

  const complete = useCommand(() => completeOccurrence(id, completeKey.get()), {
    onSuccess: () => {
      completionHaptic();
      completeKey.settle();
    },
    onError: completeKey.settle,
  });
  const skip = useCommand(() => skipOccurrence(id, skipKey.get()), {
    onSuccess: () => skipKey.settle(),
    onError: skipKey.settle,
  });
  const undo = useCommand(() => undoResolution(id, undoKey.get()), {
    silentError: true,
    onSuccess: () => {
      setConflict(null);
      undoKey.settle();
    },
    onError: (error) => {
      undoKey.settle(error);
      // 후속 회차가 이미 진행되면 자동 복구하지 않고 안내 (D13, T03)
      // If follow-ups already progressed, explain instead of auto-restoring (D13, T03)
      setConflict(
        error.code === 'CONFLICT_VERSION'
          ? '이후 회차가 이미 바뀌었거나 진행되어 자동으로 되돌릴 수 없어요. 기록은 그대로 보존돼요.'
          : error.message,
      );
    },
  });

  if (occurrence.isPending) return <LoadingView />;
  if (occurrence.error) return <ErrorState error={occurrence.error} onRetry={() => occurrence.refetch()} />;
  if (!occurrence.data) return <EmptyState title="회차를 찾을 수 없어요" />;

  const item = occurrence.data;
  const routine = routines.get(item.routine_id);
  const isScheduled = item.status === 'scheduled';
  const pendingHelp = (help.data ?? []).find((request) => request.occurrence_id === item.id);
  const helpCandidates = (members.data ?? []).filter((member) => member.active && member.userId !== userId);
  const canAskHelp = isScheduled && item.assigned_user_id === userId && !pendingHelp && helpCandidates.length > 0;
  const canUndo = (item.status === 'completed' || item.status === 'skipped') && item.resolved_by === userId;
  // 기록자가 있고(탈퇴로 비어 있지 않음) 내가 아닐 때만 정정 요청 가능
  // Correction requests only when a recorder exists (not cleared by deletion) and it is not me
  const resolvedByOther =
    (item.status === 'completed' || item.status === 'skipped') && item.resolved_by !== null && item.resolved_by !== userId;
  const busy = complete.isPending || skip.isPending || undo.isPending;
  const canChange = isScheduled && !item.is_manual && !pendingHelp;

  const confirmSkip = async () => {
    const ok = await confirmAction(
      '이번 회차를 건너뛸까요?',
      routine?.mode === 'after_resolution'
        ? '건너뛰기는 완료로 집계되지 않고, 오늘부터 새 주기가 시작돼요.'
        : '건너뛰기는 완료로 집계되지 않아요.',
      '건너뛰기',
    );
    if (ok) skip.mutate(undefined);
  };

  return (
    <Screen edges={[]}>
      <Card>
        <View style={styles.titleRow}>
          <CategoryIcon title={routine?.title ?? ''} size={48} />
          <View style={styles.titleText}>
            <AppText variant="title">{routine?.title ?? '루틴'}</AppText>
            {routine ? (
              <AppText variant="small" tone="secondary">
                {routineDescription(routine.mode, routine.rule)}
              </AppText>
            ) : null}
          </View>
          <StatusBadge {...occurrenceBadge(item, today)} />
        </View>
        <View style={styles.meta}>
          <AppText>예정일: {formatDate(item.due_local_date)}</AppText>
          <AppText>상태: {STATUS_LABEL[item.status]}</AppText>
          <View style={styles.assignee}>
            {item.assigned_user_id ? <MemberAvatar seed={item.assigned_user_id} size={24} /> : null}
            <AppText>담당: {nameOf(item.assigned_user_id)}</AppText>
          </View>
          {item.original_assignee_id && item.original_assignee_id !== item.assigned_user_id ? (
            <AppText variant="small" tone="secondary">
              원래 순서: {nameOf(item.original_assignee_id)} (교대 순서는 유지돼요)
            </AppText>
          ) : null}
          {item.status === 'completed' ? (
            <View style={styles.assignee}>
              {item.performer_id ? <MemberAvatar seed={item.performer_id} size={24} /> : null}
              <AppText>
                수행: {nameOf(item.performer_id)} · 실제 완료일 {item.resolved_local_date ? formatDate(item.resolved_local_date) : ''}
              </AppText>
            </View>
          ) : null}
        </View>
      </Card>

      {item.status === 'completed' ? (
        <Card style={styles.done}>
          <CompletionIllustration size={110} label="완료 체크 일러스트" />
          <AppText variant="title">완료!</AppText>
          <AppText tone="secondary">
            {nameOf(item.performer_id)}님이 {item.resolved_local_date ? formatDate(item.resolved_local_date) : ''} 완료했어요
          </AppText>
        </Card>
      ) : null}

      {pendingHelp ? (
        <NoticeBanner message={`${nameOf(pendingHelp.recipient_id)}님에게 도움을 요청했어요. 수락을 기다리는 중이에요.`} />
      ) : null}
      {conflict ? <NoticeBanner tone="warning" message={conflict} /> : null}
      {resolvedByOther ? (
        <NoticeBanner message="다른 사람이 남긴 기록은 직접 정정할 수 없어요. 기록한 분께 정정을 요청해 주세요." />
      ) : null}
      {resolvedByOther && !correctionOpen ? (
        <Button variant="secondary" label="정정 요청하기" onPress={() => setCorrectionOpen(true)} />
      ) : null}
      {resolvedByOther && correctionOpen ? (
        <CorrectionRequestForm
          occurrenceId={item.id}
          recorderName={nameOf(item.resolved_by)}
          onDone={() => setCorrectionOpen(false)}
        />
      ) : null}

      {isScheduled ? (
        <View style={styles.actions}>
          <Button label="완료했어요" onPress={() => complete.mutate(undefined)} loading={complete.isPending} disabled={busy} />
          <Button variant="secondary" label="이번 회차 건너뛰기" onPress={confirmSkip} loading={skip.isPending} disabled={busy} />
          {canAskHelp && !helpOpen ? (
            <Button variant="ghost" label="도움 요청하기" onPress={() => setHelpOpen(true)} />
          ) : null}
          {canChange && !changeOpen ? (
            <Button variant="ghost" label="이번 회차만 변경 (날짜·담당)" onPress={() => setChangeOpen(true)} />
          ) : null}
        </View>
      ) : null}

      {changeOpen && canChange ? (
        <OccurrenceChangeForm
          occurrence={item}
          members={members.data ?? []}
          today={today}
          onDone={() => setChangeOpen(false)}
        />
      ) : null}

      {helpOpen && canAskHelp ? (
        <HelpRequestForm occurrenceId={item.id} candidates={helpCandidates} onDone={() => setHelpOpen(false)} />
      ) : null}

      {canUndo ? (
        <Button
          variant="danger"
          label={item.status === 'completed' ? '완료 취소' : '건너뛰기 취소'}
          onPress={() => undo.mutate(undefined)}
          loading={undo.isPending}
          disabled={busy}
        />
      ) : null}

      <SectionHeader title="이 회차의 기록" />
      <Card>
        {(events.data ?? []).length === 0 ? (
          <AppText tone="secondary">아직 기록이 없어요.</AppText>
        ) : (
          (events.data ?? []).map((event) => (
            <View key={event.id} style={styles.event}>
              <AppText variant="small">
                {nameOf(event.actor_id)}님이 {eventVerb(event.event_type)}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {formatDateTime(event.recorded_at)}
              </AppText>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  titleText: { flex: 1, gap: 2 },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  done: { alignItems: 'center', gap: Spacing.xs },
  actions: { gap: Spacing.sm },
  event: { gap: 2 },
});
