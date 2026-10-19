// 회차 행: 원터치 완료 + 짧은 체크 모션·햅틱 (D06, D10). 서버 확정 전에는 완료로 표시하지 않는다.
// Occurrence row: one-touch completion with short check motion/haptic (D06, D10). Never shown done before server confirms.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category-icon';
import { MemberAvatar } from '@/components/illustrations/member-avatar';
import { AppText } from '@/components/ui/app-text';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { FEEDBACK_MOTION_MS, MIN_TOUCH, Spacing, useThemeColors } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useRequestKey } from '@/hooks/use-request-key';
import { completeOccurrence } from '@/lib/api/commands';
import { completionHaptic } from '@/lib/feedback';
import type { Occurrence } from '@/types/domain';

type Props = {
  occurrence: Occurrence;
  title: string;
  // 담당자 아바타 표시용 (없으면 "누구나")
  // For the assignee avatar (null means "anyone")
  avatarUserId: string | null;
  subtitle: string;
  badge: { label: string; tone: BadgeTone };
  onOpen: () => void;
};

// 체크 모션 최대 배율
// Peak scale of the check motion
const PEAK_SCALE = 1.25;
const CHECK_SIZE = 30;
const AVATAR_SIZE = 18;
// 웹에는 네이티브 애니메이션 모듈이 없다
// Web has no native animated module
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function RoutineRow({ occurrence, title, avatarUserId, subtitle, badge, onOpen }: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  // 일시 오류 후 재시도만 같은 request_id 를 쓴다
  // Only retries after a temporary failure reuse the same request_id
  const requestKey = useRequestKey();
  const done = occurrence.status === 'completed';

  const playCheck = () => {
    completionHaptic();
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: PEAK_SCALE, duration: FEEDBACK_MOTION_MS / 2, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scale, { toValue: 1, duration: FEEDBACK_MOTION_MS / 2, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  };

  const complete = useCommand((id: string) => completeOccurrence(id, requestKey.get()), {
    onSuccess: () => {
      playCheck();
      requestKey.settle();
    },
    onError: requestKey.settle,
  });

  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${badge.label}, ${subtitle}`}
        accessibilityHint="회차 상세 보기"
        onPress={onOpen}
        style={styles.body}>
        <CategoryIcon title={title} />
        <View style={styles.text}>
          <AppText weight="bold" numberOfLines={1} style={done ? styles.doneText : undefined}>
            {title}
          </AppText>
          <View style={styles.meta}>
            {avatarUserId ? <MemberAvatar seed={avatarUserId} size={AVATAR_SIZE} /> : null}
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
              {complete.isPending ? ' · 확인 중…' : ''}
            </AppText>
          </View>
        </View>
        <StatusBadge label={badge.label} tone={badge.tone} />
      </Pressable>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${title} 완료`}
        accessibilityState={{ checked: done, busy: complete.isPending, disabled: done }}
        disabled={done || complete.isPending}
        onPress={() => complete.mutate(occurrence.id)}
        hitSlop={Spacing.sm}
        style={styles.checkHit}>
        {complete.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={CHECK_SIZE}
              color={done ? colors.accent : colors.textSecondary}
            />
          </Animated.View>
        )}
      </Pressable>
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
  checkHit: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  subtitle: { flexShrink: 1 },
  doneText: { textDecorationLine: 'line-through', opacity: 0.6 },
});
