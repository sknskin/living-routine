// 설정: 닉네임·개인 알림/방해 금지·기기·로그아웃·계정 삭제 (D07, D14, D21)
// Settings: nickname, personal notifications/DND, devices, sign-out, account deletion (D07, D14, D21)
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip, ToggleRow } from '@/components/ui/chip';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { LoadingView, NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { useCommand } from '@/hooks/use-command';
import { requestAccountDeletion, setPushDeviceEnabled, updatePreferences, updateProfile } from '@/lib/api/commands';
import { fetchMyNickname, fetchPreferences, fetchPushDevices } from '@/lib/api/queries';
import { DEFAULT_TIMEZONE, MAX_NICKNAME } from '@/lib/config';
import { deviceTimeZone } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { confirmAction, showMessage } from '@/lib/feedback';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { THEME_PREFERENCE_LABEL, THEME_PREFERENCE_ORDER } from '@/lib/theme-preference';
import { useAuth, useUserId } from '@/providers/auth-provider';
import { useAppTheme } from '@/providers/theme-provider';
import type { NotificationPreferences } from '@/types/domain';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// DB time 값 'HH:MM:SS' → 'HH:MM'
// DB time 'HH:MM:SS' → 'HH:MM'
const HH_MM_LENGTH = 5;

function signOut() {
  supabase.auth.signOut().catch((error: unknown) => console.warn('[settings] sign-out failed', error));
}

function ProfileForm({ initialName, onSaved }: { initialName: string; onSaved: () => void }) {
  const [name, setName] = useState(initialName);
  const save = useCommand(() => updateProfile(name), {
    onSuccess: () => {
      onSaved();
      showMessage('저장했어요', '닉네임을 바꿨어요.');
    },
  });
  return (
    <Card>
      <TextField label="닉네임" value={name} onChangeText={setName} maxLength={MAX_NICKNAME} />
      <Button variant="secondary" label="닉네임 저장" onPress={() => save.mutate(undefined)} loading={save.isPending} />
    </Card>
  );
}

function PreferencesForm({ initial, onSaved }: { initial: NotificationPreferences | null; onSaved: () => void }) {
  const [summaryEnabled, setSummaryEnabled] = useState(initial?.summary_enabled ?? true);
  const [summaryTime, setSummaryTime] = useState(initial?.summary_time.slice(0, HH_MM_LENGTH) ?? '08:00');
  const [quietEnabled, setQuietEnabled] = useState(initial?.quiet_enabled ?? false);
  const [quietStart, setQuietStart] = useState(initial?.quiet_start.slice(0, HH_MM_LENGTH) ?? '22:00');
  const [quietEnd, setQuietEnd] = useState(initial?.quiet_end.slice(0, HH_MM_LENGTH) ?? '08:00');
  const [error, setError] = useState<string | null>(null);
  const timezone = initial?.timezone ?? (deviceTimeZone() || DEFAULT_TIMEZONE);

  const save = useCommand(
    () => updatePreferences({ summaryEnabled, summaryTime, quietEnabled, quietStart, quietEnd, timezone }),
    {
      onSuccess: () => {
        onSaved();
        showMessage('저장했어요', '알림 설정을 바꿨어요.');
      },
    },
  );

  const submit = () => {
    if (![summaryTime, quietStart, quietEnd].every((value) => TIME_PATTERN.test(value))) {
      setError('시각은 HH:MM 형식이에요. (예: 08:00)');
      return;
    }
    setError(null);
    save.mutate(undefined);
  };

  return (
    <Card>
      <ToggleRow label="하루 요약" description="할 일이 있는 날 정한 시각에 한 번" value={summaryEnabled} onChange={setSummaryEnabled} />
      <TextField label="요약 시각 (HH:MM)" value={summaryTime} onChangeText={setSummaryTime} autoCapitalize="none" />
      <ToggleRow label="방해 금지" description="이 시간에는 푸시를 보내지 않고 끝난 뒤 전달해요" value={quietEnabled} onChange={setQuietEnabled} />
      <TextField label="시작 (HH:MM)" value={quietStart} onChangeText={setQuietStart} autoCapitalize="none" />
      <TextField label="종료 (HH:MM)" value={quietEnd} onChangeText={setQuietEnd} autoCapitalize="none" />
      <AppText variant="caption" tone="secondary">
        알림 시간대: {timezone}
      </AppText>
      {error ? <NoticeBanner tone="danger" message={error} /> : null}
      <Button label="알림 설정 저장" onPress={submit} loading={save.isPending} />
    </Card>
  );
}

// 계정 삭제: 비밀번호 재인증으로 새 세션 토큰을 받은 뒤에만 서버가 허용 (CMD-11, 08)
// Account deletion: the server allows it only with a fresh session token from password re-auth (CMD-11, 08)
function AccountDeletion() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = useCommand(
    async () => {
      const email = session?.user.email;
      if (!email) {
        throw toAppError({ message: 'REAUTH_REQUIRED' });
      }
      const reauth = await supabase.auth.signInWithPassword({ email, password });
      if (reauth.error) {
        throw toAppError({ message: 'REAUTH_REQUIRED' });
      }
      await requestAccountDeletion();
    },
    {
      silentError: true,
      // 서버 계정은 이미 삭제됐으므로 이 기기 세션만 정리
      // The server account is already gone, so only clear this device's session
      onSuccess: () => {
        supabase.auth.signOut({ scope: 'local' }).catch((error: unknown) => console.warn('[settings] local sign-out failed', error));
      },
      onError: (appError) => setError(appError.message),
    },
  );

  const confirmDelete = async () => {
    setError(null);
    if (!password) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    const ok = await confirmAction(
      '계정을 삭제할까요?',
      '로그인 정보·개인 설정·기기 정보가 삭제되고, 혼자 쓰던 공간도 삭제돼요. 함께 쓰던 공간의 완료 기록은 "탈퇴한 사용자"로 남고 메시지는 지워져요. 되돌릴 수 없어요.',
      '삭제',
    );
    if (ok) deleteAccount.mutate(undefined);
  };

  return (
    <>
      <TextField label="계정 삭제 전 비밀번호 확인" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <NoticeBanner tone="danger" message={error} /> : null}
      <Button variant="danger" label="계정 삭제" onPress={confirmDelete} loading={deleteAccount.isPending} />
    </>
  );
}

