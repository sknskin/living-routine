// 이벤트 → 통계 (순수 함수). 취소된 완료는 제외한다.
// 구성원 간 비교·순위는 만들지 않는다 (01·참고 이미지 "점수·비교·랭킹 없음"): 함께 한 양 + 나의 기록만.
// Events → stats (pure). Undone completions are excluded.
// No member comparison or ranking (doc 01 / reference "no scores, comparisons, rankings"): totals together + my own record only.
import { addDays, localDateIn } from '@/lib/dates';
import { asRecord, getString } from '@/lib/json';
import type { EventWithReactions } from '@/types/domain';

export type DayCount = { date: string; count: number };

export type SpaceStats = {
  week: DayCount[];
  today: { done: number; requests: number; reactions: number };
  mine: { done: number; reactionsReceived: number; helped: number };
};

const DONE_TYPES = new Set(['completed', 'manual_run']);

// 취소되지 않은 완료 이벤트만
// Completion events that were not undone
export function validCompletions(events: EventWithReactions[]): EventWithReactions[] {
  const reverted = new Set(events.filter((event) => event.event_type === 'undone').map((event) => event.reverts_event_id));
  return events.filter((event) => DONE_TYPES.has(event.event_type) && !reverted.has(event.id));
}

// 완료가 처리된 공간 날짜 (payload 에 기록, 없으면 기록 시각의 UTC 날짜)
// Space-local date of the completion (stored in payload; falls back to the UTC date of recorded_at)
function completionDate(event: EventWithReactions): string {
  return getString(asRecord(event.payload), 'resolved_local_date') ?? event.recorded_at.slice(0, 10);
}

export function computeStats(
  events: EventWithReactions[],
  today: string,
  userId: string,
  windowDays: number,
  timeZone: string,
): SpaceStats {
  const completions = validCompletions(events);
  const week: DayCount[] = Array.from({ length: windowDays }, (_, index) => ({
    date: addDays(today, index - (windowDays - 1)),
    count: 0,
  }));
  const byDate = new Map(week.map((day) => [day.date, day]));
  for (const event of completions) {
    const day = byDate.get(completionDate(event));
    if (day) day.count += 1;
  }

  const todayCompletions = completions.filter((event) => completionDate(event) === today);
  // 요청·반응에는 공간 날짜가 없어 기록 시각을 공간 시간대 날짜로 변환해 비교
  // Requests/reactions carry no space date, so convert their timestamps to the space time zone
  const todayRequests = events.filter(
    (event) => event.event_type === 'help_requested' && localDateIn(event.recorded_at, timeZone) === today,
  ).length;
  const todayReactions = completions
    .flatMap((event) => event.reactions)
    .filter((reaction) => localDateIn(reaction.created_at, timeZone) === today).length;

  // 나의 기록도 같은 7일 창 안에서만 센다
  // My record also counts only within the same window
  const myCompletions = completions.filter((event) => event.performer_id === userId && byDate.has(completionDate(event)));
  return {
    week,
    today: { done: todayCompletions.length, requests: todayRequests, reactions: todayReactions },
    mine: {
      done: myCompletions.length,
      reactionsReceived: myCompletions.reduce((sum, event) => sum + event.reactions.length, 0),
      helped: events.filter(
        (event) =>
          event.event_type === 'help_accepted' && event.actor_id === userId && byDate.has(localDateIn(event.recorded_at, timeZone)),
      ).length,
    },
  };
}
