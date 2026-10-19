// 인증 세션 상태 제공
// Provides auth session state
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearPendingInvite } from '@/lib/invite-link';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  userId: string | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, userId: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // 사용자가 바뀌면 새 세션을 그리기 전에(동기적으로) 이전 사용자 캐시를 비운다
    // When the user changes, clear the previous user's cache synchronously before rendering the new session
    const applySession = (next: Session | null) => {
      const nextUserId = next?.user.id ?? null;
      if (lastUserId.current !== nextUserId) {
        queryClient.clear();
        // 로그아웃 시 보관된 초대 코드도 지워 다른 계정에 넘어가지 않게 한다
        // On sign-out, also clear any stored invite code so it never carries over to another account
        if (lastUserId.current && !nextUserId) {
          clearPendingInvite().catch((error: unknown) => console.warn('[auth] clear pending invite failed', error));
        }
        lastUserId.current = nextUserId;
      }
      setSession(next);
    };
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[auth] getSession failed', error.message);
        }
        if (mounted) {
          applySession(data.session);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.warn('[auth] getSession threw', error);
        if (mounted) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({ session, userId: session?.user.id ?? null, loading }),
    [session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// 로그인된 사용자 ID (로그인 영역 화면 전용)
// Signed-in user id (for screens inside the signed-in area)
export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) {
    throw new Error('useUserId used outside the signed-in area');
  }
  return userId;
}
