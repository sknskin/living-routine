# 데이터 모델·관계 및 공간 격리

## DB 원칙

공간 ID를 공유 데이터의 소유 경계로 사용한다. `routines`(템플릿 정의)와 `routine_occurrences`(실제 예정/실행 회차)를 분리한다. 실제 수행자, 원래 담당자, 완료 등록자를 구분한다. 과거 이력은 불변 이벤트에 가깝게 저장하며 수정/취소는 새 이벤트로 남긴다. 날짜 규칙은 공간 IANA 시간대, 사건 시각은 UTC.

## 논리 테이블

| 테이블 | 주요 열(제안) | 제약/관계 |
|---|---|---|
| `profiles` | user_id, nickname, deleted_at | auth.users와 1:1 식별자 |
| `spaces` | id, name, timezone, archived_at, version | 시간대 필수 |
| `space_members` | space_id, user_id, role, joined_at, left_at | 활성 멤버 중복 방지 |
| `space_invitations` | id, space_id, token_hash, expires_at, revoked_at, created_by | 원시 초대토큰 평문 DB 저장 금지 |
| `routine_templates` | id, category, title, suggested_rule | 앱 추천값, 사용자의 실제 루틴과 분리 |
| `routines` | id, space_id, title, mode, rule_version, archived_at, version | FK 공간, 주기 검사 |
| `routine_rules` | routine_id, version, rule_json, effective_after | 규칙 변경 이력 |
| `routine_assignees` | routine_id, member_id, sequence_order, assignment_mode | 공간 멤버만 배정 가능 |
| `routine_occurrences` | id, space_id, routine_id, rule_version, due_local_date, due_at, assigned_user_id, status, custom_override, version | 회차 고유성 및 상태 검증 |
| `routine_events` | id, occurrence_id, event_type, actor_id, performer_id, original_assignee_id, recorded_at, request_id, payload | 멱등·감사 근거 |
| `help_requests` | id, occurrence_id, requester_id, recipient_id, status, responded_at | 수락/거절 경합 제어 |
| `reactions` | id, event_id, author_id, type, message, removed_at | 같은 공간 접근 제한 |
| `notification_preferences` | user_id, summary_time, quiet_start, quiet_end, tz | 개인 단위 |
| `space_notification_settings` | user_id, space_id, enabled | 개인·공간 복합 유일 |
| `push_devices` | id, user_id, platform, token, enabled, invalidated_at | 기기별 제어 |
| `notification_outbox` | id, logical_event_key, recipient_id, status, retry_at, expires_at | 알림 멱등·전송 추적 |
| `deletion_requests` | id, user_id, status, requested_at, completed_at | 법적 처리/복원 후 재삭제 관리; 민감 내용 제한 |

**개념 모델**: 실제 인덱스·파티션·열 자료형·FK nullable 전략·삭제 CASCADE 여부 등은 명세 검증 후 마이그레이션에서 확정. 위 열을 그대로 무비판적으로 SQL 생성하지 말 것.

## 접근 제어 매트릭스

| 주체 | 읽기 | 루틴 수정 | 구성원 관리 | 개인 알림 | 타인 완료 이력 수정 |
|---|---|---|---|---|---|
| 비회원 | 없음 | 없음 | 없음 | 없음 | 없음 |
| 해당 공간 일반 구성원 | 해당 공간 | 허용 | 탈퇴만 | 본인만 | 직접 수정 불허(정정 요청) |
| 해당 공간 관리자 | 해당 공간 | 허용 | 초대/내보내기/권한 이전 | 본인만 | 일반 구성원과 동일 |
| 다른 공간 회원 | 접근 불가 | 불가 | 불가 | 해당 없음 | 불가 |

RLS로 공간 멤버십 기반 조회/수정 제한. `space_members` 본인 role 상승 불가. Supabase 서비스 역할 키·관리 자격증명은 앱 번들 금지. 서명/토큰 확인·서버 재검증. 정지/탈퇴 구성원 실시간 재연결 권한도 검증.

## 개인정보 및 삭제 충돌

루틴의 소프트 삭제는 UI 복원 목적이며 계정 삭제의 개인정보 영구 삭제 요구를 대체하지 않는다. 공동 기록 보존은 자동적으로 '익명'이 되는 것이 아니다. 2인 공간에서 비식별 이름으로도 재식별 가능하다. 데이터별 처리·법적 근거·삭제 시점·백업 재삭제를 별도 테스트한다.

## 조회

활동 타임라인은 `routine_events`와 `reactions` 등을 읽기 모델로 합성; 원천 이벤트를 중복 저장하지 않는다. 캘린더의 '원래 예정일'과 '실제 완료일'은 독립 필드로 유지.
