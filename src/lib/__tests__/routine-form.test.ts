// 루틴 폼 → 규칙 변환·검증 단위 테스트
// Unit tests for routine form → rule conversion and validation
import { describe, expect, it } from '@jest/globals';

import { buildRule, emptyForm, validateForm, type RoutineForm } from '@/lib/routine-form';

const TODAY = '2026-10-19';
const USER = 'user-1';

function form(patch: Partial<RoutineForm>): RoutineForm {
  return { ...emptyForm(TODAY, USER), title: '청소', ...patch };
}

describe('buildRule', () => {
  it('builds a weekly rule with sorted weekdays', () => {
    const result = buildRule(form({ freq: 'weekly', weekdays: [5, 2], interval: '1' }));
    expect(result).toEqual({
      ok: true,
      rule: { freq: 'weekly', interval: 1, weekdays: [2, 5], start_date: TODAY },
    });
  });

  it('requires at least one weekday', () => {
    expect(buildRule(form({ freq: 'weekly', weekdays: [] })).ok).toBe(false);
  });

  it('builds a monthly rule and rejects day 32', () => {
    expect(buildRule(form({ freq: 'monthly', monthDay: '31' }))).toEqual({
      ok: true,
      rule: { freq: 'monthly', interval: 1, day: 31, start_date: TODAY },
    });
    expect(buildRule(form({ freq: 'monthly', monthDay: '32' })).ok).toBe(false);
  });

  it('builds after_resolution with interval days and optional time', () => {
    expect(buildRule(form({ mode: 'after_resolution', intervalDays: '7', time: '09:30' }))).toEqual({
      ok: true,
      rule: { interval_days: 7, start_date: TODAY, time: '09:30' },
    });
  });

  it('rejects malformed time and start date', () => {
    expect(buildRule(form({ time: '9:3' })).ok).toBe(false);
    expect(buildRule(form({ freq: 'daily', startDate: '2026/10/19' })).ok).toBe(false);
  });

  it('manual mode needs no schedule', () => {
    expect(buildRule(form({ mode: 'manual', startDate: 'invalid' }))).toEqual({ ok: true, rule: {} });
  });
});

describe('validateForm', () => {
  it('requires a title', () => {
    expect(validateForm(form({ title: '  ', freq: 'daily' }))).not.toBeNull();
  });

  it('requires exactly one fixed assignee and at least one rotation member', () => {
    expect(validateForm(form({ freq: 'daily', assignmentMode: 'fixed', assignees: [] }))).not.toBeNull();
    expect(validateForm(form({ freq: 'daily', assignmentMode: 'rotate', assignees: [] }))).not.toBeNull();
    expect(validateForm(form({ freq: 'daily', assignmentMode: 'free', assignees: [] }))).toBeNull();
  });
});
