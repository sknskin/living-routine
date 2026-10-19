// 온보딩 1단계: 새 공간 만들기 또는 초대로 참여 (U01, 최소 입력)
// Onboarding step 1: create a space or join by invite (U01, minimal input)
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyHomeIllustration } from '@/components/illustrations/scenes';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/layout';
import { NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { createSpace } from '@/lib/api/commands';
import { DEFAULT_TIMEZONE, MAX_SPACE_NAME } from '@/lib/config';
import { deviceTimeZone } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { useSpaces } from '@/providers/space-provider';

const DEFAULT_SPACE_NAME = '우리 집';

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ new?: string }>();
  const { spaces, refreshSpaces, selectSpace } = useSpaces();
  const [name, setName] = useState(DEFAULT_SPACE_NAME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = deviceTimeZone() || DEFAULT_TIMEZONE;
  const isAdditional = params.new === '1' || spaces.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const spaceId = await createSpace(name.trim() || DEFAULT_SPACE_NAME, timezone);
      await refreshSpaces();
      selectSpace(spaceId);
      router.replace({ pathname: '/onboarding/templates', params: { spaceId } });
    } catch (thrown: unknown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <EmptyHomeIllustration size={160} label="집 일러스트" />
        <AppText variant="headline">{isAdditional ? '새 공간 만들기' : '어디서 함께 지내나요?'}</AppText>
        <AppText tone="secondary">공간마다 구성원·루틴·기록이 따로 관리돼요. 혼자 써도 괜찮아요.</AppText>
      </View>
      <Card>
        <TextField label="공간 이름" value={name} onChangeText={setName} maxLength={MAX_SPACE_NAME} />
        <AppText variant="caption" tone="secondary">
          시간대: {timezone} (이 공간의 날짜 기준)
        </AppText>
        {error ? <NoticeBanner tone="danger" message={error} /> : null}
        <Button label="공간 만들기" onPress={submit} loading={busy} />
      </Card>
      <Card>
        <AppText>초대받은 공간이 있나요?</AppText>
        <Button variant="secondary" label="초대 코드로 참여하기" onPress={() => router.push('/join')} />
      </Card>
      {isAdditional ? <Button variant="ghost" label="돌아가기" onPress={() => router.back()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.sm, marginTop: Spacing.xl },
});
