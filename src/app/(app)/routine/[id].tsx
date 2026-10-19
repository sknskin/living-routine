// 루틴 생성·편집: 종류 → 일정 → 담당 → 알림 → 미리보기 → 저장 (U03)
// Routine create/edit: mode → schedule → assignees → notification → preview → save (U03)
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SpaceGate } from '@/components/space-gate';
import { ScheduleFields } from '@/components/schedule-fields';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip, ToggleRow } from '@/components/ui/chip';
import { Card, Row, Screen, SectionHeader } from '@/components/ui/layout';
import { EmptyState, LoadingView, NoticeBanner } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useCommand } from '@/hooks/use-command';
import { useRequestKey } from '@/hooks/use-request-key';
import { useMembers, useRoutineMap, useRoutines, useSpaceToday } from '@/hooks/use-space-data';
import { setRoutineArchived, setRoutineNotification, upsertRoutine } from '@/lib/api/commands';
import { fetchRoutineNotificationPrefs, fetchTemplates, previewDates } from '@/lib/api/queries';
import { MAX_ROUTINE_TITLE, PREVIEW_COUNT } from '@/lib/config';
import { formatDate } from '@/lib/dates';
import { confirmAction } from '@/lib/feedback';
import { toRule } from '@/lib/json';
import { queryKeys } from '@/lib/query-keys';
import { ASSIGNMENT_LABEL, MODE_DESCRIPTION, MODE_LABEL } from '@/lib/routine-labels';
import { buildRule, emptyForm, formFromRoutine, formFromRule, validateForm, type RoutineForm } from '@/lib/routine-form';
import { useUserId } from '@/providers/auth-provider';
import { useCurrentSpace } from '@/providers/space-provider';
import type { AssignmentMode, RoutineMode, RoutineWithRule } from '@/types/domain';

const MODES: RoutineMode[] = ['fixed', 'after_resolution', 'manual'];
const ASSIGNMENT_MODES: AssignmentMode[] = ['fixed', 'rotate', 'free'];

export default function RoutineEditorScreen() {
  return (
    <SpaceGate>
      <RoutineEditorScreenContent />
    </SpaceGate>
  );
}

function RoutineEditorScreenContent() {
  const { id, template } = useLocalSearchParams<{ id: string; template?: string }>();
  const isNew = id === 'new';
  const userId = useUserId();
  const today = useSpaceToday();
  const routinesQuery = useRoutines();
  const routines = useRoutineMap();
  const templates = useQuery({ queryKey: queryKeys.templates(), queryFn: fetchTemplates, enabled: !!template });

  if (routinesQuery.isPending || (!!template && templates.isPending)) return <LoadingView />;
  const existing = isNew ? undefined : routines.get(id);
  if (!isNew && !existing) return <EmptyState title="루틴을 찾을 수 없어요" />;

  // 기존 루틴 또는 템플릿으로 초기 폼 구성
  // Build the initial form from the existing routine or template
  const base = emptyForm(today, userId);
  const picked = templates.data?.find((item) => item.id === template);
  const initial = existing
    ? formFromRoutine(base, existing)
    : picked
      ? formFromRule(base, picked.title, picked.mode, toRule(picked.rule))
      : base;

  return <RoutineEditor key={`${id}:${template ?? ''}`} initial={initial} existing={existing} />;
}

