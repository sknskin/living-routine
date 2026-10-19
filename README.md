# living-routine (가칭)

혼자 또는 함께 사는 사람들의 생활 루틴·분담·알림을 가볍게 관리하는 모바일 앱. 최종 앱 이름은 미정(O06).

- 기획 문서: [`docs/planning/`](docs/planning/README.md) — 판정 기준은 `docs/planning/docs/00-decision-register.md`
- 진행 상태·테스트 근거·차단 항목: [`docs/STATUS.md`](docs/STATUS.md)
- 잔여 과제·다음 세션 인수인계: [`docs/NEXT-STEPS.md`](docs/NEXT-STEPS.md)
- 클라우드 Supabase 연결 계획: [`docs/CLOUD-SUPABASE-PLAN.md`](docs/CLOUD-SUPABASE-PLAN.md)
- 스택: React Native + Expo SDK 58 (Expo Router, TypeScript) / Supabase (PostgreSQL·Auth·Realtime·pg_cron)

## 로컬에서 실행하기

필요: Node 22+, Docker Desktop(또는 colima).

```bash
npm install
npx supabase start            # 로컬 Supabase (DB·Auth·Realtime) — 첫 실행은 이미지 다운로드
cp .env.example .env.local    # EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 에 `npx supabase status` 의 Publishable key 입력
npm run web                   # http://localhost:8081
```

- 첫 화면에서 **가입하기** → 닉네임 입력 → 공간 만들기 → 추천 루틴 선택 → 홈.
- 두 번째 계정으로 함께 쓰기: 공간 메뉴 → 공간 관리·초대 → 초대 코드 생성 → 다른 브라우저(또는 로그아웃 후 다른 계정)에서 **초대 코드로 참여**.
- 로컬 Supabase Studio: http://127.0.0.1:54323 · 로컬 메일함: http://127.0.0.1:54324
- 화면 변경이 반영되지 않으면 `npx expo start --web --clear` 로 다시 시작 (watchman 미설치 시 파일 감지가 누락될 수 있음).
- iOS/Android: `npm run ios` / `npm run android` (Expo Go 또는 시뮬레이터). 기기에서 접속하려면 `.env.local` 의 URL 을 PC 의 LAN IP 로 바꿔야 함.

## 검증 명령

```bash
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit
npm test                    # Jest 단위 테스트
npm run db:test             # pgTAP DB 테스트 (로컬 Supabase 필요)
npm run check:concurrency   # T01 동시 완료 실측 (로컬 Supabase 필요)
node scripts/contrast-check.mjs   # 디자인 토큰 WCAG 대비 실측
BACKUP_PASSPHRASE=... npm run db:backup                     # 암호화 백업 (저장소 밖 ~/living-routine-backups)
BACKUP_PASSPHRASE=... npm run db:restore-check -- <백업파일>   # 격리 DB 복원 후 행 수 비교
```

## 구조

```
src/app/            Expo Router 화면 (sign-in, (app)/(tabs)/home|calendar|routines|history, 상세 화면)
src/components/     UI 컴포넌트 (ui/ 기본 요소, routine-row, timeline-event …)
src/lib/            Supabase 클라이언트, API(queries/commands), 날짜·폼·라벨 순수 로직
src/providers/      Auth / Query / Space 컨텍스트
supabase/migrations 스키마·RLS·루틴 엔진·명령 RPC·알림·계정/운영
supabase/tests      pgTAP 테스트
scripts/            동시성 실측, 백업/복원 검증
```

## 원칙

- 모든 중요 쓰기는 서버 RPC(권한 확인 + 행 잠금 + 멱등 request_id). 클라이언트 직접 쓰기는 RLS/권한으로 차단.
- 서비스 역할(secret) 키는 앱·저장소에 넣지 않는다. `.env.local` 은 Git 제외.
- 오프라인 쓰기(O01)는 정책 결정 전까지 구현하지 않는다.
