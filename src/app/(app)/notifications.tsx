// 앱 내 알림함: 푸시를 거부해도 여기서 확인 (U01, 02 빈 상태). 열면 모두 읽음 처리.
// In-app inbox: visible even when push is denied (U01). Opening marks all as read.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card, Screen } from '@/components/ui/layout';
import { EmptyState, ErrorState, LoadingView } from '@/components/ui/states';
import { MIN_TOUCH, Radius, Spacing, useThemeColors } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-space-data';
import { markNotificationsRead } from '@/lib/api/commands';
import { formatDateTime } from '@/lib/dates';
import { showMessage } from '@/lib/feedback';
import { asRecord, getString } from '@/lib/json';
import { queryKeys } from '@/lib/query-keys';
import { useUserId } from '@/providers/auth-provider';
import { useSpaces } from '@/providers/space-provider';
import type { NotificationItem } from '@/types/domain';

// 수신자 전용 알림 데이터의 짧은 메시지 (정정 요청)
// Short message in recipient-only notification data (correction requests)
function messageOf(item: NotificationItem): string | null {
  return getString(asRecord(item.data), 'message');
}

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const userId = useUserId();
  const notifications = useNotifications();
  const { spaces, current, selectSpace } = useSpaces();
  const hasUnread = (notifications.data ?? []).some((item) => !item.read_at);

  useEffect(() => {
    if (!hasUnread) return;
    markNotificationsRead(null)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) }))
      .catch((error: unknown) => console.warn('[inbox] mark read failed', error));
  }, [hasUnread, queryClient, userId]);

  if (notifications.isPending) return <LoadingView />;
  if (notifications.error) return <ErrorState error={notifications.error} onRetry={() => notifications.refetch()} />;
  if (notifications.data.length === 0) {
    return <EmptyState title="알림이 없어요" body="중요한 요청과 오늘 할 일 알림이 여기에 모여요." />;
  }

  const open = (item: NotificationItem) => {
    // 탈퇴한 공간 등 접근할 수 없는 공간의 알림은 이동하지 않는다
    // Do not navigate for spaces the user can no longer access
    if (!item.space_id || !spaces.some((space) => space.id === item.space_id)) {
      // 07 "잘못된 공간 알림 딥링크 시 접근 거절"
      // 07 "deny access for notifications of an inaccessible space"
      showMessage('열 수 없는 알림이에요', '더 이상 참여하지 않는 공간의 알림이라 내용을 볼 수 없어요.');
      return;
    }
    if (current?.id !== item.space_id) selectSpace(item.space_id);
    const data = item.data;
    const occurrenceId =
      data && typeof data === 'object' && !Array.isArray(data) && typeof data.occurrence_id === 'string'
        ? data.occurrence_id
        : null;
    if (occurrenceId) router.push({ pathname: '/occurrence/[id]', params: { id: occurrenceId } });
    else router.push('/home');
  };

  return (
    <Screen edges={[]} refreshing={notifications.isRefetching} onRefresh={() => notifications.refetch()}>
      <Card>
        {notifications.data.map((item) => {
          // 더 이상 참여하지 않는 공간의 알림은 내용(이름·메시지)을 숨긴다
          // Hide content (names/messages) of notifications from spaces the user no longer belongs to
          const accessible = !!item.space_id && spaces.some((space) => space.id === item.space_id);
          return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => open(item)}
            style={[styles.item, { borderBottomColor: colors.divider }]}>
            <AppText weight={item.read_at ? 'regular' : 'bold'}>
              {item.important ? '● ' : ''}
              {accessible ? item.title : '참여하지 않는 공간의 알림'}
            </AppText>
            <AppText variant="small" tone="secondary">
              {accessible ? item.body : '이 공간을 나가서 내용을 볼 수 없어요.'}
            </AppText>
            {accessible && messageOf(item) ? (
              <AppText variant="small" style={[styles.message, { backgroundColor: colors.surfaceMuted }]}>
                “{messageOf(item)}”
              </AppText>
            ) : null}
            <AppText variant="caption" tone="secondary">
              {formatDateTime(item.scheduled_at)}
            </AppText>
          </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { minHeight: MIN_TOUCH, gap: 2, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  message: { borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, alignSelf: 'flex-start' },
});
