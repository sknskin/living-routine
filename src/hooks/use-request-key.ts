// 명령별 멱등 키 관리: 일시 오류 재시도는 같은 키(서버 재생 응답), 그 외 결과 후에는 새 키
// Per-command idempotency key: keep the key for retries after temporary failures (server replays), renew otherwise
import { useCallback, useRef } from 'react';

import type { AppError } from '@/lib/errors';
import { newRequestId } from '@/lib/request-id';

export type RequestKey = {
  get: () => string;
  // 성공(오류 없음) 또는 확정 오류 후 호출
  // Call after success (no error) or a definitive error
  settle: (error?: AppError) => void;
};

export function useRequestKey(): RequestKey {
  const key = useRef<string | null>(null);

  const get = useCallback(() => {
    if (!key.current) {
      key.current = newRequestId();
    }
    return key.current;
  }, []);

  const settle = useCallback((error?: AppError) => {
    if (error?.code === 'TEMPORARY_FAILURE') {
      return;
    }
    key.current = null;
  }, []);

  return { get, settle };
}
