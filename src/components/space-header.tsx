// 상단 공간 선택 메뉴 + 알림함·설정 진입 (02 네비게이션)
// Top space switcher with inbox/settings entry (02 navigation)
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/layout';
import { NoticeBanner } from '@/components/ui/states';
import { MIN_TOUCH, Spacing, useThemeColors } from '@/constants/theme';
import { useOnline } from '@/hooks/use-online';
import { useNotifications } from '@/hooks/use-space-data';
import { useSpaces } from '@/providers/space-provider';

// 아이콘 크기
// Icon size
const ICON_SIZE = 22;

export function SpaceHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  const { spaces, current, selectSpace } = useSpaces();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const online = useOnline();
  const unread = (notifications.data ?? []).filter((item) => !item.read_at).length;

  const go = (href: '/onboarding?new=1' | '/join' | '/space') => {
    setOpen(false);
    router.push(href);
  };

  return (
    <View style={styles.wrap}>
      {!online ? (
        <NoticeBanner
          tone="warning"
          message="인터넷 연결이 끊겼어요. 지금은 완료·변경을 저장할 수 없어요. 연결된 뒤 다시 시도해 주세요."
        />
      ) : null}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`공간 전환, 현재 ${current?.name ?? ''}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.switcher}>
          <AppText variant="small" tone="secondary">
            {title}
          </AppText>
          <View style={styles.spaceName}>
            <AppText variant="title" numberOfLines={1}>
              {current?.name ?? '공간 없음'}
            </AppText>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `알림함, 읽지 않은 알림 ${unread}개` : '알림함'}
          onPress={() => router.push('/notifications')}
          style={styles.icon}>
          <Ionicons name="notifications-outline" size={ICON_SIZE} color={colors.textPrimary} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <AppText variant="caption" tone="onAccent">
                {unread}
              </AppText>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정"
          onPress={() => router.push('/settings')}
          style={styles.icon}>
          <Ionicons name="settings-outline" size={ICON_SIZE} color={colors.textPrimary} />
        </Pressable>
      </View>
      {open ? (
        <Card>
          {spaces.map((space) => (
            <Pressable
              key={space.id}
              accessibilityRole="button"
              accessibilityState={{ selected: space.id === current?.id }}
              onPress={() => {
                selectSpace(space.id);
                setOpen(false);
              }}
              style={styles.menuItem}>
              <AppText weight={space.id === current?.id ? 'bold' : 'regular'}>{space.name}</AppText>
              <AppText variant="caption" tone="secondary">
                {space.role === 'admin' ? '관리자' : '구성원'}
              </AppText>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => go('/space')} style={styles.menuItem}>
            <AppText tone="accent">공간 관리·초대</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => go('/onboarding?new=1')} style={styles.menuItem}>
            <AppText tone="accent">새 공간 만들기</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => go('/join')} style={styles.menuItem}>
            <AppText tone="accent">초대 코드로 참여</AppText>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  switcher: { flex: 1, minHeight: MIN_TOUCH },
  spaceName: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    borderRadius: 9,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  menuItem: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
