// 통계 계산 단위 테스트 (취소된 완료 제외, 7일 막대, 나의 기록)
// Unit tests for stats (undone excluded, 7-day bars, my record)
import { describe, expect, it } from '@jest/globals';

import { computeStats, validCompletions } from '@/lib/stats';
import type { EventWithReactions } from '@/types/domain';

const TODAY = '2026-10-19';
const ME = 'me';
const OTHER = 'other';

let n = 0;
function event(patch: Partial<EventWithReactions>): EventWithReactions {
  n += 1;
  return {
    id: `e${n}`,
    space_id: 's',
    routine_id: 'r',
    occurrence_id: `o${n}`,
    event_type: 'completed',
    actor_id: ME,
    performer_id: ME,
    original_assignee_id: ME,
    reverts_event_id: null,
    request_id: `q${n}`,
    payload: { resolved_local_date: TODAY },
    recorded_at: '2026-10-19T03:00:00Z',
    reactions: [],
    ...patch,
  };
}

describe('stats', () => {
  it('excludes undone completions', () => {
    const done = event({});
    const undo = event({ event_type: 'undone', reverts_event_id: done.id });
    expect(validCompletions([done, undo])).toHaveLength(0);
  });

  it('builds a 7-day window ending today', () => {
    const stats = computeStats(
      [
        event({}),
        event({ payload: { resolved_local_date: '2026-10-17' }, performer_id: OTHER, actor_id: OTHER }),
        event({ payload: { resolved_local_date: '2026-10-01' } }),
      ],
      TODAY,
      ME,
      7,
      'Asia/Seoul',
    );
    expect(stats.week.map((day) => day.date)).toEqual([
      '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    ]);
    expect(stats.week.map((day) => day.count)).toEqual([0, 0, 0, 0, 1, 0, 1]);
    expect(stats.today.done).toBe(1);
    // 창 밖(10/01) 완료는 나의 기록에서도 제외
    // A completion outside the window (10/01) is excluded from my record too
    expect(stats.mine.done).toBe(1);
  });

  it('counts my completions and reactions received', () => {
    const mine = event({
      reactions: [
        { id: 'x', space_id: 's', event_id: 'e', author_id: OTHER, type: 'thanks', message: null, removed_at: null, created_at: '2026-10-19T04:00:00Z' },
      ],
    });
    const theirs = event({ performer_id: OTHER, actor_id: OTHER });
    const stats = computeStats([mine, theirs], TODAY, ME, 7, 'Asia/Seoul');
    expect(stats.mine.done).toBe(1);
    expect(stats.mine.reactionsReceived).toBe(1);
    // 04:00Z = 서울 13:00 → 오늘 반응 1건
    // 04:00Z = 13:00 in Seoul → one reaction today
    expect(stats.today.reactions).toBe(1);
  });

  it('uses the space time zone for request dates', () => {
    // 2026-10-18T16:00Z 는 서울 기준 10월 19일 01:00
    // 2026-10-18T16:00Z is 01:00 on Oct 19 in Seoul
    const request = event({ event_type: 'help_requested', recorded_at: '2026-10-18T16:00:00Z' });
    expect(computeStats([request], TODAY, ME, 7, 'Asia/Seoul').today.requests).toBe(1);
    expect(computeStats([request], TODAY, ME, 7, 'UTC').today.requests).toBe(0);
  });
});
