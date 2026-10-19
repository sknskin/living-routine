// 화면 틀·카드·섹션 제목
// Screen frame, card and section header
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { cardShadow, MAX_CONTENT_WIDTH, Radius, Spacing, useThemeColors } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
};

export function Screen({ children, scroll = true, refreshing = false, onRefresh, edges = ['top'] }: ScreenProps) {
  const colors = useThemeColors();
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider }, cardShadow(colors), style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="body" weight="bold" accessibilityRole="header">
        {title}
      </AppText>
      {action}
    </View>
  );
}

// role="radiogroup" 이면 스크린리더가 "N개 중 몇 번째"를 안내 (단일 선택 칩 묶음)
// role="radiogroup" lets screen readers announce "x of N" (single-choice chip groups)
export function Row({ children, style, role, label }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  role?: 'radiogroup';
  label?: string;
}) {
  return (
    <View style={[styles.row, style]} accessibilityRole={role} accessibilityLabel={label}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxl },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
});
