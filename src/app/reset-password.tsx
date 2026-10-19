// 새 비밀번호 설정: 재설정 메일 링크로 받은 복구 세션에서만 사용 (로그인 보호 밖에 두되 세션을 직접 확인)
// Set a new password: only usable with the recovery session from the reset email link (outside the guard, checks the session itself)
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/layout';
import { EmptyState, NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { MIN_PASSWORD } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function ResetPasswordScreen() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <Screen>
        <EmptyState title="재설정 링크로 다시 들어와 주세요" body="비밀번호 재설정 메일의 링크를 열면 이 화면에서 새 비밀번호를 정할 수 있어요." />
        <Button variant="secondary" label="로그인 화면으로" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  const submit = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`);
      return;
    }
    if (password !== confirm) {
      setError('두 비밀번호가 서로 달라요.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        console.warn('[reset-password] update failed', updateError.message);
        setError('비밀번호를 바꾸지 못했어요. 이전과 다른 비밀번호인지 확인하고 다시 시도해 주세요.');
        return;
      }
      router.replace('/home');
    } catch (thrown: unknown) {
      console.warn('[reset-password] update threw', thrown);
      setError('네트워크 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="headline">새 비밀번호 설정</AppText>
      <Card>
        <TextField label="새 비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <TextField label="새 비밀번호 확인" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
        {error ? <NoticeBanner tone="danger" message={error} /> : null}
        <Button label="비밀번호 바꾸기" onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}
