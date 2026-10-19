// 숫자 하나로 충분한 지표는 차트 대신 통계 타일 (히어로 숫자 + 라벨 + 아이콘)
// A single-number metric uses a stat tile instead of a chart (hero number + label + icon)
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, useCategoryColors, type CategoryTone } from '@/constants/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  tone: CategoryTone;
  value: number;
  label: string;
};

const ICON_SIZE = 18;
const ICON_BOX = 32;

export function StatTile({ icon, tone, value, label }: Props) {
  const palette = useCategoryColors()[tone];
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label} ${value}개`}>
      <View style={[styles.icon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={ICON_SIZE} color={palette.fg} />
      </View>
      <AppText variant="title" weight="bold">
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: Spacing.xs, alignItems: 'flex-start' },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
