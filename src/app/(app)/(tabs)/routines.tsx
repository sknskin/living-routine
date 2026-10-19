// 루틴 탭: 루틴 목록·추천에서 추가·직접 만들기·보관함 (FR-04, U03)
// Routines tab: list, add from templates, create, archive (FR-04, U03)
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SpaceHeader } from '@/components/space-header';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CategoryIcon } from '@/components/category-icon';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState, LoadingView } from '@/components/ui/states';
import { MIN_TOUCH, Spacing, useThemeColors } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useMemberNames, useRoutines, useSpaceToday } from '@/hooks/use-space-data';
import { useCurrentSpace } from '@/providers/space-provider';
import { setRoutineArchived } from '@/lib/api/commands';
import { fetchOccurrences, fetchTemplates } from '@/lib/api/queries';
import { addDays } from '@/lib/dates';
import { occurrenceBadge } from '@/lib/occurrence-badge';
import { queryKeys } from '@/lib/query-keys';
import { ASSIGNMENT_LABEL, routineDescription } from '@/lib/routine-labels';
import type { RoutineWithRule } from '@/types/domain';

// 다음 예정일 조회 범위(일)
// Range in days for finding the next due date
const NEXT_LOOKBACK_DAYS = 60;
const NEXT_LOOKAHEAD_DAYS = 120;

export default function RoutinesScreen() {
  const colors = useThemeColors();
  const routines = useRoutines();
  const nameOf = useMemberNames();
  const [showTemplates, setShowTemplates] = useState(false);
  const templates = useQuery({ queryKey: queryKeys.templates(), queryFn: fetchTemplates, enabled: showTemplates });
  const restore = useCommand((routineId: string) => setRoutineArchived(routineId, false));
  const space = useCurrentSpace();
  const today = useSpaceToday();
  // 루틴별 다음 예정 회차 (지난 미완료 포함, 앞뒤 넉넉한 범위)
  // Next scheduled occurrence per routine (including overdue, generous range)
  const from = addDays(today, -NEXT_LOOKBACK_DAYS);
  const to = addDays(today, NEXT_LOOKAHEAD_DAYS);
  const upcoming = useQuery({
    queryKey: queryKeys.occurrences(space.id, from, to),
    queryFn: () => fetchOccurrences(space.id, from, to),
  });
  const nextByRoutine = new Map<string, NonNullable<typeof upcoming.data>[number]>();
  for (const occurrence of upcoming.data ?? []) {
    if (occurrence.status === 'scheduled' && !nextByRoutine.has(occurrence.routine_id)) {
      nextByRoutine.set(occurrence.routine_id, occurrence);
    }
  }

  if (routines.isPending) return <LoadingView />;
  if (routines.error) return <ErrorState error={routines.error} onRetry={() => routines.refetch()} />;

  const active = routines.data.filter((routine) => !routine.archived_at);
  const archived = routines.data.filter((routine) => routine.archived_at);

  const assigneeText = (routine: RoutineWithRule) =>
    routine.assignment_mode === 'free'
      ? ASSIGNMENT_LABEL.free
      : `${ASSIGNMENT_LABEL[routine.assignment_mode]} · ${routine.assignees.map((id) => nameOf(id)).join(' → ')}`;

  return (
    <Screen refreshing={routines.isRefetching} onRefresh={() => routines.refetch()}>
      <SpaceHeader title="루틴" />
      <Row>
        <Button compact label="직접 만들기" onPress={() => router.push({ pathname: '/routine/[id]', params: { id: 'new' } })} />
        <Button compact variant="secondary" label={showTemplates ? '추천 닫기' : '추천에서 추가'} onPress={() => setShowTemplates(!showTemplates)} />
      </Row>

      {showTemplates ? (
        <Card>
          <AppText variant="small" tone="secondary">
            골라서 편집한 뒤 저장해요.
          </AppText>
          <Row>
            {(templates.data ?? []).map((template) => (
              <Chip
                key={template.id}
                role="button"
                label={`+ ${template.title}`}
                selected={false}
                onPress={() => router.push({ pathname: '/routine/[id]', params: { id: 'new', template: template.id } })}
              />
            ))}
          </Row>
        </Card>
      ) : null}

      {active.length === 0 ? (
        <EmptyState title="루틴이 없어요" body="추천에서 고르거나 직접 만들어 보세요." />
      ) : (
        <View style={styles.section}>
          <SectionHeader title={`루틴 ${active.length}`} />
          <Card>
            {active.map((routine) => (
              <Pressable
                key={routine.id}
                accessibilityRole="button"
                accessibilityHint="루틴 편집"
                onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
                style={[styles.item, { borderBottomColor: colors.divider }]}>
                <CategoryIcon title={routine.title} />
                <View style={styles.itemText}>
                  <AppText weight="bold">{routine.title}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {routineDescription(routine.mode, routine.rule)}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {assigneeText(routine)}
                  </AppText>
                </View>
                {nextByRoutine.get(routine.id) ? (
                  <StatusBadge {...occurrenceBadge(nextByRoutine.get(routine.id)!, today)} />
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </Card>
        </View>
      )}

      {archived.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="보관함 (과거 기록은 보존돼요)" />
          <Card>
            {archived.map((routine) => (
              <View key={routine.id} style={[styles.item, { borderBottomColor: colors.divider }]}>
                <AppText style={styles.itemText} tone="secondary">
                  {routine.title}
                </AppText>
                <Button
                  compact
                  variant="ghost"
                  label="복원"
                  onPress={() => restore.mutate(routine.id)}
                  loading={restore.isPending && restore.variables === routine.id}
                />
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MIN_TOUCH + Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.xs,
  },
  itemText: { flex: 1, gap: 2 },
});
