// 로그인/가입 화면.
// 소셜 로그인 공급자(O02)는 미정이므로 개발·내부 테스트용 이메일 로그인으로 대체한다.
// Sign-in / sign-up screen.
// Social providers (O02) are undecided, so email sign-in stands in for dev/internal testing.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LogoMark, TogetherIllustration } from '@/components/illustrations/scenes';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/layout';
import { NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { authRedirectUrl } from '@/lib/auth-links';
import { MAX_NICKNAME, MIN_PASSWORD } from '@/lib/config';
import { peekPendingInvite } from '@/lib/invite-link';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up' | 'reset';

// 인증 오류 → 안내 문구
// Auth error → guidance text
function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/already registered/i.test(message)) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (/password/i.test(message)) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`;
  return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    peekPendingInvite()
      .then((code) => setInvited(!!code))
      .catch((error: unknown) => console.warn('[sign-in] pending invite check failed', error));
  }, []);

  // 비밀번호 재설정 메일 요청. 가입 여부를 노출하지 않도록 결과와 관계없이 같은 안내를 보여준다.
  // Request a password reset email. Shows the same message regardless of outcome so account existence is not revealed.
  const requestReset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('가입한 이메일을 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirectUrl('reset'),
      });
      if (resetError) {
        console.warn('[sign-in] reset request failed', resetError.message);
      }
      setInfo('가입된 이메일이라면 비밀번호 재설정 메일을 보냈어요. 메일의 링크는 이 기기에서 열어 주세요.');
    } catch (thrown: unknown) {
      console.warn('[sign-in] reset request threw', thrown);
      setError('네트워크 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || password.length < MIN_PASSWORD) {
      setError(`이메일과 ${MIN_PASSWORD}자 이상 비밀번호를 입력해 주세요.`);
      return;
    }
    if (mode === 'sign-up' && !nickname.trim()) {
      setError('닉네임을 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: { data: { nickname: nickname.trim() }, emailRedirectTo: authRedirectUrl('home') },
            });
      if (result.error) {
        setError(authErrorMessage(result.error.message));
        return;
      }
      // 이메일 인증이 켜진 환경(클라우드 기본)에서는 가입 직후 세션이 없다 → 메일 확인 안내 후 로그인 화면 유지
      // With email confirmation on (cloud default) there is no session right after sign-up → ask to check email and stay
      if (!result.data.session) {
        setMode('sign-in');
        setInfo('인증 메일을 보냈어요. 메일의 링크를 이 기기에서 열면 가입이 완료돼요.');
        return;
      }
      // 초대 링크로 들어왔다면 참여 화면으로 (U01-2 "초대 링크가 있으면 참여 흐름 우선")
      // If the user came from an invite link, go to the join screen (U01-2)
      const pending = await peekPendingInvite().catch((error: unknown) => {
        console.warn('[sign-in] pending invite check failed', error);
        return null;
      });
      router.replace(pending ? '/join' : '/home');
    } catch (thrown: unknown) {
      console.warn('[sign-in] failed', thrown);
      setError('네트워크 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <LogoMark size={56} label="앱 로고" />
        <AppText variant="headline">생활 루틴</AppText>
        <AppText tone="secondary">생활을 함께 기억하고, 작은 기여를 알아주는 공간이에요.</AppText>
        <View style={styles.illustration}>
          <TogetherIllustration size={200} label="함께 사는 두 사람 일러스트" />
        </View>
      </View>
      {invited ? <NoticeBanner message="초대를 받았어요. 로그인하거나 가입하면 바로 참여 화면으로 이동해요." /> : null}
      <Card>
        <TextField
          label="이메일"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {mode !== 'reset' ? (
          <TextField
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          />
        ) : null}
        {mode === 'sign-up' ? (
          <TextField label="닉네임" value={nickname} onChangeText={setNickname} maxLength={MAX_NICKNAME} />
        ) : null}
        {info ? <NoticeBanner message={info} /> : null}
        {error ? <NoticeBanner tone="danger" message={error} /> : null}
        {mode === 'reset' ? (
          <Button label="재설정 메일 보내기" onPress={requestReset} loading={busy} />
        ) : (
          <Button label={mode === 'sign-in' ? '로그인' : '가입하기'} onPress={submit} loading={busy} />
        )}
        <Button
          variant="ghost"
          label={mode === 'sign-in' ? '처음이에요 · 가입하기' : '이미 계정이 있어요 · 로그인'}
          onPress={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setInfo(null);
          }}
        />
        {mode === 'sign-in' ? (
          <Button
            variant="ghost"
            label="비밀번호를 잊었어요"
            onPress={() => {
              setMode('reset');
              setError(null);
              setInfo(null);
            }}
          />
        ) : null}
      </Card>
      <NoticeBanner message="개발·내부 테스트용 이메일 로그인입니다. 간편 로그인 공급자는 출시 전 결정돼요." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.sm, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  illustration: { alignItems: 'center', marginTop: Spacing.md },
});