// 화면 모드 선택 (이 기기에만 저장, 기본은 시스템 설정 따르기 — D10)
// Appearance choice (saved on this device only; default follows the system — D10)
function AppearanceSection() {
  const { preference, setPreference } = useAppTheme();
  return (
    <Card>
      <Row role="radiogroup" label="화면 모드">
        {THEME_PREFERENCE_ORDER.map((option) => (
          <Chip
            key={option}
            label={THEME_PREFERENCE_LABEL[option]}
            selected={preference === option}
            onPress={() => setPreference(option)}
          />
        ))}
      </Row>
      <AppText variant="caption" tone="secondary">
        이 기기에만 적용돼요. 시스템 설정을 따르면 기기의 라이트/다크 모드에 맞춰 바뀌어요.
      </AppText>
    </Card>
  );
}

export default function SettingsScreen() {
  const userId = useUserId();
  const nickname = useQuery({ queryKey: queryKeys.nickname(userId), queryFn: () => fetchMyNickname(userId) });
  const prefs = useQuery({ queryKey: queryKeys.preferences(userId), queryFn: () => fetchPreferences(userId) });
  const devices = useQuery({ queryKey: queryKeys.devices(userId), queryFn: fetchPushDevices });

  const toggleDevice = useCommand(
    ({ id, enabled }: { id: string; enabled: boolean }) => setPushDeviceEnabled(id, enabled),
    { onSuccess: () => devices.refetch() },
  );

  if (nickname.isPending || prefs.isPending) return <LoadingView />;

  return (
    <Screen edges={[]}>
      <SectionHeader title="프로필" />
      <ProfileForm initialName={nickname.data ?? ''} onSaved={() => nickname.refetch()} />

      <SectionHeader title="화면 모드" />
      <AppearanceSection />

      <SectionHeader title="내 알림 (나에게만 적용)" />
      <PreferencesForm initial={prefs.data ?? null} onSaved={() => prefs.refetch()} />

      <SectionHeader title="알림 받는 기기" />
      <Card>
        {(devices.data ?? []).length === 0 ? (
          <AppText variant="small" tone="secondary">
            등록된 기기가 없어요. 푸시 알림은 실제 기기용 앱 빌드에서 권한을 허용하면 등록돼요. 그 전에도 앱 안 알림함에서 확인할 수 있어요.
          </AppText>
        ) : (
          (devices.data ?? []).map((device) => (
            <ToggleRow
              key={device.id}
              label={`${device.platform} 기기`}
              description={device.invalidated_at ? '토큰이 만료되어 비활성화됐어요' : undefined}
              value={device.enabled && !device.invalidated_at}
              disabled={!!device.invalidated_at}
              onChange={(enabled) => toggleDevice.mutate({ id: device.id, enabled })}
            />
          ))
        )}
      </Card>

      <SectionHeader title="계정" />
      <Card>
        <Button variant="secondary" label="로그아웃" onPress={signOut} />
        <AccountDeletion />
      </Card>
    </Screen>
  );
}
