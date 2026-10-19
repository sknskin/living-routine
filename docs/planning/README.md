# 생활 루틴·공동생활 앱 — 통합 기획 패키지

> 상태: **개발 착수 전 기획 초안** | 기준일: 2026-10-19 | 개발·Git·외부 서비스 변경 미실행

## 이 패키지를 읽는 순서

1. `docs/00-decision-register.md`: **최우선 판정 기준**. 직접 확정 / 권장 초안 / 보류 / MVP 제외 구분.
2. `docs/01-product-prd.md`: 서비스 정의, 사용자, MVP 기능 및 성공 지표.
3. `docs/02-user-flows-ux.md` + `docs/03-design-system.md`: 사용자 흐름과 모바일 디자인.
4. `docs/04-architecture.md` + `docs/05-data-model-security.md` + `docs/06-routine-engine.md`: 시스템 설계.
5. `docs/07-notifications-sync.md` + `docs/08-privacy-operations.md`: 알림, 개인정보, 백업.
6. `docs/09-test-plan.md` + `docs/10-roadmap.md`: 검증 및 실행 계획.
7. `agents/MASTER-ORCHESTRATOR.md`: **ELDO Prompt를 계승한 Claude/Codex 공통 운영 마스터 프롬프트**.
8. `agents/CLAUDE.md`, `agents/AGENTS.md`, `tasks/TASK-TEMPLATE.md`: CLI별 엔트리 및 작업 프롬프트 템플릿.

## 사용 시 주의

- 문서 안의 `확정`은 대화에서 직접 확정된 정책이며, `권장 초안`은 사용자가 일괄 권장 진행을 허용한 후 마련된 검토 가능한 기본값이다.
- **오프라인 데이터 변경 지원 여부는 미확정**. 자동 구현 금지. 온라인 MVP 가정은 임시 의존성 처리이며 오프라인 불가 정책을 영구 확정한 것이 아니다.
- 현재는 코드 생성·DB 연결·Slack 발송·저장소 수정 및 개발 착수 지시가 아님. 별도의 명시적인 착수 승인 필요.
- 실제 사용 가능한 모델, CLI/에이전트 기능, Supabase 가격·제약, 스토어 정책은 착수 시 재검증.
- 원본 참고: 사용자 제공 2개 기획 이미지, 2026-10-18 생활 루틴 관련 카카오톡 대화, 1~28단계 기획 합의, 제공된 ELDO 멀티 에이전트 프롬프트. 외부 Notion 백로그는 **검증·반영하지 않음**.
- 프로젝트명은 확정하지 않았으므로 임시 식별자 `living-routine` 사용.
