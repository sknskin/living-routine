// 공간 실시간 구독: 변경 이벤트는 데이터 확정이 아니라 재조회 신호로만 쓴다 (07, D12)
// Space realtime subscription: change events are only refetch signals, never data truth (07, D12)
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys, spaceScope } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';

// help_requests 는 메시지 보호를 위해 발행하지 않는다 (변경은 routine_events 로 감지)
// help_requests is not published to protect messages (changes are detected via routine_events)
const SPACE_TABLES = ['routines', 'routine_occurrences', 'routine_events', 'reactions', 'space_members'] as const;

export function useSpaceRealtime(spaceId: string | null, userId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!spaceId) {
      return undefined;
    }
    const invalidateSpace = () => {
      queryClient.invalidateQueries({ queryKey: spaceScope(spaceId) }).catch((error: unknown) =>
        console.warn('[realtime] invalidate failed', error),
      );
    };

    let channel = supabase.channel(`space:${spaceId}`);
    for (const table of SPACE_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `space_id=eq.${spaceId}` },
        invalidateSpace,
      );
    }
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notification_outbox', filter: `recipient_id=eq.${userId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) }).catch((error: unknown) =>
          console.warn('[realtime] invalidate failed', error),
        );
      },
    );

    channel.subscribe((status) => {
      // 재연결되면 놓친 이벤트를 보완하기 위해 서버 재조회
      // On (re)subscribe, refetch to cover any missed events
      if (status === 'SUBSCRIBED') {
        invalidateSpace();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] channel status', status);
      }
    });

    return () => {
      // 이전 공간 채널 정리
      // Clean up the previous space channel
      supabase.removeChannel(channel).catch((error: unknown) => console.warn('[realtime] remove failed', error));
    };
  }, [spaceId, userId, queryClient]);
}
