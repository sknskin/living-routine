// 오늘의 진행 링 (단일 값 + 히어로 숫자). 숫자를 함께 표시해 색에만 의존하지 않는다.
// Today's progress ring (single value + hero number). The number is shown so meaning never relies on color alone.
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { useThemeColors } from '@/constants/theme';

type Props = {
  done: number;
  total: number;
  size?: number;
};

const STROKE = 10;
// 12시 방향에서 시작
// Start at 12 o'clock
const START_ROTATION = -90;

export function ProgressRing({ done, total, size = 96 }: Props) {
  const colors = useThemeColors();
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`오늘 ${total}개 중 ${done}개 완료`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.accentSoft} strokeWidth={STROKE} fill="none" />
        {ratio > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accent}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            transform={`rotate(${START_ROTATION} ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <AppText variant="title" weight="bold">
          {done}/{total}
        </AppText>
        <AppText variant="caption" tone="secondary">
          완료
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
