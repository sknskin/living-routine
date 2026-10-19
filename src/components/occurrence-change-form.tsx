// 이번 회차만 변경 (날짜·담당). 규칙은 그대로, 이 회차는 개별 변경으로 보존 (06 §4, §7)
// Change this occurrence only (date/assignee). The rule stays; this occurrence is preserved as an override (06 §4, §7)
import { useState } from 'react';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, Row } from '@/components/ui/layout';
import { NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { updateOccurrence } from '@/lib/api/commands';
import { addDays, formatDate, isValidDate } from '@/lib/dates';
import type { Member, Occurrence } from '@/types/domain';

// 빠른 날짜 선택 (오늘 기준 일수)
// Quick date picks (days from today)
const QUICK_DAYS = [0, 1, 2, 7];
const QUICK_LABEL: Record<number, string> = { 0: '오늘', 1: '내일', 2: '모레', 7: '일주일 뒤' };
const FREE = 'free';

type Props = {
  occurrence: Occurrence;
  members: Member[];
  today: string;
  onDone: () => void;
};

export function OccurrenceChangeForm({ occurrence, members, today, onDone }: Props) {
  // 현재 담당이 탈퇴했으면 "누구나"에서 시작 (선택 가능한 칩이 없으므로)
  // If the current assignee has left, start from "anyone" (there is no chip to select them)
  const currentActive = members.some((member) => member.active && member.userId === occurrence.assigned_user_id);
  const initialAssignee = currentActive && occurrence.assigned_user_id ? occurrence.assigned_user_id : FREE;
  const [date, setDate] = useState(occurrence.due_local_date);
  const [assignee, setAssignee] = useState<string>(initialAssignee);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRequestKey();
  const save = useCommand(
    () =>
      updateOccurrence({
        occurrenceId: occurrence.id,
        dueLocalDate: date === occurrence.due_local_date ? null : date,
        // 담당을 건드리지 않았으면 서버에 "변경 없음"으로 보낸다
        // If the assignee was not touched, send "unchanged" to the server
        assigneeId: assignee === FREE || assignee === occurrence.assigned_user_id ? null : assignee,
        // "누구나"를 고르면 실제 담당(탈퇴한 담당 포함)을 비운다
        // Choosing "anyone" clears the actual assignee (including a departed one)
        clearAssignee: assignee === FREE && occurrence.assigned_user_id !== null,
        requestId: requestKey.get(),
      }),
    {
      silentError: true,
      onSuccess: () => {
        requestKey.settle();
        onDone();
      },
      onError: (appError) => {
        requestKey.settle(appError);
        setError(appError.detail === 'date in the past' ? '지난 날짜로는 옮길 수 없어요.' : appError.message);
      },
    },
  );

  const submit = () => {
    if (!isValidDate(date)) {
      setError('올바른 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }
    const assigneeUnchanged =
      assignee === FREE ? occurrence.assigned_user_id === null : assignee === occurrence.assigned_user_id;
    if (date === occurrence.due_local_date && assigneeUnchanged) {
      setError('바뀐 내용이 없어요.');
      return;
    }
    setError(null);
    save.mutate(undefined);
  };

  return (
    <Card>
      <AppText weight="bold">이번 회차만 변경</AppText>
      <AppText variant="caption" tone="secondary">
        반복 규칙은 그대로 두고 이 회차만 바꿔요. 나중에 주기를 바꿔도 이 회차는 유지돼요.
      </AppText>
      <Row role="radiogroup" label="빠른 날짜">
        {QUICK_DAYS.map((offset) => {
          const value = addDays(today, offset);
          return <Chip key={offset} label={QUICK_LABEL[offset]} selected={date === value} onPress={() => setDate(value)} />;
        })}
      </Row>
      <TextField label={`날짜 (YYYY-MM-DD) · ${isValidDate(date) ? formatDate(date) : ''}`} value={date} onChangeText={setDate} autoCapitalize="none" />
      <AppText variant="small" tone="secondary">
        담당
      </AppText>
      <Row role="radiogroup" label="담당">
        <Chip label="누구나" selected={assignee === FREE} onPress={() => setAssignee(FREE)} />
        {members
          .filter((member) => member.active)
          .map((member) => (
            <Chip
              key={member.userId}
              label={member.nickname}
              selected={assignee === member.userId}
              onPress={() => setAssignee(member.userId)}
            />
          ))}
      </Row>
      {error ? <NoticeBanner tone="danger" message={error} /> : null}
      <Button label="이번 회차 변경 저장" onPress={submit} loading={save.isPending} />
    </Card>
  );
}
