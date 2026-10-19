# Codex CLI 작업용 프로젝트 지침 템플릿

> 개발 착수 승인 후 기존 저장소 루트 `AGENTS.md`와 병합하는 예시. 현재 상태에서는 이 파일을 기존 프로젝트에 설치하거나 자동 실행하지 않는다.

- 권위: 사용자 최신 직접 결정 > `docs/00-decision-register.md` > PRD·기술 문서 > 코드/공식 문서.
- 공통 운영 규칙: `agents/MASTER-ORCHESTRATOR.md`.
- CLI/OS/브랜치/모델/병렬 도구를 실제 확인하며 구현 가능하다고 가정하지 않는다.
- 현재 확정 플랫폼: React Native + Expo / Supabase. 기존 ELDO Windows 공유 DB 운영 설정을 복사하지 않는다.
- `ON-HOLD` 오프라인 데이터 변경 정책을 구현하지 않는다. `POST-MVP` 커머스·결제를 자동 추가하지 않는다.
- Git working tree 보존; 강제 삭제/리셋/force push 금지. DB migration은 단일 소유자·검증 게이트.
- 구현은 수직 기능 슬라이스, 독립 검증, 모바일 실기기 테스트 여부 별도 보고.
- Slack 전송·DB 변경·유료 배포 등 외부 영향 작업은 연결과 사용자 권한/승인을 확인한다.
- Task 명세는 `tasks/TASK-TEMPLATE.md`을 따른다.
