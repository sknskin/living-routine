// 서버 상태 캐시 + 포그라운드 복귀/재연결 시 재조회 (D21)
// Server state cache + refetch on foreground return / reconnect (D21)
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { QUERY_STALE_MS } from '@/lib/config';

// 네이티브에서도 연결 복구 시 재조회되도록 TanStack 온라인 상태를 NetInfo 와 연결 (D21)
// Wire TanStack's online state to NetInfo so native also refetches on reconnect (D21)
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: QUERY_STALE_MS, retry: 1, refetchOnWindowFocus: true, refetchOnReconnect: true },
          // 쓰기 명령은 자동 재시도하지 않는다 (멱등 키로 사용자 재시도만 허용).
          // networkMode 'always': 오프라인이어도 보류·재전송하지 않고 즉시 실패시킨다 → 오프라인 쓰기 큐 금지(O01 보류) 준수
          // Do not auto-retry writes (only user retries with idempotency keys).
          // networkMode 'always': never pause/replay offline; fail immediately → no offline write queue (O01 on hold)
          mutations: { retry: 0, networkMode: 'always' },
        },
      }),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
