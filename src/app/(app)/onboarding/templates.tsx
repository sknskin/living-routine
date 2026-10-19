// 온보딩 2단계: 추천 루틴 선택 (0개 선택 가능, 이후 자유 편집 — D02)
// Onboarding step 2: pick recommended routines (zero allowed; freely editable later — D02)
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen, SectionHeader } from '@/components/ui/layout';
import { ErrorState, LoadingView, NoticeBanner } from '@/components/ui/states';
import { MIN_TOUCH, Spacing, useThemeColors } from '@/constants/theme';
import { upsertRoutine } from '@/lib/api/commands';
import { fetchTemplates } from '@/lib/api/queries';
import { todayIn } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { toRule } from '@/lib/json';
import { queryKeys } from '@/lib/query-keys';
import { newRequestId } from '@/lib/request-id';
import { ruleSummary } from '@/lib/routine-labels';
import { useUserId } from '@/providers/auth-provider';
import { useSpaces } from '@/providers/space-provider';
import type { RoutineTemplate } from '@/types/domain';

export default function TemplatesScreen() {
  const colors = useThemeColors();
  const userId = useUserId();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const { spaces } = useSpaces();
  const space = spaces.find((item) => item.id === spaceId);
  const templates = useQuery({ queryKey: queryKeys.templates(), queryFn: fetchTemplates });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 템플릿별 생성 멱등 키: 재시도해도 같은 루틴이 중복 생성되지 않는다
  // Per-template creation key: retries never duplicate a routine
  const createKeys = useRef(new Map<string, string>());

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const finish = async () => {
    if (!space) {
      router.replace('/home');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const today = todayIn(space.timezone);
      const picked = (templates.data ?? []).filter((template) => selected.has(template.id));
      // 순차 생성: 실패 지점을 명확히 알리기 위함
      // Create sequentially so a failure point is clear
      for (const template of picked) {
        const rule = toRule(template.rule);
        const key = createKeys.current.get(template.id) ?? newRequestId();
        createKeys.current.set(template.id, key);
        await upsertRoutine({
          spaceId: space.id,
          routineId: null,
          title: template.title,
          mode: template.mode,
          rule: template.mode === 'manual' ? rule : { ...rule, start_date: today },
          assignmentMode: 'fixed',
          assignees: [userId],
          notifyEnabled: true,
          expectedVersion: null,
          applyToCurrent: false,
          requestId: key,
        });
      }
      router.replace('/home');
    } catch (thrown: unknown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  };

  if (templates.isPending) return <LoadingView />;
  if (templates.error) return <ErrorState error={templates.error} onRetry={() => templates.refetch()} />;

  const groups = new Map<string, RoutineTemplate[]>();
  for (const template of templates.data) {
    groups.set(template.category, [...(groups.get(template.category) ?? []), template]);
  }

  return (
    <Screen edges={[]}>
      <AppText tone="secondary">필요한 것만 골라요. 주기와 담당은 나중에 언제든 바꿀 수 있어요.</AppText>
      {[...groups.entries()].map(([category, items]) => (
        <View key={category} style={styles.group}>
          <SectionHeader title={category} />
          <Card>
            {items.map((template) => {
              const isOn = selected.has(template.id);
              return (
                <Pressable
                  key={template.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isOn }}
                  accessibilityLabel={template.title}
                  onPress={() => toggle(template.id)}
                  style={styles.item}>
                  <CategoryIcon title={template.title} />
                  <View style={styles.itemText}>
                    <AppText>{template.title}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {ruleSummary(template.mode, toRule(template.rule))}
                    </AppText>
                  </View>
                  <View style={[styles.box, { borderColor: colors.accent, backgroundColor: isOn ? colors.accent : 'transparent' }]}>
                    {isOn ? <AppText variant="caption" tone="onAccent">✓</AppText> : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </View>
      ))}
      {error ? <NoticeBanner tone="danger" message={error} /> : null}
      <Button
        label={selected.size > 0 ? `${selected.size}개 추가하고 시작하기` : '추천 없이 시작하기'}
        onPress={finish}
        loading={busy}
      />
    </Screen>
  );
}

// 체크박스 크기
// Checkbox size
const BOX_SIZE = 22;

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MIN_TOUCH },
  box: { width: BOX_SIZE, height: BOX_SIZE, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1 },
});
