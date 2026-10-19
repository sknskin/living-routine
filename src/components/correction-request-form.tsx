// 기록 정정 요청: 타인이 남긴 기록은 직접 고치지 않고 기록한 사람에게 요청 (D18, O05 권장 초안)
// Correction request: never edit someone else's record; ask the recorder instead (D18, O05 draft)
import { useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { requestCorrection } from '@/lib/api/commands';
import { MAX_MESSAGE } from '@/lib/config';
import { showMessage } from '@/lib/feedback';

type Props = {
  occurrenceId: string;
  recorderName: string;
  onDone: () => void;
};

export function CorrectionRequestForm({ occurrenceId, recorderName, onDone }: Props) {
  const [message, setMessage] = useState('');
  const requestKey = useRequestKey();
  const send = useCommand(() => requestCorrection(occurrenceId, message, requestKey.get()), {
    onSuccess: () => {
      requestKey.settle();
      showMessage('요청을 보냈어요', `${recorderName}님이 기록을 확인하고 필요하면 취소할 수 있어요.`);
      onDone();
    },
    onError: requestKey.settle,
  });

  return (
    <Card>
      <AppText weight="bold">{recorderName}님에게 정정 요청</AppText>
      <AppText variant="caption" tone="secondary">
        기록은 기록한 사람만 취소할 수 있어요. 요청을 받으면 알림함에서 확인해요.
      </AppText>
      <TextField
        label="메시지 (선택)"
        value={message}
        onChangeText={setMessage}
        maxLength={MAX_MESSAGE}
        placeholder="예: 이건 제가 했어요"
      />
      <Button label="정정 요청 보내기" onPress={() => send.mutate(undefined)} loading={send.isPending} />
    </Card>
  );
}
