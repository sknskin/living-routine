// 초대 수락: 코드 → 공간 확인 → 명시적 수락 → 공간 홈 (U02)
// Accept invite: code → review space → explicit accept → space home (U02)
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/layout';
import { NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { acceptInvite, previewInvite, type InvitePreview } from '@/lib/api/commands';
import { formatDateTime } from '@/lib/dates';
import { errorMessage, toAppError } from '@/lib/errors';
import { clearPendingInvite, peekPendingInvite } from '@/lib/invite-link';
import { useSpaces } from '@/providers/space-provider';

export default function JoinScreen() {
  const { refreshSpaces, selectSpace } = useSpaces();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromLink, setFromLink] = useState(false);

  const check = async (value: string = code) => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewInvite(value.trim()));
      // 확인에 성공한 뒤에만 보관 코드를 지운다 (네트워크 실패 시 코드 유실 방지)
      // Clear the stored code only after a successful preview (so a network failure does not lose it)
      await clearPendingInvite();
    } catch (thrown: unknown) {
      setPreview(null);
      setError(errorMessage(thrown));
      // 만료·무효 코드는 다시 쓸 일이 없으므로 보관본도 지운다
      // Expired/invalid codes are useless, so drop the stored copy too
      const code = toAppError(thrown).code;
      if (code === 'INVITE_EXPIRED' || code === 'INVITE_INVALID') {
        clearPendingInvite().catch((error: unknown) => console.warn('[join] clear pending failed', error));
      }
    } finally {
      setBusy(false);
    }
  };

  // 초대 링크로 들어온 코드가 있으면 채우고 바로 확인
  // If a code arrived via an invite link, fill it in and check right away
  useEffect(() => {
    peekPendingInvite()
      .then((pending) => {
        if (!pending) return;
        setCode(pending);
        setFromLink(true);
        return check(pending);
      })
      .catch((caught: unknown) => console.warn('[join] pending invite failed', caught));
    // 최초 진입 시 한 번만
    // Only once on first entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const spaceId = await acceptInvite(code.trim());
      await refreshSpaces();
      selectSpace(spaceId);
      router.replace('/home');
    } catch (thrown: unknown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      {fromLink ? <NoticeBanner message="초대 링크로 들어왔어요. 공간을 확인하고 참여해 주세요." /> : null}
      <Card>
        <TextField
          label="초대 코드"
          value={code}
          onChangeText={(value) => {
            setCode(value);
            setPreview(null);
          }}
          autoCapitalize="characters"
          placeholder="예: 3FA9C21B7D04"
        />
        <Button label="확인하기" variant="secondary" onPress={() => check()} loading={busy && !preview} disabled={!code.trim()} />
      </Card>
      {preview ? (
        <Card>
          <AppText variant="title">{preview.spaceName}</AppText>
          <AppText tone="secondary">구성원 {preview.memberCount}명 · 초대 만료 {formatDateTime(preview.expiresAt)}</AppText>
          <AppText variant="small" tone="secondary">
            참여하면 이 공간의 루틴·기록을 함께 보고 관리해요. 다른 공간의 정보는 공유되지 않아요.
          </AppText>
          {preview.alreadyMember ? (
            <NoticeBanner message="이미 참여한 공간이에요." />
          ) : null}
          <Button label={preview.alreadyMember ? '이 공간으로 이동' : '참여하기'} onPress={accept} loading={busy} />
        </Card>
      ) : null}
      {error ? <NoticeBanner tone="danger" message={error} /> : null}
    </Screen>
  );
}
