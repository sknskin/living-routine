// 초대 링크 진입점 (로그인 없이 열림). 코드를 보관한 뒤 로그인 상태에 따라 참여 화면 또는 로그인으로 이동 (U01-2, U02).
// Invite link entry (works signed out). Stores the code, then goes to join or sign-in depending on auth (U01-2, U02).
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { EmptyState, LoadingView } from '@/components/ui/states';
import { normalizeInviteCode, savePendingInvite } from '@/lib/invite-link';
import { useAuth } from '@/providers/auth-provider';

export default function InviteLinkScreen() {
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const code = normalizeInviteCode(rawCode ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!code) return;
    savePendingInvite(code)
      .catch((error: unknown) => console.warn('[invite] save failed', error))
      .finally(() => setSaved(true));
  }, [code]);

  if (!code) {
    return <EmptyState title="초대 링크가 올바르지 않아요" body="초대한 분께 새 링크를 요청해 주세요." />;
  }
  if (!saved) {
    return <LoadingView />;
  }
  return <Redirect href={session ? '/join' : '/sign-in'} />;
}
