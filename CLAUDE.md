# living-routine — Claude Code 프로젝트 지침

> `docs/planning/agents/CLAUDE.md` 템플릿을 이 저장소에 맞게 병합한 파일.
> 공통 운영 규칙은 `docs/planning/agents/MASTER-ORCHESTRATOR.md`, Expo 작업 규칙은 `AGENTS.md`를 함께 따른다.

## 권위 순서

사용자 최신 직접 지시 > `docs/planning/docs/00-decision-register.md` > PRD·기술 문서 > 코드/공식 문서.

## 읽기 순서

1. `docs/planning/README.md` → `docs/planning/docs/00-decision-register.md` → 관련 기능 문서 → `docs/planning/agents/MASTER-ORCHESTRATOR.md`.
2. 작업 명세는 `docs/planning/tasks/TASK-TEMPLATE.md` 기준.

## 규칙

1. `USER-CONFIRMED` 변경 금지. `RECOMMENDED-DRAFT`는 검증 가능한 기본값. `ON-HOLD` 오프라인 쓰기(O01/FR-16) 임의 구현 금지. `POST-MVP` 기능 임의 추가 금지.
2. 실제 사용 가능한 에이전트·모델·권한을 확인한 뒤 독립 작업만 병렬화. DB 마이그레이션·루틴 엔진·공통 타입은 단일 변경 소유자.
3. 기능 단위로 DB·서버·UI·테스트 완성, `docs/planning/docs/09-test-plan.md`의 테스트 ID에 검증 근거 연결.
4. 사용자 승인 없는 Git 커밋/푸시·DB·외부 서비스 변경 금지.
5. 실제 실행 결과만 완료 보고. 실기기 접근 없으면 실기기 검증 완료로 표시하지 않는다.
6. Slack 접근/채널은 실제 확인 시에만 사용.

## 계정 정책

- GitHub/Git은 개인 계정(`sknskin`)만 사용. 회사 계정은 이 저장소에서 절대 사용 금지.
- 이 저장소는 로컬 설정으로 `sknskin` 인증·커밋 이메일을 쓴다 (전역 활성 gh 계정은 바꾸지 않음). Git 작업 전 `git config --local --list` 로 확인한다.

## 진행 상태

- 착수 승인 범위: C00 기반 승인 후 **전체 사이클 진행·권장안 적용** 승인 (2026-10-19).
- 현재 상태·차단 항목: `docs/STATUS.md`.
