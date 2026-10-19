// 인증 메일 링크 복귀 화면: PKCE 코드를 세션으로 교환한 뒤 다음 화면으로 이동 (로그인 없이 열림)
// Auth email link return screen: exchanges the PKCE code for a session, then moves on (works signed out)
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/layout';
import { EmptyState, LoadingView } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';

type Result = { kind: 'pending' } | { kind: 'done'; next: '/reset-password' | '/' } | { kind: 'error'; message: string };

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; next?: string; error_description?: string }>();
  // 링크 형식 오류는 첫 렌더에서 바로 판정, 코드가 있으면 교환 대기
  // Malformed links are decided on first render; with a code we wait for the exchange
  const [result, setResult] = useState<Result>(() => {
    if (params.error_description) {
      // 공급자가 오류를 붙여 돌려보낸 경우 (만료된 링크 등)
      // The provider returned an error (e.g. expired link)
      return { kind: 'error', message: '링크가 만료되었거나 이미 사용되었어요. 다시 요청해 주세요.' };
    }
    return params.code ? { kind: 'pending' } : { kind: 'error', message: '인증 링크가 올바르지 않아요.' };
  });

  useEffect(() => {
    if (!params.code || params.error_description) return;
    supabase.auth
      .exchangeCodeForSession(params.code)
      .then(({ error }) => {
        if (error) {
          console.warn('[auth-callback] exchange failed', error.message);
          setResult({ kind: 'error', message: '링크가 만료되었거나 다른 기기에서 요청한 링크예요. 같은 기기에서 다시 요청해 주세요.' });
          return;
        }
        setResult({ kind: 'done', next: params.next === 'reset' ? '/reset-password' : '/' });
      })
      .catch((error: unknown) => {
        console.warn('[auth-callback] exchange threw', error);
        setResult({ kind: 'error', message: '네트워크 연결을 확인하고 다시 시도해 주세요.' });
      });
    // 최초 진입 시 한 번만
    // Only once on entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (result.kind === 'pending') return <LoadingView />;
  if (result.kind === 'done') return <Redirect href={result.next} />;
  return (
    <Screen>
      <EmptyState title="인증을 마치지 못했어요" body={result.message} />
      <Button variant="secondary" label="로그인 화면으로" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
