// 루틴 모드·규칙·이벤트의 표시 문구
// Display labels for routine modes, rules and events
import { weekdayLabel } from '@/lib/dates';
import type { AssignmentMode, ReactionType, RoutineEventType, RoutineMode, RoutineRule } from '@/types/domain';

// 모든 달에 존재하는 마지막 날짜
// Last day number that exists in every month
const SHORTEST_MONTH_DAYS = 28;

export const MODE_LABEL: Record<RoutineMode, string> = {
  fixed: '정해진 날',
  after_resolution: '완료 후 주기',
  manual: '필요할 때',
};

export const MODE_DESCRIPTION: Record<RoutineMode, string> = {
  fixed: '달력 날짜·요일 기준으로 반복해요. 지난 회차가 남아 있어도 다음 회차가 생겨요.',
  after_resolution: '마지막으로 완료(또는 건너뛴) 날부터 다시 세요.',
  manual: '필요할 때 실행해요. 하루에 여러 번도 기록할 수 있어요.',
};

export const ASSIGNMENT_LABEL: Record<AssignmentMode, string> = {
  fixed: '고정 담당',
  rotate: '돌아가며',
  free: '누구나',
};

// 참고 이미지의 응답 옵션 (강제·평가가 아닌 가벼운 인정 표현)
// Response options from the reference images (light acknowledgement, never forced or rated)
export const REACTION_LABEL: Record<ReactionType, string> = {
  thanks: '👍 고마워요',
  relieved: '🙌 덕분에 편해졌어요',
  cheer: '💛 수고했어요',
  ack: '😊 확인했어요',
  great: '✨ 짱이에요',
};

export const REACTION_ORDER: ReactionType[] = ['thanks', 'relieved', 'cheer', 'ack', 'great'];

export function ruleSummary(mode: RoutineMode, rule: RoutineRule): string {
  const time = rule.time ? ` · ${rule.time} 알림` : '';
  if (mode === 'manual') {
    return `필요할 때${time}`;
  }
  if (mode === 'after_resolution') {
    return `완료 후 ${rule.interval_days ?? '?'}일마다${time}`;
  }
  const interval = rule.interval ?? 1;
  if (rule.freq === 'daily') {
    return `${interval === 1 ? '매일' : `${interval}일마다`}${time}`;
  }
  if (rule.freq === 'weekly') {
    const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b).map(weekdayLabel).join('·');
    return `${interval === 1 ? '매주' : `${interval}주마다`} ${days}${time}`;
  }
  if (rule.freq === 'monthly') {
    const clampNote = (rule.day ?? 0) > SHORTEST_MONTH_DAYS ? ' (없는 날은 말일)' : '';
    return `${interval === 1 ? '매월' : `${interval}개월마다`} ${rule.day}일${clampNote}${time}`;
  }
  return '규칙 없음';
}

export function eventVerb(type: RoutineEventType): string {
  switch (type) {
    case 'completed':
      return '완료했어요';
    case 'manual_run':
      return '했어요';
    case 'skipped':
      return '이번 회차를 건너뛰었어요';
    case 'undone':
      return '기록을 취소했어요';
    case 'help_requested':
      return '도움을 요청했어요';
    case 'help_accepted':
      return '도움 요청을 수락했어요';
    case 'help_declined':
      return '도움 요청을 거절했어요';
    case 'rescheduled':
      return '이번 회차를 변경했어요';
    case 'correction_requested':
      return '기록 정정을 요청했어요';
    default:
      return '';
  }
}

// 반복 방식 + 규칙 요약 (수동은 같은 말이 반복되지 않게 규칙 요약만)
// Mode + rule summary (manual shows only the summary to avoid repeating "필요할 때")
export function routineDescription(mode: RoutineMode, rule: RoutineRule): string {
  return mode === 'manual' ? ruleSummary(mode, rule) : `${MODE_LABEL[mode]} · ${ruleSummary(mode, rule)}`;
}
