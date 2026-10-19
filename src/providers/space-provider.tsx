// 현재 공간 선택·전환. 전환 시 이전 공간 캐시를 제거한다 (07 Realtime).
// Current space selection/switching. Clears the previous space cache on switch (07 Realtime).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { fetchMySpaces } from '@/lib/api/queries';
import { SELECTED_SPACE_STORAGE_KEY } from '@/lib/config';
import { queryKeys, spaceScope } from '@/lib/query-keys';
import { useUserId } from '@/providers/auth-provider';
import type { MySpace } from '@/types/domain';

type SpaceState = {
  spaces: MySpace[];
  current: MySpace | null;
  loading: boolean;
  error: unknown;
  selectSpace: (spaceId: string) => void;
  refreshSpaces: () => Promise<void>;
};

const SpaceContext = createContext<SpaceState | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const spacesQuery = useQuery({ queryKey: queryKeys.mySpaces(userId), queryFn: () => fetchMySpaces(userId) });

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_SPACE_STORAGE_KEY)
      .then((value) => setSelectedId(value))
      .catch((error: unknown) => console.warn('[space] restore failed', error))
      .finally(() => setRestored(true));
  }, []);

  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);
  const current = useMemo(
    () => spaces.find((space) => space.id === selectedId) ?? spaces[0] ?? null,
    [spaces, selectedId],
  );

  // 현재 공간이 바뀌면(직접 전환·탈퇴 후 대체 선택 모두) 이전 공간 캐시를 제거
  // When the current space changes (explicit switch or fallback after leaving), drop the previous space cache
  const currentId = current?.id ?? null;
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    if (previousId.current && previousId.current !== currentId) {
      queryClient.removeQueries({ queryKey: spaceScope(previousId.current) });
    }
    previousId.current = currentId;
  }, [currentId, queryClient]);

  const selectSpace = useCallback(
    (spaceId: string) => {
      setSelectedId(spaceId);
      AsyncStorage.setItem(SELECTED_SPACE_STORAGE_KEY, spaceId).catch((error: unknown) =>
        console.warn('[space] persist failed', error),
      );
    },
    [],
  );

  const refreshSpaces = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.mySpaces(userId) });
  }, [queryClient, userId]);

  const value = useMemo(
    () => ({
      spaces,
      current,
      loading: spacesQuery.isPending || !restored,
      error: spacesQuery.error,
      selectSpace,
      refreshSpaces,
    }),
    [spaces, current, spacesQuery.isPending, spacesQuery.error, restored, selectSpace, refreshSpaces],
  );
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpaces(): SpaceState {
  const value = useContext(SpaceContext);
  if (!value) {
    throw new Error('useSpaces must be used within SpaceProvider');
  }
  return value;
}

// 현재 공간 (공간이 있는 화면 전용)
// Current space (for screens that require one)
export function useCurrentSpace(): MySpace {
  const { current } = useSpaces();
  if (!current) {
    throw new Error('useCurrentSpace used without a selected space');
  }
  return current;
}
