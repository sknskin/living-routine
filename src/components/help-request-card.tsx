// 받은 도움 요청: 수락 전에는 담당이 바뀌지 않음 (U05)
// Incoming help request: assignment does not change until accepted (U05)
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/layout';
import { Spacing } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { respondHelp } from '@/lib/api/commands';
import { showMessage } from '@/lib/feedback';
import type { HelpRequest } from '@/types/domain';

type Props = {
  request: HelpRequest;
  title: string;
  requesterName: string;
};

export function HelpRequestCard({ request, title, requesterName }: Props) {
  // 수락·거절은 서로 다른 명령이므로 키를 분리
  // Accept and decline are different commands, so they use separate keys
  const acceptKey = useRequestKey();
  const declineKey = useRequestKey();
  const keyFor = (accept: boolean) => (accept ? acceptKey : declineKey);
  const respond = useCommand((accept: boolean) => respondHelp(request.id, accept, keyFor(accept).get()), {
    onSuccess: (cancelled) => {
      acceptKey.settle();
      declineKey.settle();
      if (cancelled) {
        showMessage('요청이 정리됐어요', '이미 처리됐거나 담당이 바뀐 회차라 도움 요청을 닫았어요.');
      }
    },
    onError: (error) => {
      acceptKey.settle(error);
      declineKey.settle(error);
    },
  });

  return (
    <Card>
      <AppText weight="medium">
        {requesterName}님이 “{title}” 도움을 요청했어요
      </AppText>
      {request.message ? <AppText tone="secondary">“{request.message}”</AppText> : null}
      <View style={styles.actions}>
        <Button
          style={styles.flex}
          label="내가 할게요"
          onPress={() => respond.mutate(true)}
          loading={respond.isPending && respond.variables === true}
          disabled={respond.isPending}
        />
        <Button
          style={styles.flex}
          variant="secondary"
          label="어려워요"
          onPress={() => respond.mutate(false)}
          loading={respond.isPending && respond.variables === false}
          disabled={respond.isPending}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
