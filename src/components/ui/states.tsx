// 빈 상태·오류 상태·로딩·안내 배너
// Empty, error, loading states and notice banner
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing, useThemeColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <AppText variant="title" style={styles.text}>
        {title}
      </AppText>
      {body ? (
        <AppText tone="secondary" style={styles.text}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <AppText variant="title" style={styles.text}>
        불러오지 못했어요
      </AppText>
      <AppText tone="secondary" style={styles.text}>
        {errorMessage(error)}
      </AppText>
      {onRetry ? <Button label="다시 시도" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function LoadingView() {
  const colors = useThemeColors();
  return (
    <View style={styles.center} accessibilityLabel="불러오는 중">
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function NoticeBanner({ message, tone = 'info' }: { message: string; tone?: 'info' | 'warning' | 'danger' }) {
  const colors = useThemeColors();
  const border = { info: colors.accentSoft, warning: colors.warning, danger: colors.danger }[tone];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors.surfaceMuted, borderLeftColor: border }]}>
      <AppText variant="small" tone={tone === 'info' ? 'primary' : tone}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  text: { textAlign: 'center' },
  banner: { borderLeftWidth: 4, borderRadius: Radius.sm, padding: Spacing.md },
});
