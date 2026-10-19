// 현재 공간이 필요한 화면 보호: 로딩 중이면 대기, 공간이 없으면 온보딩으로 (딥링크·새로고침 대비)
// Guard for screens needing a current space: wait while loading, go to onboarding if none (deep links / reloads)
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { ErrorState, LoadingView } from '@/components/ui/states';
import { useSpaces } from '@/providers/space-provider';

export function SpaceGate({ children }: { children: ReactNode }) {
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
  return children;
}
