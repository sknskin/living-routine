// 루틴 편집 폼 상태 ↔ 규칙 JSON 변환과 검증 (순수 함수)
// Routine editor form state ↔ rule JSON conversion and validation (pure)
import { MAX_ROUTINE_TITLE } from '@/lib/config';
import { isValidDate } from '@/lib/dates';
import type { AssignmentMode, FixedFreq, RoutineMode, RoutineRule, RoutineWithRule } from '@/types/domain';

// 서버 규칙 간격 상한과 동일
// Same as the server's interval upper bound
export const MAX_INTERVAL = 365;
const MAX_MONTH_DAY = 31;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type RoutineForm = {
  title: string;
  mode: RoutineMode;
  freq: FixedFreq;
  interval: string;
  weekdays: number[];
  monthDay: string;
  intervalDays: string;
  startDate: string;
  time: string;
  assignmentMode: AssignmentMode;
  assignees: string[];
  notifyEnabled: boolean;
};

export function emptyForm(today: string, userId: string): RoutineForm {
  return {
    title: '',
    mode: 'fixed',
    freq: 'weekly',
    interval: '1',
    weekdays: [],
    monthDay: '1',
    intervalDays: '7',
    startDate: today,
    time: '',
    assignmentMode: 'fixed',
    assignees: [userId],
    notifyEnabled: true,
  };
}

// 규칙 JSON 을 폼 값으로 채움 (기존 루틴·템플릿 공용)
// Fill form values from rule JSON (shared by existing routines and templates)
export function formFromRule(base: RoutineForm, title: string, mode: RoutineMode, rule: RoutineRule): RoutineForm {
  return {
    ...base,
    title,
    mode,
    freq: rule.freq ?? base.freq,
    interval: String(rule.interval ?? 1),
    weekdays: rule.weekdays ?? [],
    monthDay: String(rule.day ?? base.monthDay),
    intervalDays: String(rule.interval_days ?? base.intervalDays),
    startDate: rule.start_date ?? base.startDate,
    time: rule.time ?? '',
  };
}

export function formFromRoutine(base: RoutineForm, routine: RoutineWithRule): RoutineForm {
  return {
    ...formFromRule(base, routine.title, routine.mode, routine.rule),
    assignmentMode: routine.assignment_mode,
    assignees: routine.assignees,
    notifyEnabled: routine.notify_enabled,
  };
}

function parsePositive(value: string, max: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
}

export type BuildResult = { ok: true; rule: RoutineRule } | { ok: false; message: string };

export function buildRule(form: RoutineForm): BuildResult {
  const time = form.time.trim();
  if (time && !TIME_PATTERN.test(time)) {
    return { ok: false, message: '알림 시각은 HH:MM 형식이에요. (예: 09:00)' };
  }
  const timePart = time ? { time } : {};

  if (form.mode === 'manual') {
    return { ok: true, rule: timePart };
  }
  if (!isValidDate(form.startDate)) {
    return { ok: false, message: '시작일은 실제 있는 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.' };
  }
  if (form.mode === 'after_resolution') {
    const intervalDays = parsePositive(form.intervalDays, MAX_INTERVAL);
    if (!intervalDays) return { ok: false, message: `간격은 1~${MAX_INTERVAL}일이에요.` };
    return { ok: true, rule: { interval_days: intervalDays, start_date: form.startDate, ...timePart } };
  }

  const interval = parsePositive(form.interval, MAX_INTERVAL);
  if (!interval) return { ok: false, message: `반복 간격은 1~${MAX_INTERVAL}이에요.` };
  if (form.freq === 'weekly') {
    if (form.weekdays.length === 0) return { ok: false, message: '요일을 하나 이상 골라 주세요.' };
    return {
      ok: true,
      rule: { freq: 'weekly', interval, weekdays: [...form.weekdays].sort((a, b) => a - b), start_date: form.startDate, ...timePart },
    };
  }
  if (form.freq === 'monthly') {
    const day = parsePositive(form.monthDay, MAX_MONTH_DAY);
    if (!day) return { ok: false, message: '날짜는 1~31 사이예요.' };
    return { ok: true, rule: { freq: 'monthly', interval, day, start_date: form.startDate, ...timePart } };
  }
  return { ok: true, rule: { freq: 'daily', interval, start_date: form.startDate, ...timePart } };
}

export function validateForm(form: RoutineForm): string | null {
  const title = form.title.trim();
  if (!title || title.length > MAX_ROUTINE_TITLE) return `이름은 1~${MAX_ROUTINE_TITLE}자예요.`;
  if (form.assignmentMode === 'fixed' && form.assignees.length !== 1) return '고정 담당은 한 명을 골라 주세요.';
  if (form.assignmentMode === 'rotate' && form.assignees.length < 1) return '돌아가며 할 사람을 골라 주세요.';
  const built = buildRule(form);
  return built.ok ? null : built.message;
}
