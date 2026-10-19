// 라벨이 있는 입력 필드
// Labeled text input
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { FontSize, MIN_TOUCH, Radius, Spacing, useThemeColors } from '@/constants/theme';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, style, ...rest }: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.wrap}>
      <AppText variant="small" tone="secondary">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.divider },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.body,
  },
});
