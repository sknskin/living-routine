// 회차 상태 → 배지 라벨·톤 (순수 함수)
// Occurrence state → badge label and tone (pure)
import type { BadgeTone } from '@/components/ui/status-badge';
import { relativeDayLabel } from '@/lib/dates';
import type { Occurrence } from '@/types/domain';

export function occurrenceBadge(occurrence: Occurrence, today: string): { label: string; tone: BadgeTone } {
  if (occurrence.status === 'completed') return { label: '완료', tone: 'accent' };
  if (occurrence.status === 'skipped') return { label: '건너뜀', tone: 'neutral' };
  if (occurrence.status === 'void') return { label: '취소됨', tone: 'neutral' };
  if (occurrence.due_local_date === today) return { label: '오늘', tone: 'accent' };
  if (occurrence.due_local_date < today) return { label: relativeDayLabel(occurrence.due_local_date, today), tone: 'warning' };
  return { label: relativeDayLabel(occurrence.due_local_date, today), tone: 'neutral' };
}
