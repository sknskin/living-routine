// 캘린더: 예정일과 실제 완료일을 구분해 날짜별 회차 표시, 타임라인으로 연결 (FR-08, D08)
// Calendar: per-day occurrences distinguishing due vs actual completion dates; links to timeline (FR-08, D08)
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { SpaceHeader } from '@/components/space-header';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { ErrorState } from '@/components/ui/states';
import { MIN_TOUCH, Radius, Spacing, useThemeColors } from '@/constants/theme';
import { useMemberNames, useRoutineMap, useSpaceToday } from '@/hooks/use-space-data';
import { fetchOccurrences, fetchResolvedInRange } from '@/lib/api/queries';
import { formatDate, monthGrid, weekdayLabel } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';
import { useCurrentSpace } from '@/providers/space-provider';
import type { Occurrence } from '@/types/domain';

const WEEK = [0, 1, 2, 3, 4, 5, 6];
const DOT_SIZE = 6;
const MONTHS_PER_YEAR = 12;

type DayMarks = { due: number; done: number };

export default function CalendarScreen() {
  const colors = useThemeColors();
  const space = useCurrentSpace();
  const today = useSpaceToday();
  const routines = useRoutineMap();
  const nameOf = useMemberNames();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const from = cells.find((cell) => cell !== null) ?? today;
  const to = [...cells].reverse().find((cell) => cell !== null) ?? today;

  const due = useQuery({
    queryKey: queryKeys.occurrences(space.id, from, to),
    queryFn: () => fetchOccurrences(space.id, from, to),
  });
  const resolved = useQuery({
    queryKey: queryKeys.resolved(space.id, from, to),
    queryFn: () => fetchResolvedInRange(space.id, from, to),
  });

  const visible = (occurrence: Occurrence) => {
    const routine = routines.get(occurrence.routine_id);
    return !!routine && !routine.archived_at;
  };

  // 날짜별 표시: 예정(미완료) / 실제 완료
  // Per-day marks: due (open) / actually completed
  const marks = useMemo(() => {
    const map = new Map<string, DayMarks>();
    const bump = (date: string, key: keyof DayMarks) => {
      const current = map.get(date) ?? { due: 0, done: 0 };
      current[key] += 1;
      map.set(date, current);
    };
    for (const item of due.data ?? []) {
      if (visible(item) && item.status === 'scheduled') bump(item.due_local_date, 'due');
    }
    for (const item of resolved.data ?? []) {
      if (visible(item) && item.status === 'completed' && item.resolved_local_date) bump(item.resolved_local_date, 'done');
    }
    return map;
    // routines 변경 시에도 다시 계산
    // Recompute when routines change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due.data, resolved.data, routines]);

  const dayDue = (due.data ?? []).filter((item) => visible(item) && item.due_local_date === selected && item.status !== 'void');
  const dayDone = (resolved.data ?? []).filter(
    (item) => visible(item) && item.resolved_local_date === selected && item.due_local_date !== selected,
  );

  const goToday = () => {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)));
    setSelected(today);
  };
  const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7));

  const shiftMonth = (delta: number) => {
    const index = year * MONTHS_PER_YEAR + (month - 1) + delta;
    setYear(Math.floor(index / MONTHS_PER_YEAR));
    setMonth((index % MONTHS_PER_YEAR) + 1);
  };

  const statusText = (item: Occurrence) => {
    if (item.status === 'completed') {
      const sameDay = item.resolved_local_date === item.due_local_date;
      return `${nameOf(item.performer_id)} 완료${sameDay || !item.resolved_local_date ? '' : ` (실제 ${formatDate(item.resolved_local_date)})`}`;
    }
    if (item.status === 'skipped') return '건너뜀';
    return `예정 · ${nameOf(item.assigned_user_id)}`;
  };

  if (due.error) return <ErrorState error={due.error} onRetry={() => due.refetch()} />;

  return (
    <Screen refreshing={due.isRefetching} onRefresh={() => Promise.all([due.refetch(), resolved.refetch()])}>
      <SpaceHeader title="캘린더" />
      <Card>
        <Row style={styles.monthBar}>
          <Button compact variant="ghost" label="‹ 이전" onPress={() => shiftMonth(-1)} />
          <View style={styles.monthTitle}>
            <AppText variant="title" accessibilityRole="header">
              {year}년 {month}월
            </AppText>
            {!isCurrentMonth || selected !== today ? (
              <Button compact variant="secondary" label="오늘" onPress={goToday} />
            ) : null}
          </View>
          <Button compact variant="ghost" label="다음 ›" onPress={() => shiftMonth(1)} />
        </Row>
        <View style={styles.grid}>
          {WEEK.map((weekday) => (
            <View key={`h${weekday}`} style={styles.cell}>
              <AppText variant="caption" tone="secondary">
                {weekdayLabel(weekday)}
              </AppText>
            </View>
          ))}
          {cells.map((date, index) => {
            if (!date) return <View key={`b${index}`} style={styles.cell} />;
            const mark = marks.get(date);
            const isSelected = date === selected;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatDate(date)}, 예정 ${mark?.due ?? 0}개, 완료 ${mark?.done ?? 0}개`}
                onPress={() => setSelected(date)}
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: colors.accent, borderRadius: Radius.sm },
                ]}>
                <AppText
                  variant="small"
                  weight={isToday ? 'bold' : 'regular'}
                  tone={isSelected ? 'onAccent' : isToday ? 'accent' : 'primary'}>
                  {Number(date.slice(8))}
                </AppText>
                <View style={styles.dots}>
                  {mark?.due ? <View style={[styles.dot, { borderColor: isSelected ? colors.onAccent : colors.accent, borderWidth: 1 }]} /> : null}
                  {mark?.done ? <View style={[styles.dot, { backgroundColor: isSelected ? colors.onAccent : colors.accent }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" tone="secondary">
          ○ 예정 · ● 실제 완료
        </AppText>
      </Card>

      <SectionHeader
        title={formatDate(selected)}
        action={<Button compact variant="ghost" label="기록 보기" onPress={() => router.push('/history')} />}
      />
      <Card>
        {dayDue.length === 0 && dayDone.length === 0 ? (
          <AppText tone="secondary">이 날은 일정이나 기록이 없어요.</AppText>
        ) : null}
        {dayDue.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/occurrence/[id]', params: { id: item.id } })}
            style={styles.item}>
            <CategoryIcon title={routines.get(item.routine_id)?.title ?? ''} size={32} />
            <View style={styles.itemText}>
              <AppText weight="medium">{routines.get(item.routine_id)?.title}</AppText>
              <AppText variant="caption" tone="secondary">
                {statusText(item)}
              </AppText>
            </View>
          </Pressable>
        ))}
        {dayDone.map((item) => (
          <Pressable
            key={`done-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/occurrence/[id]', params: { id: item.id } })}
            style={styles.item}>
            <CategoryIcon title={routines.get(item.routine_id)?.title ?? ''} size={32} />
            <View style={styles.itemText}>
              <AppText weight="medium">{routines.get(item.routine_id)?.title}</AppText>
              <AppText variant="caption" tone="secondary">
                {nameOf(item.performer_id)} 완료 · 원래 예정 {formatDate(item.due_local_date)}
              </AppText>
            </View>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

// 7열 그리드 칸 폭 비율
// Cell width ratio for a 7-column grid
const CELL_WIDTH = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  monthBar: { justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_WIDTH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dots: { flexDirection: 'row', gap: 2, height: DOT_SIZE },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  item: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  itemText: { flex: 1 },
  monthTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
