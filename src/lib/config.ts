// 앱 전역 설정 상수
// App-wide configuration constants

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

// 새 공간의 기본 시간대
// Default time zone for new spaces
export const DEFAULT_TIMEZONE = 'Asia/Seoul';

// 홈/캘린더 조회 범위(일)
// Query ranges for home/calendar in days
export const HOME_LOOKAHEAD_DAYS = 7;
export const OVERDUE_LOOKBACK_DAYS = 60;
export const TIMELINE_PAGE_SIZE = 30;
// 통계 계산용 최대 이벤트 수
// Max events loaded for stats
export const STATS_EVENT_LIMIT = 500;
// 통계 기간(일)
// Stats window in days
export const STATS_WINDOW_DAYS = 7;
// 홈 최근 활동 개수
// Recent activity count on home
export const RECENT_ACTIVITY_COUNT = 3;

// 루틴 편집 미리보기 개수
// Number of dates shown in the routine editor preview
export const PREVIEW_COUNT = 5;

// 입력 길이 제한 (DB 제약과 동일)
// Input length limits (mirror DB constraints)
export const MAX_SPACE_NAME = 40;
export const MAX_ROUTINE_TITLE = 40;
export const MAX_NICKNAME = 30;
export const MAX_MESSAGE = 100;
export const MIN_PASSWORD = 6;

// 서버 데이터 캐시 신선도(ms)
// Server data cache freshness in ms
export const QUERY_STALE_MS = 30_000;

// 선택 공간 저장 키
// Storage key for the selected space
export const SELECTED_SPACE_STORAGE_KEY = 'living-routine.selected-space';
