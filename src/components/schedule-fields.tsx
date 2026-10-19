// 루틴 반복 일정 입력 필드 (모드별)
// Routine schedule fields per mode
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { Row } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { addDays, weekdayLabel } from '@/lib/dates';
import type { RoutineForm } from '@/lib/routine-form';
import type { FixedFreq } from '@/types/domain';

const FREQ_OPTIONS: { value: FixedFreq; label: string }[] = [
  { value: 'daily', label: '매일/며칠마다' },
  { value: 'weekly', label: '요일마다' },
  { value: 'monthly', label: '매월 날짜' },
];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const INTERVAL_UNIT: Record<FixedFreq, string> = { daily: '일', weekly: '주', monthly: '개월' };

type Props = {
  form: RoutineForm;
  update: (patch: Partial<RoutineForm>) => void;
  today: string;
};

// 시작일 빠른 선택 (오늘 기준 일수)
// Quick start-date picks (days from today)
const START_QUICK_DAYS = [0, 1, 7];
const START_QUICK_LABEL: Record<number, string> = { 0: '오늘부터', 1: '내일부터', 7: '다음 주부터' };

export function ScheduleFields({ form, update, today }: Props) {
  if (form.mode === 'manual') {
    return (
      <AppText variant="small" tone="secondary">
        정해진 일정 없이 필요할 때 실행해요. 실행할 때마다 다음 사람에게 차례가 넘어가요.
      </AppText>
    );
  }

  const toggleWeekday = (weekday: number) => {
    const has = form.weekdays.includes(weekday);
    update({ weekdays: has ? form.weekdays.filter((day) => day !== weekday) : [...form.weekdays, weekday] });
  };

  return (
    <>
      {form.mode === 'after_resolution' ? (
        <TextField
          label="완료 후 며칠 뒤 다시 할까요? (일)"
          value={form.intervalDays}
          onChangeText={(value) => update({ intervalDays: value })}
          keyboardType="number-pad"
        />
      ) : (
        <>
          <Row role="radiogroup" label="반복 단위">
            {FREQ_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={form.freq === option.value}
                onPress={() => update({ freq: option.value })}
              />
            ))}
          </Row>
          <TextField
            label={`반복 간격 (${INTERVAL_UNIT[form.freq]}마다)`}
            value={form.interval}
            onChangeText={(value) => update({ interval: value })}
            keyboardType="number-pad"
          />
          {form.freq === 'weekly' ? (
            <Row>
              {WEEKDAYS.map((weekday) => (
                <Chip
                  key={weekday}
                  role="checkbox"
                  label={weekdayLabel(weekday)}
                  selected={form.weekdays.includes(weekday)}
                  onPress={() => toggleWeekday(weekday)}
                />
              ))}
            </Row>
          ) : null}
          {form.freq === 'monthly' ? (
            <TextField
              label="날짜 (없는 달은 말일로 맞춰요)"
              value={form.monthDay}
              onChangeText={(value) => update({ monthDay: value })}
              keyboardType="number-pad"
            />
          ) : null}
        </>
      )}
      <Row role="radiogroup" label="시작일 빠른 선택">
        {START_QUICK_DAYS.map((offset) => {
          const value = addDays(today, offset);
          return (
            <Chip
              key={offset}
              label={START_QUICK_LABEL[offset]}
              selected={form.startDate === value}
              onPress={() => update({ startDate: value })}
            />
          );
        })}
      </Row>
      <TextField
        label="시작일 (YYYY-MM-DD)"
        value={form.startDate}
        onChangeText={(value) => update({ startDate: value })}
        autoCapitalize="none"
      />
    </>
  );
}
