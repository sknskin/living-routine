// 최근 7일 함께 완료한 수 막대 차트 (단일 계열 → 범례 없음, 제목이 계열 이름).
// 막대를 누르면 그날 값을 표시(선택적 직접 라벨). 접근성 라벨에 전체 값 목록을 넣어 표 대체를 제공.
// 7-day "done together" bar chart (single series → no legend; the title names it).
// Tapping a bar shows that day's value (selective direct label). The a11y label lists all values as a table equivalent.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Spacing, useThemeColors } from '@/constants/theme';
import { formatDate, weekdayLabel, weekdayOf } from '@/lib/dates';

export type DayCount = { date: string; count: number };

type Props = {
  days: DayCount[];
  today: string;
  height?: number;
};

// 막대 끝 둥글기·막대 사이 간격·최소 높이(0 과 구분)
// Bar end radius, gap between bars, minimum height (distinguish from zero)
const BAR_RADIUS = 4;
const BAR_GAP_RATIO = 0.45;
const MIN_VISIBLE = 3;
const VIEW_WIDTH = 280;

// 아래쪽이 기준선에 붙고 위쪽만 둥근 막대 경로
// Bar path anchored to the baseline with only the top corners rounded
function barPath(x: number, width: number, top: number, bottom: number): string {
  const r = Math.min(BAR_RADIUS, width / 2, bottom - top);
  return `M${x} ${bottom} L${x} ${top + r} Q${x} ${top} ${x + r} ${top} L${x + width - r} ${top} Q${x + width} ${top} ${x + width} ${top + r} L${x + width} ${bottom} Z`;
}

export function WeekBars({ days, today, height = 120 }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState(today);
  const max = Math.max(1, ...days.map((day) => day.count));
  const slot = VIEW_WIDTH / days.length;
  const barWidth = slot * (1 - BAR_GAP_RATIO);
  const selectedDay = days.find((day) => day.date === selected) ?? days[days.length - 1];
  const summary = days.map((day) => `${formatDate(day.date)} ${day.count}개`).join(', ');

  return (
    <View style={styles.wrap}>
      <AppText variant="small" tone="secondary">
        {selectedDay ? `${selectedDay.date === today ? '오늘' : formatDate(selectedDay.date)} · ${selectedDay.count}개 완료` : ''}
      </AppText>
      <View>
        {/* 그래프 자체는 요약 라벨을 가진 이미지, 날짜별 버튼은 따로 접근 가능 */}
        {/* The plot itself is an image with a summary label; per-day buttons stay reachable */}
        <View accessible accessibilityRole="image" accessibilityLabel={`최근 7일 완료: ${summary}`}>
          <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`} preserveAspectRatio="none">
            {/* 기준선 */}
            {/* Baseline */}
            <Line x1="0" y1={height - 1} x2={VIEW_WIDTH} y2={height - 1} stroke={colors.border} strokeWidth="1" />
            {days.map((day, index) => {
              const x = index * slot + (slot - barWidth) / 2;
              const barHeight = day.count === 0 ? 0 : Math.max(MIN_VISIBLE, (day.count / max) * (height - 8));
              const isSelected = day.date === selectedDay?.date;
              return barHeight > 0 ? (
                <Path
                  key={day.date}
                  d={barPath(x, barWidth, height - 1 - barHeight, height - 1)}
                  fill={isSelected ? colors.accent : colors.accentSoft}
                  stroke={colors.accent}
                  strokeWidth={isSelected ? 0 : 1}
                />
              ) : null;
            })}
          </Svg>
        </View>
        {/* 막대보다 넓은 터치 영역 */}
        {/* Hit targets wider than the bars */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {days.map((day) => (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(day.date)} ${day.count}개`}
                onPress={() => setSelected(day.date)}
                style={styles.hit}
              />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.labels}>
        {days.map((day) => (
          <AppText
            key={day.date}
            variant="caption"
            tone={day.date === selectedDay?.date ? 'primary' : 'secondary'}
            weight={day.date === today ? 'bold' : 'regular'}
            style={styles.label}>
            {day.date === today ? '오늘' : weekdayLabel(weekdayOf(day.date))}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  hitRow: { flex: 1, flexDirection: 'row' },
  hit: { flex: 1 },
  labels: { flexDirection: 'row' },
  label: { flex: 1, textAlign: 'center' },
});
