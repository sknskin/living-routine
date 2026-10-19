// RPC JSON 응답의 안전한 필드 접근
// Safe field access for RPC JSON responses
import type { Json } from '@/types/database';
import type { RoutineRule } from '@/types/domain';

export type JsonRecord = { [key: string]: Json | undefined };

export function asRecord(value: Json | null | undefined): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

export function getString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

export function getBoolean(record: JsonRecord, key: string): boolean {
  return record[key] === true;
}

export function getNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

// 규칙 JSON 을 숫자/문자 필드만 골라 변환
// Convert rule JSON by picking only known numeric/string fields
export function toRule(value: Json | null | undefined): RoutineRule {
  const record = asRecord(value);
  const weekdays = Array.isArray(record.weekdays)
    ? record.weekdays.filter((item): item is number => typeof item === 'number')
    : undefined;
  const freq = getString(record, 'freq');
  return {
    freq: freq === 'daily' || freq === 'weekly' || freq === 'monthly' ? freq : undefined,
    interval: getNumber(record, 'interval') ?? undefined,
    weekdays,
    day: getNumber(record, 'day') ?? undefined,
    interval_days: getNumber(record, 'interval_days') ?? undefined,
    start_date: getString(record, 'start_date') ?? undefined,
    time: getString(record, 'time') ?? undefined,
  };
}
