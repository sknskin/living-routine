# 클라우드 Supabase 연결 계획 (분석·검토)

> 작성 2026-10-19 · 상태: **계획 (미실행)** · 실행에는 사용자 개인 Supabase 계정 로그인과 프로젝트 생성 승인이 필요
> 근거: 기획 `docs/planning/docs/04-architecture.md`(환경 구분), `08-privacy-operations.md`(환경 분리·백업), `00-decision-register.md`(D11, D14, D24, D25, O02, O04) + Supabase 공식 문서(하단 출처) + 현재 코드 대조

## 1. 현재 상태 (확인된 사실)

| 항목 | 상태 | 확인 방법 |
|---|---|---|
| 개발 DB | 로컬 Supabase(Docker)만 사용, 마이그레이션 13개·pgTAP 127개 통과 | `npx supabase test db` |
| Supabase CLI 로그인 | **로그인 안 됨** (회사 계정 포함 어떤 계정도 연결되지 않음) | `npx supabase orgs list` → AccessTokenRequiredError |
| 앱 연결 설정 | `.env.local` 의 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Git 제외) | `.gitignore` |
| 비밀 키 | 앱·저장소에 secret/service_role 키 없음 | 커밋 전 스캔 |

## 2. 공식 문서로 확인한 제약 (Free 플랜 기준)

| 주제 | 내용 | 이 프로젝트 영향 |
|---|---|---|
| 프로젝트 수 | 무료 프로젝트 2개 (일시중지된 프로젝트는 제외) | 기획의 dev / internal-test 2개 분리(04·08)와 정확히 일치 |
| 일시중지 | 활동이 적으면 1주 후 일시중지 가능, 90일 내 대시보드에서 복구 | 베타(약 2주) 동안은 사용으로 유지. 베타 전후 휴면 시 복구 절차 필요 |
| DB 크기 | 프로젝트당 500MB, 초과 시 읽기 전용 (월 평균 기준) | 4~8명 베타 규모에서는 여유. 알림 아웃박스 누적은 주기적 정리 대상(후속) |
| 백업 | Free 는 자동 백업 없음·다운로드 불가 (Pro: 일 백업 7일 보존) | D24 백업은 **자체 스크립트**(`scripts/backup/db-backup.sh`, `SUPABASE_DB_URL` 지원)로 수행. O04 의 "Free 백업 범위" 확인 결과: 플랫폼 백업 없음 |
| Auth 이메일 | 기본 메일 발송은 테스트용, **시간당 2통**, **조직 구성원 주소로만 발송** | 베타 참가자에게 가입 인증 메일이 가지 않음 → **결정 필요(§5-1)** |
| 이메일 인증 | 호스팅 프로젝트는 "Confirm email" 기본 켜짐 → 가입 직후 세션 없음 | 현재 앱은 가입 후 세션 없이 홈으로 이동(`src/app/sign-in.tsx`) → **코드 수정 필요(§4)** |
| 이메일 템플릿 | 2026-06-03 이후 생성된 Free 프로젝트는 기본 메일 사용 시 템플릿 수정 불가(커스텀 SMTP 시 가능) | 한국어 인증 메일은 커스텀 SMTP 필요 |
| Realtime | 동시 연결 200, 월 메시지 200만, 초당 100 | 베타 규모로 충분 |
| pg_cron | 호스팅에서 지원, 대시보드 또는 `create extension` 으로 활성화 | 마이그레이션 `000600` 이 활성화. 적용 시 dry-run 으로 확인 |
| API 키 | 신규 publishable(`sb_publishable_`)/secret(`sb_secret_`) 키, 기존 anon/service_role 은 2026년 말 폐기 예정 | 앱은 이미 publishable 키 변수명 사용. secret 키는 앱·저장소 금지(D25) |
| 계정 삭제 | `auth.users` 삭제 시 리프레시 토큰은 무효화되나 **액세스 토큰은 만료까지 유효** | 이미 `require_user()` 가 삭제된 프로필 차단(리뷰 M1 반영). Storage 미사용이라 삭제 차단 요인 없음 |
| 마이그레이션 | `supabase link` → `supabase db push --dry-run` → `db push`, 원격 대시보드에서 직접 스키마 변경 금지 | 스키마 변경은 항상 마이그레이션 파일로만 (단일 소유자 원칙) |

## 3. 목표 구성

| 환경 | Supabase 프로젝트 | 용도 | 비고 |
|---|---|---|---|
| local | Docker (현재) | 개발·자동 테스트 | pgTAP·동시성 실측은 local 에서만 실행 |
| dev | `living-routine-dev` (Free) | 개발자 실연동 확인 | 테스트 데이터 자유 |
| internal-test | `living-routine-beta` (Free) | 4~8명 내부 베타 | 실제 사용자 데이터 → 08 개인정보 정책 적용 |

