// 홈 구역 분류 단위 테스트 (현재 회차 우선·지난 미완료 분리·내 할 일 필터)
// Unit tests for home classification (current first, overdue separated, "mine" filter)
import { describe, expect, it } from '@jest/globals';

import { classifyHome } from '@/lib/home-sections';
import type { Occurrence, RoutineWithRule } from '@/types/domain';

const TODAY = '2026-10-19';
const ME = 'me';
const OTHER = 'other';

function routine(id: string, mode: RoutineWithRule['mode'], archived = false): RoutineWithRule {
  return {
    id,
    space_id: 's',
    title: id,
    mode,
    assignment_mode: 'rotate',
    current_rule_version: 1,
    notify_enabled: true,
    created_by: ME,
    archived_at: archived ? '2026-10-01T00:00:00Z' : null,
    create_request_id: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    rule: {},
    assignees: [ME, OTHER],
  };
}

let seq = 0;
function occurrence(patch: Partial<Occurrence>): Occurrence {
  seq += 1;
  return {
    id: `o${seq}`,
    seq,
    space_id: 's',
    routine_id: 'fixed',
    rule_version: 1,
    is_manual: false,
    is_fixed_slot: true,
    is_single_open: false,
    due_local_date: TODAY,
    original_assignee_id: ME,
    assigned_user_id: ME,
    status: 'scheduled',
    custom_override: false,
    performer_id: null,
    resolved_by: null,
    resolved_at: null,
    resolved_local_date: null,
    created_from_occurrence_id: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    ...patch,
  };
}

const routines = new Map([
  ['fixed', routine('fixed', 'fixed')],
  ['after', routine('after', 'after_resolution')],
  ['archived', routine('archived', 'fixed', true)],
]);

function classify(occurrences: Occurrence[], filter: 'mine' | 'all' = 'mine') {
  return classifyHome({ occurrences, routines, today: TODAY, lookaheadDays: 7, filter, userId: ME });
}

describe('classifyHome', () => {
  it('puts today in current, past fixed in overdue, future in upcoming', () => {
    const result = classify([
      occurrence({ due_local_date: TODAY }),
      occurrence({ due_local_date: '2026-10-10' }),
      occurrence({ due_local_date: '2026-10-22' }),
      occurrence({ due_local_date: '2026-11-30' }),
    ]);
    expect(result.current).toHaveLength(1);
    expect(result.overdue).toHaveLength(1);
    expect(result.upcoming).toHaveLength(1);
  });

  it('keeps a late after_resolution occurrence as current', () => {
    const result = classify([occurrence({ routine_id: 'after', due_local_date: '2026-10-12', is_fixed_slot: false })]);
    expect(result.current).toHaveLength(1);
    expect(result.overdue).toHaveLength(0);
  });

  it('filters other people’s tasks in "mine" but shows free tasks', () => {
    const items = [occurrence({ assigned_user_id: OTHER }), occurrence({ assigned_user_id: null })];
    expect(classify(items, 'mine').current).toHaveLength(1);
    expect(classify(items, 'all').current).toHaveLength(2);
  });

  it('lists only things resolved today as done today and hides archived routines', () => {
    const result = classify([
      occurrence({ status: 'completed', resolved_local_date: TODAY, due_local_date: '2026-10-15' }),
      occurrence({ status: 'completed', resolved_local_date: '2026-10-18' }),
      occurrence({ routine_id: 'archived' }),
    ]);
    expect(result.doneToday).toHaveLength(1);
    expect(result.current).toHaveLength(0);
  });
});
