// 도움 요청 작성: 대상 구성원 선택 + 선택적 짧은 메시지 (U05)
// Help request form: pick a member + optional short message (U05)
import { useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, Row } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { requestHelp } from '@/lib/api/commands';
import { MAX_MESSAGE } from '@/lib/config';
import type { Member } from '@/types/domain';

type Props = {
  occurrenceId: string;
  candidates: Member[];
  onDone: () => void;
};

export function HelpRequestForm({ occurrenceId, candidates, onDone }: Props) {
  const [recipient, setRecipient] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const requestKey = useRequestKey();
  const send = useCommand(
    (to: string) => requestHelp(occurrenceId, to, message, requestKey.get()),
    {
      onSuccess: () => {
        requestKey.settle();
        onDone();
      },
      onError: requestKey.settle,
    },
  );

  return (
    <Card>
      <AppText weight="medium">누구에게 부탁할까요?</AppText>
      <AppText variant="caption" tone="secondary">
        상대가 수락하기 전까지 담당은 그대로예요.
      </AppText>
      <Row>
        {candidates.map((member) => (
          <Chip
            key={member.userId}
            label={member.nickname}
            selected={recipient === member.userId}
            onPress={() => {
              // 다른 사람에게 보내는 요청은 별개의 명령이므로 키를 새로 발급
              // A request to someone else is a different command, so issue a new key
              if (recipient !== member.userId) requestKey.settle();
              setRecipient(member.userId);
            }}
          />
        ))}
      </Row>
      <TextField
        label="메시지 (선택)"
        value={message}
        onChangeText={setMessage}
        maxLength={MAX_MESSAGE}
        placeholder="예: 오늘 늦게 들어가요"
      />
      <Button
        label="도움 요청 보내기"
        disabled={!recipient}
        loading={send.isPending}
        onPress={() => recipient && send.mutate(recipient)}
      />
    </Card>
  );
}
