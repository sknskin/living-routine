// 공간 관리: 구성원·초대(관리자)·권한 이전·내보내기·탈퇴·공간 알림 (FR-02, FR-03, D04, D22)
// Space management: members, invites (admin), transfer, remove, leave, per-space notifications (FR-02, FR-03, D04, D22)
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SpaceGate } from '@/components/space-gate';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ToggleRow } from '@/components/ui/chip';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { LogoMark } from '@/components/illustrations/scenes';
import { NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useMembers } from '@/hooks/use-space-data';
import {
  archiveSpace,
  createInvitation,
  leaveSpace,
  removeMember,
  renameSpace,
  revokeInvitation,
  setSpaceNotifications,
  stepDownAdmin,
  transferAdmin,
  type CreatedInvitation,
} from '@/lib/api/commands';
import { fetchInvitations, fetchSpaceNotificationEnabled } from '@/lib/api/queries';
import { formatDateTime } from '@/lib/dates';
import { MAX_SPACE_NAME } from '@/lib/config';
import { confirmAction, showMessage } from '@/lib/feedback';
import { buildInviteLink, shareInvite } from '@/lib/invite-link';
import { queryKeys } from '@/lib/query-keys';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace, useSpaces } from '@/providers/space-provider';

// 공간 이름 변경 (관리자). 공간이나 이름이 바뀌면 key 로 다시 만들어 입력값이 최신 이름에서 시작한다.
// Rename space (admin). Remounted via key when the space or name changes so the input starts from the latest name.
function RenameSpaceForm({ spaceId, currentName }: { spaceId: string; currentName: string }) {
  const { refreshSpaces } = useSpaces();
  const [name, setName] = useState(currentName);
  const rename = useCommand((next: string) => renameSpace(spaceId, next), { onSuccess: () => refreshSpaces() });
  return (
    <View style={styles.renameRow}>
      <View style={styles.flex}>
        <TextField label="공간 이름" value={name} onChangeText={setName} maxLength={MAX_SPACE_NAME} />
      </View>
      <Button
        compact
        variant="secondary"
        label="이름 변경"
        disabled={!name.trim() || name.trim() === currentName}
        loading={rename.isPending}
        onPress={() => rename.mutate(name.trim())}
      />
    </View>
  );
}

export default function SpaceScreen() {
  return (
    <SpaceGate>
      <SpaceScreenContent />
    </SpaceGate>
  );
}

