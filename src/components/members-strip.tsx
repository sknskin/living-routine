// 공간 구성원 아바타 줄: 두 사람 사이에 하트 (참고 이미지 홈 상단)
// Space member avatar strip with a heart between the first two (reference home header)
import { StyleSheet, View } from 'react-native';

import { MemberAvatar } from '@/components/illustrations/member-avatar';
import { HeartIcon } from '@/components/illustrations/scenes';
import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';
import type { Member } from '@/types/domain';

// 한 줄에 보여줄 최대 인원
// Maximum members shown in one row
const MAX_VISIBLE = 5;
const AVATAR_SIZE = 56;

export function MembersStrip({ members, userId }: { members: Member[]; userId: string }) {
  const active = members.filter((member) => member.active);
  // 나를 맨 앞에
  // Put the current user first
  const ordered = [...active].sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId));
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`구성원 ${active.length}명: ${active.map((member) => member.nickname).join(', ')}`}>
      {visible.map((member, index) => (
        <View key={member.userId} style={styles.item}>
          {index === 1 ? (
            <View style={styles.heart}>
              <HeartIcon size={18} />
            </View>
          ) : null}
          <View style={styles.person}>
            <MemberAvatar seed={member.userId} size={AVATAR_SIZE} />
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {member.userId === userId ? '나' : member.nickname}
            </AppText>
          </View>
        </View>
      ))}
      {hidden > 0 ? (
        <AppText variant="small" tone="secondary">
          +{hidden}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  person: { alignItems: 'center', gap: Spacing.xs, maxWidth: AVATAR_SIZE + Spacing.lg },
  heart: { marginBottom: Spacing.lg },
});
