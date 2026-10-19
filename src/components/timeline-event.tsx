// 타임라인 이벤트: 실제 수행자·기록 시각·감사 반응 (U06). 강제 반응·재촉·점수 없음.
// 항목을 누르면 회차 상세로 이동 (02 "캘린더/타임라인 → 활동 상세 연결").
// Timeline event: performer, recorded time, thanks reactions (U06). No forced reactions, nagging or scores.
// Tapping opens the occurrence detail (02 "calendar/timeline link to activity detail").
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MemberAvatar } from '@/components/illustrations/member-avatar';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Row } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing, useThemeColors } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { removeReaction, sendReaction } from '@/lib/api/commands';
import { MAX_MESSAGE } from '@/lib/config';
import { formatDate, formatDateTime } from '@/lib/dates';
import { asRecord, getString } from '@/lib/json';
import { eventVerb, REACTION_LABEL, REACTION_ORDER } from '@/lib/routine-labels';
import type { EventWithReactions, ReactionType } from '@/types/domain';

type Props = {
  event: EventWithReactions;
  userId: string;
  nameOf: (userId: string | null | undefined) => string;
  // 홈 요약용: 반응 입력 없이 한 줄 요약
  // Home summary: one line, no reaction controls
  compact?: boolean;
};

const AVATAR_SIZE = 36;
const COMPACT_AVATAR_SIZE = 28;

export function TimelineEvent({ event, userId, nameOf, compact = false }: Props) {
  const colors = useThemeColors();
  const [message, setMessage] = useState('');
  const [composing, setComposing] = useState(false);
  const mine = event.reactions.find((reaction) => reaction.author_id === userId);
  const reactable = (event.event_type === 'completed' || event.event_type === 'manual_run') && event.actor_id !== userId;
  const payload = asRecord(event.payload);
  const title = getString(payload, 'title') ?? '';
  const toDate = getString(payload, 'to_date');

  const react = useCommand((type: ReactionType) => sendReaction(event.id, type, message), {
    onSuccess: () => {
      setComposing(false);
      setMessage('');
    },
  });
  const unreact = useCommand(() => removeReaction(event.id));

  // 원래 담당과 수행자가 다르면 대신 수행 표시 (D18)
  // Show "on behalf of" when performer differs from the original assignee (D18)
  const onBehalf =
    event.event_type === 'completed' && event.original_assignee_id && event.performer_id && event.original_assignee_id !== event.performer_id
      ? ` (${nameOf(event.original_assignee_id)} 차례 대신)`
      : '';
  const detail = event.event_type === 'rescheduled' && toDate ? ` → ${formatDate(toDate)}` : '';

  const openDetail = () => router.push({ pathname: '/occurrence/[id]', params: { id: event.occurrence_id } });

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.divider }]}>
      <Pressable accessibilityRole="button" accessibilityHint="회차 상세 보기" onPress={openDetail} style={styles.head}>
        <MemberAvatar seed={event.actor_id} size={compact ? COMPACT_AVATAR_SIZE : AVATAR_SIZE} />
        <View style={styles.text}>
          <AppText variant={compact ? 'small' : 'body'}>
            <AppText variant={compact ? 'small' : 'body'} weight="bold">
              {event.actor_id === userId ? '나' : nameOf(event.actor_id)}
            </AppText>
            {event.actor_id === userId ? '는 ' : '님이 '}
            {title ? `“${title}” ` : ''}
            {eventVerb(event.event_type)}
            {onBehalf}
            {detail}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {formatDateTime(event.recorded_at)}
            {event.reactions.length > 0 && compact ? ` · 반응 ${event.reactions.length}` : ''}
          </AppText>
        </View>
      </Pressable>

      {!compact && event.reactions.length > 0 ? (
        <View style={styles.reactions}>
          {event.reactions.map((reaction) => (
            <View key={reaction.id} style={[styles.reaction, { backgroundColor: colors.accentSoft }]}>
              <AppText variant="small">
                <AppText variant="small" weight="bold">
                  {reaction.author_id === userId ? '나' : nameOf(reaction.author_id)}
                </AppText>{' '}
                {REACTION_LABEL[reaction.type]}
                {reaction.message ? ` · “${reaction.message}”` : ''}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {!compact && reactable ? (
        <View style={styles.actions}>
          <Row>
            {REACTION_ORDER.map((type) => (
              <Chip
                key={type}
                label={REACTION_LABEL[type]}
                selected={mine?.type === type}
                disabled={react.isPending}
                onPress={() => react.mutate(type)}
              />
            ))}
          </Row>
          <Row>
            {mine ? <Button compact variant="ghost" label="반응 취소" onPress={() => unreact.mutate(undefined)} /> : null}
            {!composing ? <Button compact variant="ghost" label="메시지 함께 보내기" onPress={() => setComposing(true)} /> : null}
          </Row>
          {composing ? (
            <TextField
              label="짧은 메시지 (선택, 반응을 누르면 함께 보내요)"
              value={message}
              onChangeText={setMessage}
              maxLength={MAX_MESSAGE}
              placeholder="메시지로 마음을 전해 보세요"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  reactions: { gap: Spacing.xs, paddingLeft: AVATAR_SIZE + Spacing.md },
  reaction: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignSelf: 'flex-start' },
  actions: { gap: Spacing.sm, paddingLeft: AVATAR_SIZE + Spacing.md },
});
