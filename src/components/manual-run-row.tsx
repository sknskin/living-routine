// 수동 루틴 실행 행: 다음 차례 표시 + 실행 기록 (D19)
// Manual routine row: shows whose turn is next and records a run (D19)
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MIN_TOUCH, Spacing, useThemeColors } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { runManualRoutine } from '@/lib/api/commands';
import { fetchNextManualAssignee } from '@/lib/api/queries';
import { completionHaptic } from '@/lib/feedback';
import { queryKeys } from '@/lib/query-keys';
import type { RoutineWithRule } from '@/types/domain';

type Props = {
  routine: RoutineWithRule;
  nameOf: (userId: string | null | undefined) => string;
};

export function ManualRunRow({ routine, nameOf }: Props) {
  const colors = useThemeColors();
  const requestKey = useRequestKey();
  const next = useQuery({
    queryKey: queryKeys.nextManual(routine.space_id, routine.id),
    queryFn: () => fetchNextManualAssignee(routine.id),
  });
  const run = useCommand(() => runManualRoutine(routine.id, requestKey.get()), {
    onSuccess: () => {
      completionHaptic();
      // 성공 후 다음 실행은 독립 회차이므로 새 키
      // After success, the next run is an independent occurrence: new key
      requestKey.settle();
    },
    onError: requestKey.settle,
  });

  const turn = routine.assignment_mode === 'free' ? '누구나' : `${nameOf(next.data)} 차례`;

  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={styles.body}>
        <AppText weight="medium">{routine.title}</AppText>
        <AppText variant="caption" tone="secondary">
          필요할 때 · {next.isPending ? '…' : turn}
        </AppText>
      </View>
      <Button compact variant="secondary" label="했어요" onPress={() => run.mutate(undefined)} loading={run.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MIN_TOUCH + Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
});