function RoutineEditor({ initial, existing }: { initial: RoutineForm; existing: RoutineWithRule | undefined }) {
  const isNew = !existing;
  const space = useCurrentSpace();
  const today = useSpaceToday();
  const members = useMembers();
  const [form, setForm] = useState<RoutineForm>(initial);
  const [applyToCurrent, setApplyToCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createKey = useRequestKey();

  const update = (patch: Partial<RoutineForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const built = buildRule(form);
  const ruleKey = built.ok ? JSON.stringify(built.rule) : '';
  const preview = useQuery({
    queryKey: queryKeys.preview(form.mode, ruleKey, today),
    queryFn: () => (built.ok ? previewDates(form.mode, built.rule, today, PREVIEW_COUNT) : Promise.resolve([])),
    enabled: built.ok && form.mode !== 'manual',
  });

  const save = useCommand(
    () => {
      if (!built.ok) throw new Error('VALIDATION_ERROR');
      return upsertRoutine({
        spaceId: space.id,
        routineId: existing?.id ?? null,
        title: form.title.trim(),
        mode: form.mode,
        rule: built.rule,
        assignmentMode: form.assignmentMode,
        assignees: form.assignmentMode === 'free' ? [] : form.assignees,
        notifyEnabled: form.notifyEnabled,
        expectedVersion: existing?.version ?? null,
        applyToCurrent,
        requestId: existing ? undefined : createKey.get(),
      });
    },
    {
      onSuccess: () => {
        createKey.settle();
        router.back();
      },
      onError: createKey.settle,
    },
  );
  const archive = useCommand(() => setRoutineArchived(existing?.id ?? '', true), { onSuccess: () => router.back() });

  const activeMembers = (members.data ?? []).filter((member) => member.active);
  const toggleAssignee = (memberId: string) => {
    if (form.assignmentMode === 'fixed') {
      update({ assignees: [memberId] });
      return;
    }
    const has = form.assignees.includes(memberId);
    update({ assignees: has ? form.assignees.filter((item) => item !== memberId) : [...form.assignees, memberId] });
  };

  const submit = () => {
    const message = validateForm(form);
    setError(message);
    if (!message) save.mutate(undefined);
  };

  const confirmArchive = async () => {
    const ok = await confirmAction('루틴을 보관할까요?', '과거 기록은 그대로 남고, 언제든 복원할 수 있어요.', '보관');
    if (ok) archive.mutate(undefined);
  };

  return (
    <Screen edges={[]}>
      <Card>
        <TextField label="이름" value={form.title} onChangeText={(title) => update({ title })} maxLength={MAX_ROUTINE_TITLE} />
      </Card>

      <SectionHeader title="반복 방식" />
      <Card>
        <Row role="radiogroup" label="반복 방식">
          {MODES.map((mode) => (
            <Chip
              key={mode}
              label={MODE_LABEL[mode]}
              selected={form.mode === mode}
              // 생성 후에는 모드를 바꾸지 않는다 (이력 해석 일관성)
              // Mode is fixed after creation (keeps history consistent)
              disabled={!isNew}
              onPress={() => update({ mode })}
            />
          ))}
        </Row>
        <AppText variant="caption" tone="secondary">
          {MODE_DESCRIPTION[form.mode]}
        </AppText>
        <ScheduleFields form={form} update={update} today={today} />
      </Card>

      <SectionHeader title="담당" />
      <Card>
        <Row role="radiogroup" label="담당 방식">
          {ASSIGNMENT_MODES.map((mode) => (
            <Chip
              key={mode}
              label={ASSIGNMENT_LABEL[mode]}
              selected={form.assignmentMode === mode}
              onPress={() =>
                update({ assignmentMode: mode, assignees: mode === 'fixed' ? form.assignees.slice(0, 1) : form.assignees })
              }
            />
          ))}
        </Row>
        {form.assignmentMode !== 'free' ? (
          <>
            <Row>
              {activeMembers.map((member) => (
                <Chip
                  key={member.userId}
                  role={form.assignmentMode === 'rotate' ? 'checkbox' : 'radio'}
                  label={member.nickname}
                  selected={form.assignees.includes(member.userId)}
                  onPress={() => toggleAssignee(member.userId)}
                />
              ))}
            </Row>
            {form.assignmentMode === 'rotate' && form.assignees.length > 0 ? (
              <AppText variant="caption" tone="secondary">
                순서: {form.assignees.map((memberId) => activeMembers.find((m) => m.userId === memberId)?.nickname ?? '?').join(' → ')}
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText variant="caption" tone="secondary">
            구성원 누구나 할 수 있어요.
          </AppText>
        )}
      </Card>

      <SectionHeader title="알림" />
      <Card>
        <ToggleRow
          label="이 루틴 알림 사용 (공간 공통)"
          description="하루 요약에 포함되고, 시각을 정하면 개별 알림 + 미완료 시 1회 재알림이 와요."
          value={form.notifyEnabled}
          onChange={(notifyEnabled) => update({ notifyEnabled })}
        />
        {existing ? <PersonalNotifyToggle routineId={existing.id} routineEnabled={existing.notify_enabled} /> : null}
        <TextField
          label="개별 알림 시각 (선택, HH:MM)"
          value={form.time}
          onChangeText={(time) => update({ time })}
          placeholder="예: 09:00"
          autoCapitalize="none"
        />
      </Card>

      {form.mode !== 'manual' ? (
        <>
          <SectionHeader title="다음 일정 미리보기" />
          <Card>
            {!built.ok ? (
              <AppText tone="secondary">{built.message}</AppText>
            ) : (
              <View style={styles.preview}>
                {(preview.data ?? []).map((date) => (
                  <AppText key={date}>{formatDate(date)}</AppText>
                ))}
                {form.mode === 'after_resolution' ? (
                  <AppText variant="caption" tone="secondary">
                    매번 예정일에 완료한다고 가정한 예시예요.
                  </AppText>
                ) : null}
              </View>
            )}
          </Card>
        </>
      ) : null}

      {!isNew && form.mode !== 'manual' ? (
        <Card>
          <ToggleRow
            label="현재 회차에도 적용"
            description="끄면 지금 회차는 그대로 두고 다음 회차부터 바뀌어요. 개별 변경된 회차는 유지돼요."
            value={applyToCurrent}
            onChange={setApplyToCurrent}
          />
        </Card>
      ) : null}

      {error ? <NoticeBanner tone="danger" message={error} /> : null}
      <Button label={isNew ? '루틴 만들기' : '저장'} onPress={submit} loading={save.isPending} />
      {!isNew ? <Button variant="danger" label="루틴 보관" onPress={confirmArchive} loading={archive.isPending} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { gap: Spacing.xs },
});

// 나에게만 적용되는 루틴 알림 설정 (U03 "개인 알림 선택"). 다른 구성원에게는 영향 없음.
// Routine notification setting for me only (U03 "personal notification choice"). Does not affect other members.
function PersonalNotifyToggle({ routineId, routineEnabled }: { routineId: string; routineEnabled: boolean }) {
  const userId = useUserId();
  const prefs = useQuery({ queryKey: queryKeys.routineNotifyPrefs(userId), queryFn: fetchRoutineNotificationPrefs });
  const toggle = useCommand((enabled: boolean) => setRoutineNotification(routineId, enabled), {
    onSuccess: () => {
      prefs.refetch().catch((error: unknown) => console.warn('[routine] prefs refetch failed', error));
    },
  });
  const enabled = prefs.data?.get(routineId) ?? true;
  return (
    <ToggleRow
      label="나에게 이 루틴 알림 보내기"
      description={
        routineEnabled
          ? '나에게만 적용되고 바로 저장돼요. 꺼도 다른 구성원은 그대로 알림을 받아요.'
          : '이 루틴의 공통 알림이 꺼져 있어 지금은 바꿀 수 없어요.'
      }
      value={routineEnabled && (toggle.isPending && toggle.variables !== undefined ? toggle.variables : enabled)}
      disabled={!routineEnabled || prefs.isPending || toggle.isPending}
      onChange={(next) => toggle.mutate(next)}
    />
  );
}