function SpaceScreenContent() {
  const userId = useUserId();
  const space = useCurrentSpace();
  const { refreshSpaces } = useSpaces();
  const isAdmin = space.role === 'admin';
  const members = useMembers();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const invitations = useQuery({
    queryKey: queryKeys.invitations(space.id),
    queryFn: () => fetchInvitations(space.id),
    enabled: isAdmin,
  });
  const notify = useQuery({
    queryKey: queryKeys.spaceNotify(space.id),
    queryFn: () => fetchSpaceNotificationEnabled(space.id, userId),
  });

  const invite = useCommand(() => createInvitation(space.id), { onSuccess: setCreated });
  const stepDown = useCommand(() => stepDownAdmin(space.id), { onSuccess: () => refreshSpaces() });
  const revoke = useCommand((invitationId: string) => revokeInvitation(invitationId));
  const transfer = useCommand((memberId: string) => transferAdmin(space.id, memberId), { onSuccess: () => refreshSpaces() });
  const remove = useCommand((memberId: string) => removeMember(space.id, memberId));
  const toggleNotify = useCommand((enabled: boolean) => setSpaceNotifications(space.id, enabled));
  const leaveDone = async () => {
    await refreshSpaces();
    router.replace('/home');
  };
  const leave = useCommand(() => leaveSpace(space.id), { onSuccess: leaveDone });
  const archive = useCommand(() => archiveSpace(space.id), { onSuccess: leaveDone });

  const activeMembers = (members.data ?? []).filter((member) => member.active);
  const openInvitations = (invitations.data ?? []).filter(
    (item) => !item.revoked_at && !item.accepted_at && new Date(item.expires_at) > new Date(),
  );

  const share = (code: string) => {
    shareInvite(space.name, code)
      .then((result) => {
        if (result === 'copied') showMessage('복사했어요', '초대 문구와 링크를 클립보드에 복사했어요.');
        if (result === 'unavailable') showMessage('공유 기능을 쓸 수 없어요', '위의 코드나 링크를 직접 전달해 주세요.');
      })
      .catch((error: unknown) => {
        console.warn('[space] share failed', error);
        showMessage('공유하지 못했어요', '코드를 직접 전달해 주세요.');
      });
  };

  const confirmThen = async (title: string, message: string, label: string, run: () => void) => {
    if (await confirmAction(title, message, label)) run();
  };

  return (
    <Screen edges={[]}>
      <Card>
        <View style={styles.titleRow}>
          <LogoMark size={44} />
          <View style={styles.flex}>
            <AppText variant="title">{space.name}</AppText>
            <AppText variant="small" tone="secondary">
              시간대 {space.timezone} · 내 역할 {isAdmin ? '관리자' : '구성원'}
            </AppText>
          </View>
        </View>
        {isAdmin ? <RenameSpaceForm key={`${space.id}:${space.name}`} spaceId={space.id} currentName={space.name} /> : null}
        <ToggleRow
          label="이 공간 알림 받기"
          description="나에게만 적용돼요. 꺼도 앱 안 알림함에는 남아요."
          value={notify.data ?? true}
          disabled={notify.isPending || toggleNotify.isPending}
          onChange={(enabled) => toggleNotify.mutate(enabled)}
        />
      </Card>

      <SectionHeader title={`구성원 ${activeMembers.length}`} />
      <Card>
        {activeMembers.map((member) => (
          <View key={member.userId} style={styles.member}>
            <AppText style={styles.flex}>
              {member.nickname}
              {member.userId === userId ? ' (나)' : ''} · {member.role === 'admin' ? '관리자' : '구성원'}
            </AppText>
            {isAdmin && member.userId !== userId ? (
              <Row>
                {member.role !== 'admin' ? (
                  <Button
                    compact
                    variant="ghost"
                    label="관리자 지정"
                    onPress={() => confirmThen('관리자로 지정할까요?', `${member.nickname}님도 초대·내보내기를 할 수 있어요.`, '지정', () => transfer.mutate(member.userId))}
                  />
                ) : null}
                <Button
                  compact
                  variant="danger"
                  label="내보내기"
                  onPress={() => confirmThen('내보낼까요?', '이 공간 접근이 즉시 해제되고, 남은 담당은 다시 배정돼요.', '내보내기', () => remove.mutate(member.userId))}
                />
              </Row>
            ) : null}
          </View>
        ))}
      </Card>

      {isAdmin ? (
        <>
          <SectionHeader title="초대" />
          <Card>
            <AppText variant="small" tone="secondary">
              초대 코드는 1회용이고 7일 뒤 만료돼요. 링크를 공유하거나 코드를 직접 전달해 주세요.
            </AppText>
            <Button label="새 초대 코드 만들기" onPress={() => invite.mutate(undefined)} loading={invite.isPending} />
            {created ? (
              <View style={styles.code}>
                <AppText variant="headline" selectable accessibilityLabel={`초대 코드 ${created.code.split('').join(' ')}`}>
                  {created.code}
                </AppText>
                <AppText variant="caption" tone="secondary" selectable>
                  {buildInviteLink(created.code)}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  만료 {formatDateTime(created.expiresAt)} · 이 화면을 벗어나면 다시 볼 수 없어요
                </AppText>
                <Button compact label="초대 링크 공유하기" onPress={() => share(created.code)} />
              </View>
            ) : null}
            {openInvitations.map((item) => (
              <View key={item.id} style={styles.member}>
                <AppText variant="small" style={styles.flex}>
                  대기 중 초대 · 만료 {formatDateTime(item.expires_at)}
                </AppText>
                <Button compact variant="ghost" label="취소" onPress={() => revoke.mutate(item.id)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="공간 나가기" />
      <Card>
        {isAdmin && activeMembers.filter((member) => member.role === 'admin').length === 1 && activeMembers.length > 1 ? (
          <NoticeBanner message="마지막 관리자는 다른 구성원을 관리자로 지정한 뒤 나갈 수 있어요." />
        ) : null}
        <Button
          variant="danger"
          label="이 공간에서 나가기"
          loading={leave.isPending}
          onPress={() => confirmThen('공간에서 나갈까요?', '이 공간의 데이터에 더 이상 접근할 수 없어요. 다른 공간에는 영향이 없어요.', '나가기', () => leave.mutate(undefined))}
        />
        {isAdmin && activeMembers.filter((member) => member.role === 'admin').length > 1 ? (
          <Button
            variant="secondary"
            label="관리자 내려놓기"
            loading={stepDown.isPending}
            onPress={() => confirmThen('관리자를 내려놓을까요?', '다른 관리자가 있어 공간 관리는 계속돼요. 나는 일반 구성원이 돼요.', '내려놓기', () => stepDown.mutate(undefined))}
          />
        ) : null}
        {isAdmin ? (
          <Button
            variant="danger"
            label="공간 보관(삭제)"
            loading={archive.isPending}
            onPress={() => confirmThen('공간을 보관할까요?', '모든 구성원이 이 공간에 접근할 수 없게 돼요. 다른 공간에는 영향이 없어요.', '보관', () => archive.mutate(undefined))}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', paddingVertical: Spacing.xs },
  flex: { flex: 1 },
  code: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  renameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
});