- 리전: 사용자 위치 기준 **서울(Northeast Asia) 우선**, 생성 화면에서 제공 여부 확인.
- DB 비밀번호: 생성 시 발급 → 사용자 비밀번호 관리자에 보관, 저장소·채팅에 남기지 않음.
- 소유 계정: **개인 Supabase 계정**(회사 계정 금지). 로그인은 사용자가 직접 `! npx supabase login`.

## 4. 연결 전 필요한 코드 변경 (현재 코드 대조 결과)

| # | 내용 | 근거 |
|---|---|---|
| C1 | 가입 후 세션이 없으면(이메일 인증 대기) "메일을 확인해 주세요" 안내, 로그인 화면 유지 | `sign-in.tsx` 가 세션 유무와 관계없이 이동 / 호스팅 기본 Confirm email |
| C2 | 비밀번호 재설정(메일 링크) 흐름 추가 | 클라우드 사용자에게 필수, 현재 없음 |
| C3 | 인증 링크 복귀 주소: 웹(`http://localhost:8081`, 배포 주소) + 앱 스킴(`livingroutine://`) 을 원격 Auth URL 설정에 등록 | `config.toml` 의 `site_url` 은 로컬 전용 |
| C4 | 환경별 `.env` 전환 안내 (local / dev / beta), 키는 publishable 만 | D25 |

## 5. 사용자 결정 필요

1. **가입 인증 메일 방식** (Free 기본 메일은 조직 구성원에게만 발송)
   - (권장) 커스텀 SMTP 연결 (Resend·SendGrid 등, 별도 계정 필요) → 인증 메일 정상 발송, 한국어 템플릿 가능
   - 내부 베타 한정으로 "Confirm email" 끄기 → 즉시 사용 가능하나 이메일 소유 확인 없음(보안 저하, 베타 후 재활성화 필요)
2. **프로젝트 생성 승인**: Free 플랜 2개(dev, beta). 유료 전환은 하지 않음(D25 "유료 변경 승인").
3. **소셜 로그인(O02)**: 클라우드 연결과 별개. 결정 전까지 이메일 로그인 유지.

## 6. 실행 순서 (승인 후)

1. 사용자: `! npx supabase login` (개인 계정, 브라우저 인증) → 조직 이름 확인
2. dev 프로젝트 생성(서울) → `npx supabase link --project-ref <dev-ref>`
3. `npx supabase db push --dry-run` 으로 적용 목록 확인 → `npx supabase db push`
4. 원격 확인: 확장(pgcrypto, pg_cron) 활성, cron 작업 3개 등록, RLS·함수 권한(anon 실행 불가) 조회
5. Auth 설정: Site URL·Redirect URLs(C3), 인증 메일 방식(§5-1)
6. 앱 `.env.local` 을 dev 로 전환 → 웹에서 가입·공간·완료·초대 흐름 확인 (자동 테스트는 local 에서만)
7. 백업 확인: `SUPABASE_DB_URL=<dev> BACKUP_PASSPHRASE=... npm run db:backup` → `db:restore-check`(로컬 격리 복원)
8. beta 프로젝트에 2~7 반복, 베타 참가자 안내 문서 작성
9. 결과를 `docs/STATUS.md` 에 기록 (실행하지 않은 검증은 미검증으로 표시)

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 회사 계정으로 잘못 로그인 | 로그인 직후 `npx supabase orgs list` 로 조직 확인, 회사 조직이면 중단 |
| 원격 대시보드에서 직접 스키마 수정 → `db push` 불일치 | 대시보드 SQL 편집 금지, 변경은 마이그레이션만 |
| 테스트 데이터가 beta 에 섞임 | 자동 테스트·동시성 스크립트는 local 전용(스크립트가 비로컬 URL 거부) |
| Free 일시중지로 베타 중단 | 베타 기간 사용 유지, 중단 시 대시보드 복구(90일 이내) |
| 백업 부재 | 자체 암호화 백업 + 월 1회 격리 복원 테스트(D24) |

## 출처

- [Pricing](https://supabase.com/pricing) · [About billing](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Database size](https://supabase.com/docs/guides/platform/database-size) · [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [Email template change (free tier)](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords) · [signUp reference](https://supabase.com/docs/reference/javascript/auth-signup) · [User management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Cron install](https://supabase.com/docs/guides/cron/install) · [Extensions](https://supabase.com/docs/guides/database/extensions)
- [Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) · [db push](https://supabase.com/docs/reference/cli/supabase-db-push) · [link](https://supabase.com/docs/reference/cli/supabase-link)
