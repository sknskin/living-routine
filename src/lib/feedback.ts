// 플랫폼별 확인창·알림창·햅틱 (웹은 Alert 가 동작하지 않아 window API 사용)
// Platform-aware confirm/alert/haptics (Alert is a no-op on web, so use window APIs)
import * as Haptics from 'expo-haptics';
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, confirmLabel = '확인'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function showMessage(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

// 완료 시 가벼운 햅틱 (지원 기기에서만)
// Light haptic on completion (supported devices only)
export function completionHaptic(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error: unknown) =>
    console.warn('[haptics] failed', error),
  );
}
