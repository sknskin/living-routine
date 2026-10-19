// 홈 화면 구역 분류 (순수 함수). 현재 회차 우선, 오래된 미완료는 별도 영역 (D20, U05).
// Home section classification (pure). Current occurrences first; old overdue in a separate area (D20, U05).
import { addDays } from '@/lib/dates';
import type { Occurrence, RoutineWithRule } from '@/types/domain';

export type HomeFilter = 'mine' | 'all';

export type HomeSections = {
  current: Occurrence[];
  overdue: Occurrence[];
  upcoming: Occurrence[];
  doneToday: Occurrence[];
};

export function classifyHome(params: {
  occurrences: Occurrence[];
  routines: Map<string, RoutineWithRule>;
  today: string;
  lookaheadDays: number;
  filter: HomeFilter;
  userId: string;
}): HomeSections {
  const { occurrences, routines, today, lookaheadDays, filter, userId } = params;
  const horizon = addDays(today, lookaheadDays);
  const sections: HomeSections = { current: [], overdue: [], upcoming: [], doneToday: [] };

  for (const occurrence of occurrences) {
    const routine = routines.get(occurrence.routine_id);
    if (!routine || routine.archived_at) continue;
    // 내 할 일 = 내 담당 + 누구나 할 수 있는 회차
    // Mine = assigned to me + open to anyone
    const visible = filter === 'all' || occurrence.assigned_user_id === userId || occurrence.assigned_user_id === null;
    if (!visible) continue;

    if (occurrence.status === 'completed' || occurrence.status === 'skipped') {
      if (occurrence.resolved_local_date === today) sections.doneToday.push(occurrence);
      continue;
    }
    if (occurrence.status !== 'scheduled' || occurrence.is_manual) continue;

    const due = occurrence.due_local_date;
    if (due === today || (routine.mode === 'after_resolution' && due < today)) {
      // 완료일 기준은 열린 회차가 하나라 기한이 지나도 현재 회차
      // after_resolution has a single open occurrence, so it stays current even if late
      sections.current.push(occurrence);
    } else if (due < today) {
      sections.overdue.push(occurrence);
    } else if (due <= horizon) {
      sections.upcoming.push(occurrence);
    }
  }

  sections.overdue.sort((a, b) => b.due_local_date.localeCompare(a.due_local_date));
  return sections;
}
