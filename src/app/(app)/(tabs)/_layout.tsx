// 하단 4탭: 홈·캘린더·루틴·기록 (D08). 공간이 없으면 온보딩으로 이동.
// Bottom 4 tabs: home, calendar, routines, history (D08). Redirect to onboarding when there is no space.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { ErrorState, LoadingView } from '@/components/ui/states';
import { FontSize, useThemeColors } from '@/constants/theme';
import { useSpaces } from '@/providers/space-provider';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; idle: IconName }> = {
  home: { active: 'home', idle: 'home-outline' },
  calendar: { active: 'calendar', idle: 'calendar-outline' },
  routines: { active: 'repeat', idle: 'repeat-outline' },
  history: { active: 'time', idle: 'time-outline' },
};

export default function TabsLayout() {
  const colors = useThemeColors();
  const { current, loading, error, refreshSpaces } = useSpaces();

  if (loading) {
    return <LoadingView />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={refreshSpaces} />;
  }
  if (!current) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        // 높이는 지정하지 않아 기기별 안전 영역(홈 인디케이터)을 그대로 따른다
        // Height is not fixed so the per-device safe area (home indicator) is respected
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: FontSize.caption, fontWeight: '600' },
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name];
          const tint = focused ? colors.accent : colors.textSecondary;
          return icons ? <Ionicons name={focused ? icons.active : icons.idle} size={size} color={tint} /> : null;
        },
      })}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
      <Tabs.Screen name="routines" options={{ title: '루틴' }} />
      <Tabs.Screen name="history" options={{ title: '기록' }} />
    </Tabs>
  );
}
