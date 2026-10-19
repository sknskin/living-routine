// 상태 배지: 색과 함께 글자로 상태를 전달 (03 "색으로만 상태를 전달하지 않는다")
// Status badge: conveys state with text as well as color (03 "never color alone")
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, useThemeColors } from '@/constants/theme';

export type BadgeTone = 'accent' | 'warning' | 'danger' | 'neutral';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const colors = useThemeColors();
  const palette = {
    accent: { bg: colors.accentSoft, fg: 'accent' as const },
    warning: { bg: colors.warningSoft, fg: 'warning' as const },
    danger: { bg: colors.dangerSoft, fg: 'danger' as const },
    neutral: { bg: colors.surfaceMuted, fg: 'secondary' as const },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <AppText variant="caption" weight="bold" tone={palette.fg}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
});
