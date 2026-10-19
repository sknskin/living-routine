// 서버 오류 코드 → 사용자 안내 문구
// Server error codes → user-facing messages
// 근거: docs/planning/docs/04-architecture.md 오류 모델
// Source: error model in docs/planning/docs/04-architecture.md

export const APP_ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_MEMBER',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'CONFLICT_VERSION',
  'ALREADY_RESOLVED',
  'INVITE_EXPIRED',
  'INVITE_INVALID',
  'LAST_ADMIN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'TEMPORARY_FAILURE',
  'POLICY_UNDECIDED',
  'REAUTH_REQUIRED',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHORIZED: '로그인이 필요해요.',
  NOT_MEMBER: '이 공간의 구성원이 아니에요.',
  FORBIDDEN: '이 작업을 할 권한이 없어요.',
  VALIDATION_ERROR: '입력 내용을 다시 확인해 주세요.',
  CONFLICT_VERSION: '다른 변경이 먼저 반영되었어요. 최신 내용을 확인해 주세요.',
  ALREADY_RESOLVED: '이미 처리된 항목이에요. 최신 상태로 새로고침했어요.',
  INVITE_EXPIRED: '초대가 만료되었어요. 새 초대를 요청해 주세요.',
  INVITE_INVALID: '사용할 수 없는 초대 코드예요.',
  LAST_ADMIN: '마지막 관리자는 다른 구성원에게 관리자 권한을 넘긴 뒤 나갈 수 있어요.',
  NOT_FOUND: '항목을 찾을 수 없어요.',
  RATE_LIMITED: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
  TEMPORARY_FAILURE: '일시적인 문제가 생겼어요. 다시 시도해 주세요.',
  POLICY_UNDECIDED: '아직 지원하지 않는 기능이에요.',
  REAUTH_REQUIRED: '보안을 위해 비밀번호를 다시 확인해 주세요.',
};

// 서버 확정 실패를 나타내는 앱 오류
// App error representing a server-side rejection
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail: string | null;

  constructor(code: AppErrorCode, detail: string | null) {
    super(MESSAGES[code]);
    this.code = code;
    this.detail = detail;
  }
}

function isAppErrorCode(value: string): value is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(value);
}

// 'CODE: detail' 형식의 서버 메시지를 AppError 로 변환. 네트워크 오류는 TEMPORARY_FAILURE.
// Convert 'CODE: detail' server messages to AppError; network errors become TEMPORARY_FAILURE.
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error
    ? String((error as { message: unknown }).message)
    : String(error);
  const [head, ...rest] = message.split(':');
  const code = head.trim();
  if (isAppErrorCode(code)) {
    return new AppError(code, rest.join(':').trim() || null);
  }
  return new AppError('TEMPORARY_FAILURE', message);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
