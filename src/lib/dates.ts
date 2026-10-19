// 공간 시간대 기준 날짜 유틸. 날짜 문자열은 'YYYY-MM-DD'.
// Date utilities in the space time zone. Date strings are 'YYYY-MM-DD'.

const MS_PER_DAY = 86_400_000;
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? '';
}

// 시각(ISO)을 지정 시간대의 날짜로
// Convert an ISO instant to a date in the given time zone
export function localDateIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

// 지정 시간대의 오늘 날짜
// Today's date in the given time zone
export function todayIn(timeZone: string): string {
  // en-CA 형식은 YYYY-MM-DD
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// 형식과 실제 존재 여부(예: 2026-02-31 거부)를 함께 검사
// Check both the format and that the date exists (e.g. rejects 2026-02-31)
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return fromUtcMs(toUtcMs(date)) === date;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function weekdayOf(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

// 'M월 D일 (요일)'
// 'M월 D일 (weekday)'
export function formatDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${weekdayLabel(weekdayOf(date))})`;
}

// 오늘 기준 상대 표현
// Relative label against today
export function relativeDayLabel(date: string, today: string): string {
  const diff = diffDays(today, date);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  if (diff < 0) return `${-diff}일 지남`;
  return `${diff}일 후`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// 해당 월의 달력 칸 (앞쪽 빈칸 포함, 일요일 시작)
// Calendar cells for a month (leading blanks, Sunday first)
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: weekdayOf(first) }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(addDays(first, day - 1));
  }
  return cells;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
