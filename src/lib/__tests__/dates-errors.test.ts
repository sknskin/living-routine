// 날짜 유틸·오류 코드 파싱 단위 테스트
// Unit tests for date utilities and error code parsing
import { describe, expect, it } from '@jest/globals';

import { addDays, diffDays, isValidDate, monthGrid, relativeDayLabel, weekdayOf } from '@/lib/dates';
import { AppError, toAppError } from '@/lib/errors';
import { ruleSummary } from '@/lib/routine-labels';

describe('dates', () => {
  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('computes day differences and weekdays', () => {
    expect(diffDays('2026-10-19', '2026-10-26')).toBe(7);
    expect(weekdayOf('2026-10-19')).toBe(1);
  });

  it('labels relative days', () => {
    expect(relativeDayLabel('2026-10-19', '2026-10-19')).toBe('오늘');
    expect(relativeDayLabel('2026-10-20', '2026-10-19')).toBe('내일');
    expect(relativeDayLabel('2026-10-16', '2026-10-19')).toBe('3일 지남');
  });

  it('rejects dates that do not exist', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('2026/02/01')).toBe(false);
  });

  it('builds a Sunday-first month grid', () => {
    // 2026-10-01 은 목요일 → 앞 빈칸 4개
    // 2026-10-01 is Thursday → 4 leading blanks
    const grid = monthGrid(2026, 10);
    expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(grid[4]).toBe('2026-10-01');
    expect(grid.filter(Boolean)).toHaveLength(31);
  });
});

describe('toAppError', () => {
  it('parses server codes', () => {
    const error = toAppError({ message: 'ALREADY_RESOLVED: completed' });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('ALREADY_RESOLVED');
    expect(error.detail).toBe('completed');
  });

  it('maps unknown failures to TEMPORARY_FAILURE', () => {
    expect(toAppError(new Error('Failed to fetch')).code).toBe('TEMPORARY_FAILURE');
  });
});

describe('ruleSummary', () => {
  it('mentions month-end clamping only for days above 28', () => {
    expect(ruleSummary('fixed', { freq: 'monthly', day: 31, interval: 1 })).toContain('말일');
    expect(ruleSummary('fixed', { freq: 'monthly', day: 1, interval: 1 })).not.toContain('말일');
  });
});
