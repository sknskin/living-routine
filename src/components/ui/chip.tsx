// 선택형 칩 / 토글 행
// Selectable chip / toggle row
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { MIN_TOUCH, Radius, Spacing, useThemeColors } from '@/constants/theme';

// role: 단일 선택은 radio, 다중 선택은 checkbox, 동작 버튼은 button (스크린리더에 선택 상태 노출)
// role: radio for single choice, checkbox for multi choice, button for actions (exposes selection to screen readers)
export function Chip({ label, selected, onPress, disabled, role = 'radio' }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  role?: 'radio' | 'checkbox' | 'button';
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'button' ? { disabled: !!disabled } : { checked: selected, disabled: !!disabled }}
      // 웹 접근성 트리에도 선택 상태가 노출되도록 aria 속성을 함께 지정
      // Also set aria props so the selection state reaches the web accessibility tree
      aria-checked={role === 'button' ? undefined : selected}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.selected : colors.surface,
          borderColor: selected ? colors.selected : colors.border,
        },
      ]}>
      <AppText variant="small" weight="medium" tone={selected ? 'onSelected' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ToggleRow({ label, description, value, onChange, disabled }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <AppText>{label}</AppText>
        {description ? (
          <AppText variant="caption" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.divider }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH - Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MIN_TOUCH },
  toggleText: { flex: 1, gap: Spacing.xs },
});
