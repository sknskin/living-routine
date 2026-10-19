// 회차 배지 단위 테스트
// Unit tests for occurrence badges
import { describe, expect, it } from '@jest/globals';

import { occurrenceBadge } from '@/lib/occurrence-badge';
import type { Occurrence } from '@/types/domain';

const TODAY = '2026-10-19';

function occ(patch: Partial<Occurrence>): Occurrence {
  return {
    id: 'o', seq: 1, space_id: 's', routine_id: 'r', rule_version: 1, is_manual: false, is_fixed_slot: true,
    is_single_open: false, due_local_date: TODAY, original_assignee_id: null, assigned_user_id: null,
    status: 'scheduled', custom_override: false, performer_id: null, resolved_by: null, resolved_at: null,
    resolved_local_date: null, created_from_occurrence_id: null, version: 1, created_at: '2026-10-19T00:00:00Z',
    ...patch,
  };
}

describe('occurrenceBadge', () => {
  it('labels states with text, not color alone', () => {
    expect(occurrenceBadge(occ({}), TODAY)).toEqual({ label: '오늘', tone: 'accent' });
    expect(occurrenceBadge(occ({ due_local_date: '2026-10-16' }), TODAY)).toEqual({ label: '3일 지남', tone: 'warning' });
    expect(occurrenceBadge(occ({ due_local_date: '2026-10-20' }), TODAY)).toEqual({ label: '내일', tone: 'neutral' });
    expect(occurrenceBadge(occ({ status: 'completed' }), TODAY).label).toBe('완료');
    expect(occurrenceBadge(occ({ status: 'skipped' }), TODAY).label).toBe('건너뜀');
  });
});
