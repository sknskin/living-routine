# 기술 아키텍처 및 API 계약 초안

## 확정된 기술과 미확정 선택

- 확정: React Native + Expo, Supabase(PostgreSQL·Auth·Realtime), 무료 개발+내부 베타 선행.
- 제안: TypeScript, Expo Router, TanStack Query, 필요할 때만 Zustand, Supabase Edge Functions + DB 함수/트랜잭션, 예약 Cron, Expo Push Service.
- 소셜 로그인 공급자, 상태 관리 라이브러리, 빌드 서비스·패키지 버전은 착수 시 환경 검증 및 최종 선택. 제공되지 않은 자격증명·외부 서비스를 임의 생성하지 않음.

## 논리 구성

`Mobile App → Supabase Auth/RLS → PostgreSQL (공간/루틴/회차/이벤트)`; 중요 변경은 `서버 함수 + DB 트랜잭션` 경유. `Realtime`은 무효화 이벤트/화면 갱신, `Scheduled Job → Notification Outbox → Expo Push → APNs/FCM`은 알림 전달 경로.

원천 정합성은 DB, 앱 캐시는 파생 뷰, 푸시는 보조 전달. 실시간 이벤트 수신 실패가 데이터 상태를 변경하지 않음.

## 주요 명령 계약(서버 검증 필수)

REST 경로는 예시일 뿐 최종 채택하지 않음. 실제 구현은 Supabase RPC/Edge Functions 등을 이용할 수 있다.

| 명령 ID | 입력(핵심) | 성공 결과 | 검증 |
|---|---|---|---|
| CMD-01 `createSpace` | 이름, timezone | space_id | 로그인·이름 유효성 |
| CMD-02 `acceptInvite` | token | membership | 토큰 만료/상태/권한/중복 |
| CMD-03 `upsertRoutine` | space, rule, assignee, expected_version | routine, version | 공간 멤버·룰 유효성·버전 |
| CMD-04 `completeOccurrence` | occurrence, actor, request_id, expected_version | 완료 기록+다음 회차 | 회차 잠금·수행자·중복·권한 |
| CMD-05 `undoCompletion` | completion_event, request_id | 취소 결과/충돌 상태 | 후속 의존성·정정 권한 |
| CMD-06 `skipOccurrence` | occurrence, request_id | 건너뛰기+다음 회차 | 상태 전이·주기 재계산 |
| CMD-07 `requestHelp` | occurrence, recipient | request | 요청 가능/본인/공간 권한 |
| CMD-08 `respondHelp` | request, accept/decline | 담당 변경/거절 | 대상자만 응답·경합 방지 |
| CMD-09 `sendReaction` | event, reaction, optional text | reaction | 같은 공간·콘텐츠 정책 |
| CMD-10 `leaveSpace` | space, expected_version | 탈퇴 | 마지막 관리자 권한 이전 정책 |
| CMD-11 `requestAccountDeletion` | user | job/status | 재인증·보존/익명화·삭제 검증 |

모든 중요 쓰기 명령에는 고유 request_id(멱등성)와 서버 권한 확인을 사용. 클라이언트의 멤버·담당 정보를 그대로 신뢰하지 않는다. RLS는 기본 방어선이며 복합 업무 상태 변경은 서버 함수/제약으로 검증.

## 오류 모델

`UNAUTHORIZED`, `NOT_MEMBER`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT_VERSION`, `ALREADY_RESOLVED`, `INVITE_EXPIRED`, `RATE_LIMITED`, `TEMPORARY_FAILURE`, `POLICY_UNDECIDED`. UI에 사용자 중심 안내 및 안전한 재조회 제공.

## 환경 구분

`local/dev`와 `internal-test` 분리. 분리된 DB/인증/푸시 자격증명과 마이그레이션. 무료 티어 허용량·비용은 착수 시 공식 문서 확인. Supabase 변경은 별도의 마이그레이션 소유자를 두고 운영·테스트 DB를 교차 사용하지 않는다.

## 오프라인

**ON-HOLD**: 앱 캐시 읽기·재연결 새로고침 등 정상 UI 설계는 가능하나 서버에 연결되지 않은 상태의 쓰기 큐/완료 확정 정책을 구현하지 않는다. 핵심 변경 버튼의 네트워크 오류 UX는 최소 제안으로 두고 오프라인 지원 최종 승인 전 정책 변경 금지.
