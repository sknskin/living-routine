// 공통 버튼 (최소 터치 영역·로딩·스크린리더 레이블)
// Shared button (min touch target, loading, screen reader label)
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { MIN_TOUCH, Radius, Spacing, useThemeColors } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

// 눌림 시 투명도
// Opacity while pressed
const PRESSED_OPACITY = 0.7;
const DISABLED_OPACITY = 0.45;

export function Button({ label, onPress, variant = 'primary', disabled, loading, compact, accessibilityHint, style }: Props) {
  const colors = useThemeColors();
  const palette = {
    primary: { bg: colors.accent, fg: 'onAccent' as const, border: colors.accent },
    secondary: { bg: colors.surface, fg: 'primary' as const, border: colors.border },
    ghost: { bg: 'transparent', fg: 'accent' as const, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: 'danger' as const, border: colors.dangerSoft },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && { opacity: PRESSED_OPACITY },
        inactive && { opacity: DISABLED_OPACITY },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accent} />
      ) : (
        <AppText variant={compact ? 'small' : 'body'} weight="medium" tone={palette.fg}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  compact: {
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
});
