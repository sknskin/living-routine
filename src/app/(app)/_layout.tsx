// 로그인 영역 레이아웃: 공간 상태·실시간 구독 + 상세 화면 스택
// Signed-in layout: space state, realtime subscription and detail screen stack
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { useSpaceRealtime } from '@/hooks/use-space-realtime';
import { useUserId } from '@/providers/auth-provider';
import { SpaceProvider, useSpaces } from '@/providers/space-provider';

function RealtimeBridge({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const { current } = useSpaces();
  useSpaceRealtime(current?.id ?? null, userId);
  return children;
}

export default function AppLayout() {
  return (
    <SpaceProvider>
      <RealtimeBridge>
        <Stack screenOptions={{ headerBackTitle: '뒤로' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/templates" options={{ title: '추천 루틴' }} />
          <Stack.Screen name="join" options={{ title: '초대 코드로 참여' }} />
          <Stack.Screen name="routine/[id]" options={{ title: '루틴' }} />
          <Stack.Screen name="occurrence/[id]" options={{ title: '회차 상세' }} />
          <Stack.Screen name="space" options={{ title: '공간 관리' }} />
          <Stack.Screen name="settings" options={{ title: '설정' }} />
          <Stack.Screen name="notifications" options={{ title: '알림함' }} />
        </Stack>
      </RealtimeBridge>
    </SpaceProvider>
  );
}
