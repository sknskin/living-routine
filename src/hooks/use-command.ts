// 서버 명령 실행 훅: 실패 시 안내 후 최신 상태 재조회, 성공 시 공간 캐시 무효화
// Command hook: on failure show guidance and refetch; on success invalidate the space cache
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toAppError, type AppError } from '@/lib/errors';
import { showMessage } from '@/lib/feedback';
import { queryKeys, spaceScope } from '@/lib/query-keys';
import { useUserId } from '@/providers/auth-provider';
import { useSpaces } from '@/providers/space-provider';

type Options<TResult> = {
  onSuccess?: (result: TResult) => void;
  // true 면 오류를 직접 처리 (기본 알림 생략)
  // true to handle errors yourself (skip default alert)
  silentError?: boolean;
  onError?: (error: AppError) => void;
};

export function useCommand<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  options: Options<TResult> = {},
) {
  const queryClient = useQueryClient();
  const { current } = useSpaces();
  const userId = useUserId();

  const refresh = async () => {
    const tasks = [queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) })];
    if (current) {
      tasks.push(queryClient.invalidateQueries({ queryKey: spaceScope(current.id) }));
    }
    await Promise.all(tasks);
  };

  return useMutation({
    mutationFn: run,
    onSuccess: async (result) => {
      await refresh();
      options.onSuccess?.(result);
    },
    onError: async (error) => {
      const appError = toAppError(error);
      console.warn('[command] failed', appError.code, appError.detail);
      // 서버 미확정 상태를 성공처럼 두지 않도록 즉시 재조회
      // Refetch immediately so unconfirmed state is never shown as success
      await refresh();
      if (options.onError) {
        options.onError(appError);
      }
      if (!options.silentError) {
        showMessage('처리하지 못했어요', appError.message);
      }
    },
  });
}
