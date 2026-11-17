# 관리자 운영 대시보드 구현 계획 (#590)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 화면의 에러·FPS를 1분 요약으로 Supabase 에 쌓고, 팀원만 여는 설정 → 관리자 탭 → 넓은 대시보드에서 보고, 에러마다 진단표 설명과 AI 프롬프트를 준다.

**Architecture:** 화면은 `src/ops/` 한 폴더에 모은다. 순수 로직(`opsLogic.ts`, `diagnosis.ts`)이 정리·판정을 맡고, 수집기(`collector.ts`)가 메모리에 모으고, 보내기(`telemetry.ts`)가 1분마다 `ops_report` 를 부른다. Supabase 요청 감시(`opsFetch.ts`)는 `createClient` 의 `global.fetch` 로, FPS 는 장면마다 붙이는 `OpsFpsProbe` 로 잡는다. DB 는 테이블 2개를 RLS 로 잠그고 security definer 함수 2개(`ops_report`, `ops_dashboard`)로만 넣고 읽는다.

**Tech Stack:** TypeScript, React 19, React Three Fiber, supabase-js 2, PostgreSQL(Supabase, pg_cron), SVG(그래프, 라이브러리 없음)

**Spec:** `docs/superpowers/specs/2026-11-17-ops-dashboard-design.md`

## Global Constraints

- 웹캠 영상·트래킹 수치·요청/응답 본문·입력한 글은 보내지 않는다. DB 에러는 번호와 메시지 앞부분만, 입력값이 들어가는 부분은 지운다.
- 로그인 전(세션 없음)에 모인 기록은 보내지 않고 버린다. 게스트는 로그인으로 친다.
- 새 npm 의존성을 추가하지 않는다. 그래프는 SVG 로 직접 그린다.
- `src/space/`, `src/tracking/`, `src/focus/`, `src/App.tsx` 는 고치지 않는다. 예외: `BranchScene.tsx` 한 줄.
- 기준값은 `src/ops/opsLogic.ts` 위쪽 이름 붙인 상수로 둔다: `FPS_TARGET = 30`, `WINDOW_S = 0.5`, `MAX_GAP_S = 1`, `WARMUP_S = 5`, `MIN_SECONDS = 5`, `OUTLIER_LOW_SECONDS = 10`, `FLUSH_MS = 60_000`, `MAX_FPS_ROWS = 5`, `MAX_ERROR_ROWS = 30`, `COUNT_MAX = 10_000`, `DETAIL_MAX = 120`, `TARGET_MAX = 80`, `PLACE_MAX = 40`, `GPU_MAX = 80`.
- 장소 이름: `plaza`, `campus`, `beach`(`world.id` 그대로), `branch:<slug>`, `meeting`. 에러의 장소는 주소(`location.pathname`의 첫 칸, 예: `/space` → `space`, `/` → `plaza`, `/meeting/12` → `meeting`).
- 원본 보관 90일, 매일 19:27 UTC(04:27 KST) 삭제.
- 코드 주석은 한국어, 이 저장소의 주석 밀도와 말투를 따른다.
- 커밋 전 `npm run lint`, `npm run build` 통과. 커밋 메시지 `종류: 한국어 설명` + 개조식 본문 + `Claude-Session: https://claude.ai/code/session_01HDZYmt7EgmBeKtPm8HAino`.
- push·PR 생성은 하지 않는다(사용자가 한다).

## 검증 방식 (테스트 도구 없음)

저장소에는 테스트 도구가 없고, 추가하려면 팀 확인이 필요하다. 그래서:

- 순수 로직은 Node 26 이 `.ts` 를 바로 실행하는 것을 이용해, **scratchpad 의 확인 스크립트**(`node:assert`)로 검증한다. 저장소에 커밋하지 않는다.
  - 위치: `$S/ops-checks/*.check.ts` (`S=/private/tmp/claude-501/-Users-yuksimho-Desktop-TWOTEAM/1e02d4d1-8017-4025-a011-822ddb08efc2/scratchpad`)
  - 실행: `node $S/ops-checks/<name>.check.ts` → 마지막 줄 `ok` 가 나오면 통과
  - 그래서 `opsLogic.ts`, `diagnosis.ts` 는 값 import 를 확장자 포함(`./opsLogic.ts`)으로 쓰고, 타입은 `import type` 만 쓴다(`allowImportingTsExtensions` 가 켜져 있음).
- DB 는 로컬 Supabase Postgres 컨테이너(`public.ecr.aws/supabase/postgres:17.11.0.006`)에 0001~0071 을 적용하고 `$S/ops-db/check.sql` 로 검증한다.
- 화면은 개발 서버 + 서비스 DB 로 마지막 Task 에서 눈으로 확인한다.

## Review Focus

1. **감시 장치가 앱 요청을 망가뜨림** — `opsFetch` 가 응답 본문을 먼저 읽거나 예외를 던지면 모든 Supabase 호출이 깨진다. 호출한 쪽은 원래 응답을 그대로 읽을 수 있어야 하고, 기록 중 오류는 삼켜야 한다. → Task 4 확인 스크립트
2. **다른 탭에 갔다 오기** — 돌아올 때 프레임 간격이 수십 초라 FPS 가 0 으로 잡히면 이상치가 가짜로 쏟아진다. 1초 넘는 간격은 버려야 한다. → Task 2 `stepFps` 확인
3. **에러 메시지 속 입력값** — `duplicate key ... Key (nickname)=(민지)`, `email address "a@b.com" is invalid` 처럼 사용자가 입력한 값이 들어간다. 저장 전에 지워져야 한다. → Task 2 `scrubDetail` 확인
4. **에러 폭주** — 화면이 반복 호출 버그로 초당 수백 번 실패하면 메모리·DB 가 커지면 안 된다. 1분에 서로 다른 에러 30개, 횟수 10000 까지만. → Task 2 집계 확인, Task 1 DB 확인
5. **사용자 PC 시계가 틀림** — 시각이 몇 시간 어긋난 줄이 오면 그 줄만 건너뛰고 나머지는 들어가야 한다(전체 거절 아님). → Task 1 DB 확인

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0071_ops_telemetry.sql` | 테이블 2개, `ops_report`, `ops_dashboard`, 삭제 함수, pg_cron |
| `src/ops/opsLogic.ts` | 순수 로직: 상수, 분 자르기, 대상 주소 다듬기, 메시지 지우기, 기기 정보, FPS 누적, 에러 집계, 시계열 채우기 |
| `src/ops/diagnosis.ts` | 순수 로직: 진단표와 `diagnose`, `buildPrompt` |
| `src/ops/collector.ts` | 메모리 상태(지금 FPS 누적기, 에러 집계). Supabase 를 모른다 |
| `src/ops/opsFetch.ts` | `fetch` 를 감싸 400 이상 응답을 `collector` 에 기록 |
| `src/ops/telemetry.ts` | `startTelemetry(client)`: 1분 타이머, 창 오류 이벤트, `ops_report` 호출, 기기 정보 |
| `src/ops/OpsFpsProbe.tsx` | Canvas 안에서 프레임 간격을 `collector` 에 넘김, GPU 이름 읽기 |
| `src/ops/opsApi.ts` | `ops_dashboard` 호출과 응답 타입, 기간 정의 |
| `src/ops/OpsCharts.tsx` | SVG 막대(에러)·선(FPS) 그래프 |
| `src/ops/OpsDashboard.tsx` | 넓은 창 본문: 기간, 요약 타일, 그래프, 표, 진단·프롬프트 |
| `src/ops/OpsSettingsTab.tsx` | 설정의 "관리자" 탭 본문: 24시간 요약 3개 + 열기 버튼 |
| `src/lib/supabase.ts` | `global.fetch` 에 `opsFetch`, 만든 뒤 `startTelemetry(supabase)` |
| `vite.config.ts` | `import.meta.env.VITE_APP_VERSION` 정의 |
| `src/realtime/relayLink.ts`, `onlineLink.ts`, `useChannel.ts`, `roomLink.ts`, `secureEvents.ts` | 끊김·거절·실패를 `recordError` |
| `src/world/WorldScene.tsx`, `src/space/BranchScene.tsx`, `src/meeting/MeetingScene.tsx` | `<OpsFpsProbe place=… />` 한 줄 |
| `src/menu/panelTypes.ts`, `InfoPanel.tsx`, `SettingsView.tsx` | 창 종류 `ops`(넓게), 관리자 탭 |
| `CLAUDE.md` | 폴더 구조에 `ops/` 한 줄 |

Supabase Realtime 의 `ChatProvider`, `OnlineProvider`, `SoccerBall`, `useSandMarks` 구독은 중계 서버가 없을 때(실험·로컬)만 쓰는 길이라 이번에 감시하지 않는다.

---

### Task 1: DB — 테이블, 넣기·보기 함수, 보관 삭제 (`0071_ops_telemetry.sql`)

**Files:**
- Create: `supabase/migrations/0071_ops_telemetry.sql`
- Modify: `docs/superpowers/specs/2026-11-17-ops-dashboard-design.md` (아래 "설계 문서 고칠 곳")
- Test: `$S/ops-db/stubs.sql`, `$S/ops-db/check.sql` (커밋 안 함)

**Interfaces:**
- Produces:
  - `public.ops_report(p_device jsonb, p_fps jsonb, p_errors jsonb) returns void`
    - `p_device`: `{ browser, os, mobile, cores, gpu, version }`
    - `p_fps`: `[{ minute, place, fps_avg, fps_min, low_seconds, seconds }]`
    - `p_errors`: `[{ minute, place, kind, code, target, detail, count }]`
  - `public.ops_dashboard(p_from timestamptz, p_to timestamptz) returns jsonb` (모양은 Step 3)
  - `public.delete_old_ops_telemetry() returns void`

설계 문서 고칠 곳 (구현하며 정한 것):
- 장소 이름 `lobby` → `plaza` (`world.id` 그대로)
- `ops_report` 에 기기 정보를 따로 받는 `p_device` 추가 (줄마다 반복하지 않음). 에러에도 `browser`·`version` 저장
- FPS 유일 키를 (사용자, 분, 장소)로 (한 분 안에 장소를 옮기면 두 줄)
- 시각이 범위를 벗어난 줄은 함수 전체를 거절하지 않고 그 줄만 건너뜀

- [ ] **Step 1: 로컬 DB 준비**

  컨테이너를 띄우고(`docker run -d --name ops-db -e POSTGRES_PASSWORD=postgres -p 54329:5432 public.ecr.aws/supabase/postgres:17.11.0.006`), `$S/ops-db/stubs.sql` 을 `-U supabase_admin` 으로 적용한다. stubs 는 이번 세션 앞부분 main 검증 때 쓴 것과 같다: `auth.users.is_anonymous`, `auth.sessions`, `auth.jwt()`, `realtime.messages`, `realtime.topic()`, `storage.objects`, `storage.buckets`. 그다음 `origin/develop` 의 0001~0070 을 `sort` 순서로 적용한다(파일 목록은 `while IFS= read -r f` 로 돈다. zsh 는 변수를 쪼개지 않는다).
  Expected: 70개 파일 오류 0.

- [ ] **Step 2: 실패하는 확인 SQL 작성** — `$S/ops-db/check.sql`

  사용자 A(팀), B(팀 아님) 두 명을 `auth.users` 에 넣고, `team_members` 에 A 만 넣는다. 역할 바꾸기는 `set role authenticated; set request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`. 각 확인은 `do $$ ... assert ...; $$` 로 쓰고 마지막에 `select 'ok';`.

  | 확인 | 기대 |
  |---|---|
  | B 로 `ops_report` FPS 1줄·에러 1줄 | 두 표에 `user_id = B` 로 1줄씩 |
  | B 로 같은 분·같은 장소 FPS 를 다시 | 여전히 1줄 (무시) |
  | B 로 같은 에러 키 `count` 5 를 두 번 | `count = 10` |
  | `count` 9999 를 두 번 | `count = 10000` |
  | B 로 한 분에 서로 다른 에러 35개를 두 번에 나눠 | 그 분 B 의 에러 줄은 30 |
  | 한 번에 FPS 6줄 | 예외 (상한 5) |
  | 한 번에 에러 31줄 | 예외 (상한 30) |
  | `minute` 이 2시간 전인 줄 + 정상 줄 | 정상 줄만 들어감 |
  | `place` 41자 / `kind = 'x'` | 호출 전체가 예외 (check 제약. 화면은 미리 잘라 보내므로 정상 사용에서는 나지 않음) |
  | 로그인 없이(`set role anon`) `ops_report` | 권한 오류 |
  | B 로 `select * from ops_fps` | 0줄 또는 권한 오류 (직접 조회 불가) |
  | B 로 `ops_dashboard(now()-'1 hour', now())` | 예외 ("팀만") |
  | A 로 같은 호출 | `summary.users = 1`, `top_errors` 에 위 에러, `bucket_seconds = 60` |
  | A 로 기간 32일 | 예외 |
  | `delete_old_ops_telemetry()` 를 superuser 로 (91일 전 줄을 미리 넣어 둠) | 91일 전 줄만 사라짐 |

  Run: `psql -h localhost -p 54329 -U postgres -v ON_ERROR_STOP=1 -f $S/ops-db/check.sql`
  Expected: 0071 이 없어 `function public.ops_report(...) does not exist` 로 FAIL

- [ ] **Step 3: `0071_ops_telemetry.sql` 작성**

  `begin; ... commit;` 으로 감싸고, cron 은 0045 처럼 commit 뒤 트랜잭션 밖에서 건다. 맨 끝에 `notify pgrst, 'reload schema';`. 파일 머리 주석에 문제·방법·적용할 DB(서비스 먼저, 운영은 main 전)를 0070 형식으로 적는다.

  테이블 (모든 칸 not null, 유일 키에 null 이 끼지 않게 빈 문자열 기본값):

  ```sql
  create table public.ops_fps (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    minute timestamptz not null,
    place text not null check (char_length(place) between 1 and 40),
    fps_avg smallint not null check (fps_avg between 0 and 1000),
    fps_min smallint not null check (fps_min between 0 and 1000),
    low_seconds smallint not null check (low_seconds between 0 and 60),
    seconds smallint not null check (seconds between 1 and 60),
    browser text not null default '' check (char_length(browser) <= 20),
    os text not null default '' check (char_length(os) <= 20),
    mobile boolean not null default false,
    cores smallint not null default 0 check (cores between 0 and 256),
    gpu text not null default '' check (char_length(gpu) <= 80),
    version text not null default '' check (char_length(version) <= 12),
    unique (user_id, minute, place)
  );
  create table public.ops_errors (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    minute timestamptz not null,
    place text not null default '' check (char_length(place) <= 40),
    kind text not null check (kind in ('supabase', 'relay', 'realtime', 'js')),
    code text not null check (char_length(code) between 1 and 16),
    target text not null default '' check (char_length(target) <= 80),
    detail text not null default '' check (char_length(detail) <= 120),
    count int not null check (count between 1 and 10000),
    browser text not null default '' check (char_length(browser) <= 20),
    version text not null default '' check (char_length(version) <= 12),
    unique (user_id, minute, kind, code, target, place)
  );
  create index ops_fps_minute on public.ops_fps (minute);
  create index ops_errors_minute on public.ops_errors (minute);
  ```

  두 표 모두 `enable row level security`, `revoke all ... from anon, authenticated`, 정책 없음.

  `ops_report` (plpgsql, security definer, `set search_path = ''`):
  - `auth.uid()` 없으면 `raise exception '로그인이 필요해요.'`
  - 배열이 아니거나 FPS > 5, 에러 > 30 이면 예외
  - 줄마다 `minute := date_trunc('minute', (e->>'minute')::timestamptz)`. `now() - interval '10 minutes'` ~ `now() + interval '1 minute'` 밖이면 `continue`
  - FPS: `insert ... on conflict (user_id, minute, place) do nothing`
  - 에러: 같은 키가 없고 그 사용자·그 분의 에러 줄이 이미 30 이상이면 `continue`. 아니면 `insert ... on conflict (...) do update set count = least(ops_errors.count + excluded.count, 10000), detail = case when excluded.detail <> '' then excluded.detail else ops_errors.detail end`
  - 기기 값(`browser`, `os`, `mobile`, `cores`, `gpu`, `version`)은 `p_device` 에서 꺼내 줄마다 넣는다. 길이는 `left(..., n)` 으로 자른다.
  - 실행 권한: `revoke ... from public, anon; grant ... to authenticated`

  `ops_dashboard` (plpgsql, stable, security definer):
  - `public.is_team()` 이 아니면 `raise exception '팀만 볼 수 있어요.'`. `p_to <= p_from` 이거나 `p_to - p_from > interval '31 days'` 면 예외
  - 묶음: 1시간 이하 60초, 24시간 이하 1800초, 7일 이하 10800초, 그 위 86400초. `date_bin(make_interval(secs => v_bucket), minute, timestamptz '2000-01-01')`
  - 이상치 분 = `fps_avg < 30 or low_seconds >= 10`
  - 돌려주는 jsonb:

  ```
  {
    "bucket_seconds": 60,
    "summary": { "users": int, "errors": int, "errors_4xx": int, "errors_5xx": int,
                 "fps_minutes": int, "low_minutes": int, "fps_median": int|null },
    "error_series": [{ "t": ts, "kind": text, "n": int }],
    "fps_series":   [{ "t": ts, "avg": int, "low_pct": int }],
    "top_errors":   [{ "kind", "code", "target", "detail", "place", "count", "users",
                       "first": ts, "last": ts, "browser", "version" }]   // count 내림차순 50개
    "outliers":     [{ "minute", "place", "fps_avg", "fps_min", "low_seconds",
                       "browser", "os", "mobile", "gpu", "version" }]  // 최근순 100개
  }
  ```

  - `users` 는 두 표를 합친 서로 다른 `user_id` 수. `errors_4xx` 는 `code ~ '^4\d\d$'`, `5xx` 는 `'^5\d\d$'`. `errors` 는 `sum(count)`.
  - `top_errors` 는 (kind, code, target) 으로 묶고 `detail`·`place`·`browser` 는 `mode() within group`, `version` 은 가장 최근 줄의 값.
  - 빈 결과는 `[]`, `fps_median` 은 `null`.

  `delete_old_ops_telemetry()`: 두 표에서 `minute < now() - interval '90 days'` 삭제. 실행 권한은 누구에게도 주지 않는다(cron 만). commit 뒤 `cron.unschedule('ops-telemetry-retention') where exists ...; cron.schedule('ops-telemetry-retention', '27 19 * * *', $$ select public.delete_old_ops_telemetry(); $$);`

- [ ] **Step 4: 적용하고 확인 SQL 통과**

  Run: `psql ... -f supabase/migrations/0071_ops_telemetry.sql && psql ... -f $S/ops-db/check.sql`
  Expected: 마지막 줄 `ok`, 오류 0

- [ ] **Step 5: 설계 문서 고칠 곳 반영, 커밋**

  ```bash
  git add supabase/migrations/0071_ops_telemetry.sql docs/superpowers/specs/2026-11-17-ops-dashboard-design.md
  git commit   # feat: 화면 에러·FPS 기록 테이블과 팀 전용 조회 함수 추가 (0071)
  ```

---

### Task 2: 순수 로직 — `src/ops/opsLogic.ts`

**Files:**
- Create: `src/ops/opsLogic.ts`
- Test: `$S/ops-checks/opsLogic.check.ts`

**Interfaces:**
- Produces (타입):
  - `type ErrorKind = 'supabase' | 'relay' | 'realtime' | 'js'`
  - `type OpsError = { kind: ErrorKind; code: string; target: string; detail: string; place: string }`
  - `type ErrorRow = OpsError & { minute: string; count: number }`
  - `type FpsRow = { minute: string; place: string; fps_avg: number; fps_min: number; low_seconds: number; seconds: number }`
  - `type Device = { browser: string; os: string; mobile: boolean; cores: number; gpu: string; version: string }`
  - `type FpsAcc` (내부 구조는 구현자가 정함. 아래 함수로만 다룸)
  - `type ErrorBook = Map<string, ErrorRow>` (키: `minute|kind|code|target|place`)
- Produces (함수):
  - `minuteOf(ms: number): string` — 분으로 자른 ISO 문자열
  - `normalizeTarget(url: string): string` — Supabase URL 의 경로를 짧은 이름으로
  - `placeOfPath(pathname: string): string`
  - `scrubDetail(text: string): string`
  - `errorDetail(body: unknown): string` — 에러 응답 JSON 에서 번호·메시지
  - `deviceFrom(ua: string, cores: number, gpu: string, version: string): Device`
  - `createFpsAcc(place: string, nowMs: number): FpsAcc`
  - `stepFps(acc: FpsAcc, dt: number, nowMs: number): FpsRow | null` — 분이 바뀌면 끝난 분의 줄을 돌려줌
  - `endFps(acc: FpsAcc): FpsRow | null` — 지금까지 모은 분을 줄로 (장면을 떠날 때)
  - `addError(book: ErrorBook, e: OpsError, nowMs: number): void`
  - `drainErrors(book: ErrorBook, nowMs: number, all: boolean): ErrorRow[]` — `all` 이 아니면 지금 분은 남김
  - `fillSeries<T extends { t: string }>(points: T[], fromMs: number, toMs: number, bucketSec: number, empty: (t: string) => T): T[]` — 빈 시간대를 채움. DB 는 `+00:00`, 화면은 `Z` 로 적으므로 시각은 문자열이 아니라 `Date.parse` 값으로 맞춘다

- [ ] **Step 1: 확인 스크립트 작성** — `$S/ops-checks/opsLogic.check.ts`

  ```ts
  import assert from 'node:assert/strict'
  import { minuteOf, normalizeTarget, placeOfPath, scrubDetail, errorDetail, deviceFrom,
    createFpsAcc, stepFps, endFps, addError, drainErrors, fillSeries } from '/Users/yuksimho/Desktop/TWOTEAM/src/ops/opsLogic.ts'

  const T0 = Date.parse('2026-11-17T10:00:00Z')
  assert.equal(minuteOf(T0 + 59_999), '2026-11-17T10:00:00.000Z')

  const base = 'https://abc.supabase.co'
  assert.equal(normalizeTarget(`${base}/rest/v1/rpc/assign_seat`), 'rpc/assign_seat')
  assert.equal(normalizeTarget(`${base}/rest/v1/meetings?id=eq.12&select=*`), 'rest/meetings')
  assert.equal(normalizeTarget(`${base}/auth/v1/token?grant_type=refresh_token`), 'auth/token')
  assert.equal(normalizeTarget(`${base}/storage/v1/object/avatars/3f2b6c1e-1111-2222-3333-444455556666/a.png`), 'storage/object/avatars/:id/a.png')
  assert.equal(normalizeTarget(`${base}/functions/v1/usage-monitor`), 'fn/usage-monitor')
  assert.equal(normalizeTarget('https://relay.example.dev/channels/lobby?want=3'), 'channels/lobby')
  assert.ok(normalizeTarget(`${base}/rest/v1/${'x'.repeat(200)}`).length <= 80)

  assert.equal(placeOfPath('/'), 'plaza')
  assert.equal(placeOfPath('/space'), 'space')
  assert.equal(placeOfPath('/meeting/12'), 'meeting')

  // Review Focus 3: 입력값 지우기
  assert.equal(scrubDetail('23505 duplicate key value violates unique constraint "profiles_nickname_key" Key (nickname)=(민지) already exists'),
    '23505 duplicate key value violates unique constraint "profiles_nickname_key" already exists')
  assert.ok(!scrubDetail('email address "minji@naver.com" is invalid').includes('minji'))
  assert.ok(!scrubDetail('Email minji@naver.com not confirmed').includes('minji'))
  assert.ok(scrubDetail('x'.repeat(300)).length <= 120)

  assert.equal(errorDetail({ code: 'PGRST202', message: 'Could not find the function public.foo' }), 'PGRST202 Could not find the function public.foo')
  assert.equal(errorDetail({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), 'invalid_credentials Invalid login credentials')
  assert.equal(errorDetail('not json'), '')
  assert.equal(errorDetail(null), '')

  const mac = deviceFrom('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 8, 'ANGLE (Apple, Apple M2)', 'abc1234')
  assert.deepEqual(mac, { browser: 'Chrome', os: 'Mac', mobile: false, cores: 8, gpu: 'ANGLE (Apple, Apple M2)', version: 'abc1234' })
  assert.equal(deviceFrom('... Chrome/141.0 Safari/537.36 Edg/141.0', 4, '', 'dev').browser, 'Edge')
  assert.equal(deviceFrom('... Chrome/140 Whale/4.0 Safari/537.36', 4, '', 'dev').browser, 'Whale')
  assert.equal(deviceFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ... Version/18.0 Mobile/15E148 Safari/604.1', 6, '', 'dev').os, 'iOS')
  assert.equal(deviceFrom('Mozilla/5.0 (Linux; Android 15) ... Chrome/141 Mobile Safari/537.36', 8, '', 'dev').mobile, true)

  // FPS: 처음 5초 버림, 60FPS 로 1분 → 평균 60, 30 미만 0초
  {
    const acc = createFpsAcc('plaza', T0)
    let row = null, t = T0
    for (let i = 0; i < 60 * 70; i++) { t += 1000 / 60; row = stepFps(acc, 1 / 60, t) ?? row }
    assert.ok(row)
    assert.equal(row.minute, '2026-11-17T10:00:00.000Z')
    assert.equal(row.fps_avg, 60)
    assert.equal(row.low_seconds, 0)
    assert.ok(row.seconds >= 54 && row.seconds <= 56) // 앞 5초 제외
  }
  // Review Focus 2: 다른 탭에 30초 → 그 간격은 버리고 0FPS 로 세지 않음
  {
    const acc = createFpsAcc('plaza', T0)
    let t = T0
    for (let i = 0; i < 60 * 10; i++) { t += 1000 / 60; stepFps(acc, 1 / 60, t) }
    t += 30_000; stepFps(acc, 30, t)
    for (let i = 0; i < 60 * 10; i++) { t += 1000 / 60; stepFps(acc, 1 / 60, t) }
    const row = endFps(acc)
    assert.ok(row)
    assert.equal(row.fps_min >= 59, true)
    assert.equal(row.low_seconds, 0)
  }
  // 20FPS 로 20초 + 60FPS → 30 미만 약 20초, 최저 20
  {
    const acc = createFpsAcc('branch:sol', T0)
    let t = T0
    for (let i = 0; i < 60 * 6; i++) { t += 1000 / 60; stepFps(acc, 1 / 60, t) }
    for (let i = 0; i < 20 * 20; i++) { t += 50; stepFps(acc, 0.05, t) }
    const row = endFps(acc)
    assert.ok(row)
    assert.equal(row.fps_min, 20)
    assert.ok(row.low_seconds >= 19 && row.low_seconds <= 21)
  }
  // 잰 시간이 5초 미만이면 줄을 만들지 않음
  {
    const acc = createFpsAcc('plaza', T0)
    let t = T0
    for (let i = 0; i < 60 * 8; i++) { t += 1000 / 60; stepFps(acc, 1 / 60, t) } // 5초 버리고 3초
    assert.equal(endFps(acc), null)
  }

  // Review Focus 4: 에러 집계 상한
  {
    const book = new Map()
    const e = { kind: 'supabase', code: '409', target: 'rpc/assign_seat', detail: '', place: 'space' } as const
    for (let i = 0; i < 20_000; i++) addError(book, e, T0)
    for (let i = 0; i < 50; i++) addError(book, { ...e, target: `rpc/f${i}` }, T0)
    const rows = drainErrors(book, T0 + 120_000, false)
    assert.equal(rows.length, 30)
    assert.equal(rows.find((r) => r.target === 'rpc/assign_seat')?.count, 10_000)
    assert.equal(book.size, 0)
  }
  // 지금 분은 남기고, all 이면 다 비움
  {
    const book = new Map()
    addError(book, { kind: 'js', code: 'error', target: '', detail: 'boom', place: 'plaza' }, T0)
    assert.equal(drainErrors(book, T0 + 10_000, false).length, 0)
    assert.equal(drainErrors(book, T0 + 10_000, true).length, 1)
  }

  // 빈 시간대 채우기
  {
    const filled = fillSeries([{ t: '2026-11-17T10:02:00.000Z', n: 3 }], T0, T0 + 5 * 60_000, 60, (t) => ({ t, n: 0 }))
    assert.equal(filled.length, 5)
    assert.equal(filled[2].n, 3)
  }
  console.log('ok')
  ```

- [ ] **Step 2: 실행해서 실패 확인**

  Run: `node $S/ops-checks/opsLogic.check.ts`
  Expected: FAIL `Cannot find module .../src/ops/opsLogic.ts`

- [ ] **Step 3: `src/ops/opsLogic.ts` 구현**

  파일 머리 주석에 "무엇을 왜 모으는지(#590), 보내지 않는 것"을 적는다. 상수는 Global Constraints 값 그대로.
  - `normalizeTarget`: `URL` 로 읽어 경로만. `/rest/v1/rpc/x` → `rpc/x`, `/rest/v1/t` → `rest/t`, `/auth/v1/x` → `auth/x`, `/storage/v1/...` → `storage/...`, `/functions/v1/x` → `fn/x`, 그 밖은 앞 `/` 를 뗀 경로. 숫자만인 칸과 UUID 칸은 `:id`. `TARGET_MAX` 로 자름. 읽지 못하면 `''`.
  - `scrubDetail`: `Key (…)=(…)` 와 뒤따르는 공백 제거 → 큰따옴표·작은따옴표 안의 값 중 `@` 를 포함한 것과, 맨 이메일 모양(`\S+@\S+`)을 `…` 로 → 공백 정리 → `DETAIL_MAX` 로 자름. 제약 이름처럼 `@` 없는 따옴표 값은 남긴다(원인 찾기에 필요).
  - `errorDetail`: 객체면 번호(`code` → `error_code` → `error`) 와 메시지(`message` → `msg` → `error_description`) 를 공백으로 잇고 `scrubDetail`. 아니면 `''`.
  - `deviceFrom`: 브라우저 순서 `Edg/`→Edge, `Whale/`→Whale, `SamsungBrowser/`→Samsung, `OPR/`→Opera, `Firefox/`→Firefox, `Chrome/`→Chrome, `Safari/`→Safari, 그 밖 `기타`. OS 순서 `iPhone|iPad`→iOS, `Android`→Android, `CrOS`→ChromeOS, `Windows`→Windows, `Macintosh`→Mac, `Linux`→Linux, 그 밖 `기타`. `mobile` 은 `/Mobi|Android|iPhone|iPad/`. `gpu` 는 `GPU_MAX` 로 자름.
  - FPS 누적: `dt > MAX_GAP_S` 면 지금 0.5초 창만 비우고 돌아감(Review Focus 2). 처음 `WARMUP_S` 초는 세지 않음. 0.5초 창이 차면 `fps = frames / time` 으로 합계·최저·30 미만 초를 더함. 창이 닫힐 때 `minuteOf(nowMs)` 가 지금 누적의 분과 다르면 끝난 분의 줄을 만들어 돌려주고 새 분으로 넘어감. 잰 초가 `MIN_SECONDS` 미만인 분은 `null`. 반올림은 `Math.round`, `low_seconds`·`seconds` 는 60 을 넘지 않게.
  - 에러 집계: 키 `minute|kind|code|target|place`. 새 키는 같은 분의 키가 `MAX_ERROR_ROWS` 개 미만일 때만 만든다. `count` 는 `COUNT_MAX` 에서 멈춤. `drainErrors` 는 `all` 이면 전부, 아니면 `minute < minuteOf(nowMs)` 인 것만 꺼내고 지운다.
  - `fillSeries`: `fromMs` 를 `bucketSec` 로 내림한 시각부터 `toMs` 전까지 `bucketSec` 간격으로, 있는 점은 그대로 없는 곳은 `empty(t)`.

- [ ] **Step 4: 통과 확인**

  Run: `node $S/ops-checks/opsLogic.check.ts`
  Expected: `ok`

- [ ] **Step 5: 커밋** — `npm run lint` 후 `git add src/ops/opsLogic.ts` → `feat: 화면 에러·FPS 정리 순수 로직 추가`

---

### Task 3: 진단표와 AI 프롬프트 — `src/ops/diagnosis.ts`

**Files:**
- Create: `src/ops/diagnosis.ts`
- Test: `$S/ops-checks/diagnosis.check.ts`

**Interfaces:**
- Consumes: `ErrorKind` (Task 2)
- Produces:
  - `type TopError = { kind: ErrorKind; code: string; target: string; detail: string; place: string; count: number; users: number; first: string; last: string; browser: string; version: string }` — `ops_dashboard` 의 `top_errors` 한 줄과 같은 모양 (Task 6 이 이 타입을 씀)
  - `type Diagnosis = { title: string; meaning: string; causes: string[]; steps: string[] }`
  - `diagnose(e: Pick<TopError, 'kind' | 'code' | 'target' | 'detail'>): Diagnosis | null`
  - `buildPrompt(e: TopError, env: '서비스' | '운영'): string`

- [ ] **Step 1: 확인 스크립트 작성**

  ```ts
  import assert from 'node:assert/strict'
  import { diagnose, buildPrompt } from '/Users/yuksimho/Desktop/TWOTEAM/src/ops/diagnosis.ts'

  const d = (kind: string, code: string, target = '', detail = '') => diagnose({ kind: kind as never, code, target, detail })
  assert.match(d('supabase', '404', 'rpc/send_meeting_event', 'PGRST202 Could not find the function')!.title, /함수가 DB 에 없음/)
  assert.match(d('supabase', '400', 'rpc/x', 'PGRST202 ...')!.title, /함수가 DB 에 없음/) // 번호가 먼저
  assert.match(d('supabase', '403', 'rest/reports', '42501 permission denied')!.title, /권한/)
  assert.match(d('supabase', '409', 'rpc/assign_seat', '23505 duplicate key')!.title, /중복/)
  assert.match(d('supabase', '400', 'rpc/assign_seat', 'P0001 이미 다른 자리를 쓰고 있어요.')!.title, /안내 오류/)
  assert.match(d('supabase', '401', 'rest/profiles')!.title, /로그인/)
  assert.match(d('supabase', '429', 'auth/token')!.title, /한도/)
  assert.match(d('supabase', '503', 'rpc/x')!.title, /Supabase 쪽/)
  assert.match(d('relay', '4503', 'room/lobby')!.title, /정원/)
  assert.match(d('relay', '1006', 'online')!.title, /끊김/)
  assert.match(d('realtime', 'TIMED_OUT', 'meeting:12')!.title, /실시간/)
  assert.match(d('js', 'error', '', 'TypeError: x is undefined')!.title, /화면 오류/)
  assert.equal(d('supabase', '418', 'rest/x'), null)

  const p = buildPrompt({ kind: 'supabase', code: '404', target: 'rpc/send_meeting_event', detail: 'PGRST202 Could not find the function',
    place: 'meeting', count: 37, users: 5, first: '2026-11-17T09:10:00Z', last: '2026-11-17T09:40:00Z', browser: 'Chrome', version: 'fa4ac22' }, '서비스')
  for (const s of ['rpc/send_meeting_event', 'PGRST202', '37', '5명', 'fa4ac22', '서비스', 'CLAUDE.md', 'rg "send_meeting_event"', '원인', '수정안', '확인 방법', '함수가 DB 에 없음'])
    assert.ok(p.includes(s), s)
  assert.ok(buildPrompt({ kind: 'supabase', code: '418', target: 'rest/x', detail: '', place: '', count: 1, users: 1, first: '', last: '', browser: '', version: '' }, '운영').includes('진단표에 없는'))
  console.log('ok')
  ```

- [ ] **Step 2: 실행해서 실패 확인** — Expected: FAIL (모듈 없음)

- [ ] **Step 3: `src/ops/diagnosis.ts` 구현**

  진단표는 위에서부터 처음 맞는 것을 쓴다. 순서와 조건(설계 문서 "에러 해결 돕기" 표 그대로, title 은 아래 문구로):

  | 순서 | 조건 | title |
  |---|---|---|
  | 1 | detail 이 `PGRST202` 로 시작, 또는 `rpc/` 대상의 404 | 함수가 DB 에 없음 (마이그레이션 미적용) |
  | 2 | detail 이 `42501` 로 시작, 또는 403 | 권한·RLS 에 막힘 |
  | 3 | detail 이 `23505` 로 시작, 또는 409 | 중복 (유일 제약) |
  | 4 | detail 이 `P0001` 로 시작 | 함수가 낸 안내 오류 |
  | 5 | 401 | 로그인 토큰 없음·만료 |
  | 6 | 429 | 요청 한도 초과 |
  | 7 | supabase 의 5xx | Supabase 쪽 장애·시간 초과 |
  | 8 | relay `4503` | 중계 서버 정원 초과 |
  | 9 | relay `401`·`1006`·`1001`·`CLOSED`·`TIMED_OUT` | 중계 서버 연결 거절·끊김 |
  | 10 | realtime `TIMED_OUT`·`CHANNEL_ERROR`·`CLOSED` | 실시간 방 연결 실패 |
  | 11 | js | 화면 오류 (잡히지 않은 예외) |

  각 항목의 `meaning`·`causes`·`steps` 는 설계 문서 표의 설명을 풀어 쓴다(예: 1번 steps = `./scripts/check-db.sh` 로 빠진 객체 확인 → 그 마이그레이션을 SQL Editor 에서 실행 → 화면 새로고침).

  `buildPrompt` 는 아래 순서의 한국어 텍스트:
  1. 첫 줄: 두뜀 저장소에서 `{env}` 환경에 난 에러를 고치려 한다, 먼저 `CLAUDE.md` 를 읽어라
  2. 에러 요약: 종류·코드·대상·detail·장소·횟수·`{users}명`·처음/마지막·주요 브라우저·배포 버전(`git show {version}` 으로 그 시점 코드 확인 가능)
  3. 진단표 설명(있으면 title·meaning·causes) 또는 "진단표에 없는 에러다"
  4. 찾아볼 곳: 대상 이름(`rpc/` 뒤, `rest/` 뒤, 중계는 방 종류)으로 `rg "<이름>" supabase/migrations src relay/src`
  5. 답 형식: 원인 → 수정안(파일·줄) → 확인 방법. 마이그레이션이 필요하면 SQL 과 적용 순서
  6. 규칙: 추측으로 고치지 말고 근거 파일을 먼저 보여 줄 것, `main`·`develop` 에 직접 커밋하지 말 것

- [ ] **Step 4: 통과 확인** — Expected: `ok`

- [ ] **Step 5: 커밋** — `feat: 에러 진단표와 AI 프롬프트 만들기 추가`

---

### Task 4: 수집기·요청 감시·보내기 연결

**Files:**
- Create: `src/ops/collector.ts`, `src/ops/opsFetch.ts`, `src/ops/telemetry.ts`
- Modify: `src/lib/supabase.ts:32-34`, `vite.config.ts`
- Test: `$S/ops-checks/collector.check.ts`

**Interfaces:**
- Consumes: Task 2 함수·타입
- Produces:
  - `collector.ts`
    - `recordError(e: Omit<OpsError, 'place'> & { place?: string }): void` — `place` 를 안 주면 `placeOfPath(location.pathname)`
    - `fpsStart(place: string): void`, `fpsFrame(dt: number): void`, `fpsStop(): void`
    - `setGpu(name: string): void`, `getGpu(): string`
    - `drain(nowMs: number, all: boolean): { fps: FpsRow[]; errors: ErrorRow[] }`
    - `clearAll(): void`
  - `opsFetch.ts`: `opsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>`
  - `telemetry.ts`: `startTelemetry(client: SupabaseClient): void` (두 번 불러도 한 번만 시작)

- [ ] **Step 1: 확인 스크립트 작성** — `collector.check.ts`

  `collector.ts`·`opsFetch.ts` 는 `location` 이 없으면 `placeOfPath('/')` 를 쓰도록 해 Node 에서 돌게 한다. `globalThis.fetch` 를 가짜로 바꿔 확인:

  ```ts
  import assert from 'node:assert/strict'
  import { recordError, drain, clearAll, fpsStart, fpsFrame, fpsStop } from '/Users/yuksimho/Desktop/TWOTEAM/src/ops/collector.ts'
  import { opsFetch } from '/Users/yuksimho/Desktop/TWOTEAM/src/ops/opsFetch.ts'

  const body = JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.foo' })
  globalThis.fetch = async () => new Response(body, { status: 404, headers: { 'content-type': 'application/json' } })

  // Review Focus 1: 호출한 쪽은 본문을 그대로 읽는다
  const res = await opsFetch('https://abc.supabase.co/rest/v1/rpc/foo', { method: 'POST' })
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), JSON.parse(body))
  await new Promise((r) => setTimeout(r, 10)) // 기록은 뒤에서
  let out = drain(Date.now(), true)
  assert.equal(out.errors.length, 1)
  assert.equal(out.errors[0].target, 'rpc/foo')
  assert.equal(out.errors[0].detail.startsWith('PGRST202'), true)

  // 기록 저장 요청은 세지 않음
  await opsFetch('https://abc.supabase.co/rest/v1/rpc/ops_report', { method: 'POST' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(drain(Date.now(), true).errors.length, 0)

  // 본문이 JSON 이 아니어도 앱 요청은 그대로, 기록은 detail 없이
  globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 })
  const r2 = await opsFetch('https://abc.supabase.co/rest/v1/rpc/foo')
  assert.equal(await r2.text(), '<html>bad gateway</html>')
  await new Promise((r) => setTimeout(r, 10))
  out = drain(Date.now(), true)
  assert.equal(out.errors[0].code, '502')
  assert.equal(out.errors[0].detail, '')

  // 네트워크 실패는 그대로 던지되 기록은 남김 (code 'network')
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(opsFetch('https://abc.supabase.co/rest/v1/rpc/foo'))
  assert.equal(drain(Date.now(), true).errors[0].code, 'network')

  // 200 은 기록 안 함
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  await opsFetch('https://abc.supabase.co/rest/v1/rpc/foo')
  assert.equal(drain(Date.now(), true).errors.length, 0)

  // FPS: 시작 → 프레임 → 멈춤 → 줄 하나
  fpsStart('plaza')
  for (let i = 0; i < 60 * 20; i++) fpsFrame(1 / 60)
  fpsStop()
  assert.equal(drain(Date.now(), true).fps.length, 1)

  recordError({ kind: 'js', code: 'error', target: '', detail: 'x' })
  clearAll()
  assert.equal(drain(Date.now(), true).errors.length, 0)
  console.log('ok')
  ```

  `fpsFrame` 은 시각을 `performance.now()` 기준 누적이 아니라 `Date.now()` 로 받는다. 위 스크립트처럼 실제 시간이 거의 흐르지 않아도 `dt` 합이 20초면 줄이 나와야 하므로, `stepFps` 에 넘기는 `nowMs` 는 `fpsStart` 시각 + 누적 `dt` 로 계산한다.

- [ ] **Step 2: 실행해서 실패 확인** — Expected: FAIL (모듈 없음)

- [ ] **Step 3: `collector.ts`, `opsFetch.ts` 구현**

  - `opsFetch`: 진짜 `fetch` 를 부르고, 상태가 400 이상이며 대상이 `rpc/ops_report` 가 아니면 `res.clone().json()` 을 **기다리지 않고** 읽어 `recordError({ kind: 'supabase', code: String(status), target, detail: errorDetail(body) })`. 읽기 실패는 detail `''` 로 기록. 원래 `res` 를 바로 돌려준다. 네트워크 예외는 `code: 'network'` 로 기록하고 다시 던진다. 기록 중 예외는 모두 삼킨다.
  - `collector.ts`: 모듈 안에 `FpsAcc | null`, 끝난 FPS 줄 배열, `ErrorBook`, GPU 이름. `fpsStart` 는 이전 누적이 있으면 먼저 `endFps` 해서 쌓는다.

- [ ] **Step 4: 통과 확인** — Expected: `ok`

- [ ] **Step 5: `telemetry.ts` 구현**

  `startTelemetry(client)`:
  - 다음 분 경계 + 2~7초(무작위)에 첫 `flush(false)`, 그 뒤 `FLUSH_MS` 마다. `document.visibilityState === 'hidden'` 이 되면 `flush(true)`.
  - `window` 의 `error` → `recordError({ kind: 'js', code: 'error', target: '', detail: scrubDetail(message) })`, `unhandledrejection` → `code: 'rejection'`, detail 은 `reason.message` 또는 문자열.
  - `flush(all)`: `drain(Date.now(), all)` 이 둘 다 비면 끝. `client.auth.getSession()` 에 세션이 없으면 **버리고 끝**(Global Constraints). FPS 는 `MAX_FPS_ROWS`, 에러는 `MAX_ERROR_ROWS` 씩 잘라 여러 번 `client.rpc('ops_report', { p_device, p_fps, p_errors })`. 실패는 `console.warn` 만 하고 다시 보내지 않는다(고리 방지).
  - `p_device` 는 `deviceFrom(navigator.userAgent, navigator.hardwareConcurrency ?? 0, getGpu(), import.meta.env.VITE_APP_VERSION ?? 'dev')`.

- [ ] **Step 6: `supabase.ts`·`vite.config.ts` 연결**

  - `supabase.ts`: `createClient(url, publishableKey, { auth: { storage: choosingStorage }, global: { fetch: opsFetch } })`, 바로 아래 `startTelemetry(supabase)`. 주석으로 "400 이상 응답을 운영 대시보드용으로 센다(#590). 응답은 그대로 돌려준다" 를 단다. `watchSupabase` 에는 붙이지 않는다.
  - `vite.config.ts`: `define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)) }` 와 주석(Vercel 이 빌드할 때 넣어 주는 커밋 번호).

- [ ] **Step 7: 빌드·린트** — `npm run lint && npm run build`, Expected: 오류 0

- [ ] **Step 8: 커밋** — `feat: Supabase 요청 실패와 화면 오류를 모아 1분마다 저장`

---

### Task 5: FPS 측정기와 장면 연결

**Files:**
- Create: `src/ops/OpsFpsProbe.tsx`
- Modify: `src/world/WorldScene.tsx:558` 근처, `src/space/BranchScene.tsx:590` 근처, `src/meeting/MeetingScene.tsx:343` Canvas 안

**Interfaces:**
- Consumes: `fpsStart`, `fpsFrame`, `fpsStop`, `setGpu` (Task 4)
- Produces: `OpsFpsProbe({ place }: { place: string }): null`

- [ ] **Step 1: `OpsFpsProbe` 구현**

  `useFrame((_, delta) => fpsFrame(delta))`. `useEffect([place])` 에서 `fpsStart(place)`, 정리에서 `fpsStop()`. 처음 한 번 `useThree().gl.getContext()` 의 `WEBGL_debug_renderer_info` 로 `UNMASKED_RENDERER_WEBGL` 을 읽어 `setGpu` (확장이 없으면 `''`). 상태를 바꾸지 않으므로 다시 그리지 않는다는 주석.

- [ ] **Step 2: 장면에 한 줄씩**

  - `WorldScene`: 기존 `{showPerf && <FpsProbe …/>}` 바로 아래 `<OpsFpsProbe place={world.id} />`
  - `BranchScene`: 같은 자리에 `<OpsFpsProbe place={\`branch:${branch.slug}\`} />` (BranchSpace 안에서 slug 가 보이는 이름을 확인해 쓴다. 없으면 `BranchScene` 이 넘기는 `layout` 의 slug)
  - `MeetingScene`: `<Canvas>` 바로 안에 `<OpsFpsProbe place="meeting" />`

- [ ] **Step 3: 빌드·린트** — Expected: 오류 0

- [ ] **Step 4: 눈으로 짧게 확인**

  `npm run dev` → 광장 입장 → 1분 반 뒤 개발자 도구 Network 에 `rpc/ops_report` 가 200 (서비스 DB 에 0071 이 아직 없으면 404 가 정상 — Task 8 에서 다시 확인). 콘솔에 오류 없음.

- [ ] **Step 5: 커밋** — `feat: 광장·지점·회의실 FPS 를 1분 요약으로 기록`

---

### Task 6: 실시간 연결 실패 기록

**Files:**
- Modify: `src/realtime/relayLink.ts` (`onclose`, 침묵 `TIMED_OUT`, 토큰 없음), `src/realtime/onlineLink.ts` (같은 자리), `src/realtime/useChannel.ts` (`ask`·`refresh` 의 `res.ok` 아님), `src/realtime/roomLink.ts` (`subscribe` 콜백), `src/realtime/secureEvents.ts` (`subscribe` 콜백)

**Interfaces:**
- Consumes: `recordError` (Task 4)

- [ ] **Step 1: 중계 서버**

  - `relayLink.ts`: `socket.onclose` 에서 **`ended` 가 아직 false 일 때만**(우리가 닫은 것이 아님) `recordError({ kind: 'relay', code: String(event.code), target: \`room/${worldOf(room)}\` })`. `worldOf` 는 방 이름 첫 칸(`branch:5:2` → `branch`)이라 방 번호는 남지 않는다. 침묵으로 끝낼 때 `code: 'TIMED_OUT'`, 토큰이 없을 때는 기록하지 않는다(로그인 전).
  - `onlineLink.ts`: 같은 규칙, `target: 'online'`. `CLOSE_REPLACED`(다른 탭이 이어받음)는 정상이라 기록하지 않는다.
  - `useChannel.ts`: `res.ok` 가 아니면 `recordError({ kind: 'relay', code: String(res.status), target: \`channels/${channelWorldOf(base)}\` })`.

- [ ] **Step 2: Supabase 실시간 방**

  - `roomLink.ts` `openSupabaseLink`: `subscribe` 콜백에서 `CHANNEL_ERROR`·`TIMED_OUT` 이면 `recordError({ kind: 'realtime', code: status, target: room.split(':')[0] })`. 기존 `events.onStatus(status)` 는 그대로.
  - `secureEvents.ts`: 같은 규칙, `target: 'meeting-secure'`.

- [ ] **Step 3: 빌드·린트** — Expected: 오류 0

- [ ] **Step 4: 커밋** — `feat: 중계 서버·실시간 방 연결 실패를 운영 기록에 남김`

---

### Task 7: 대시보드 화면

**Files:**
- Create: `src/ops/opsApi.ts`, `src/ops/OpsCharts.tsx`, `src/ops/OpsDashboard.tsx`
- Test: `$S/ops-checks/opsLogic.check.ts` 에 `fillSeries` 는 이미 있음. 화면은 Task 8 에서 눈으로.

**Interfaces:**
- Consumes: `TopError`, `diagnose`, `buildPrompt` (Task 3), `fillSeries` (Task 2)
- Produces:
  - `opsApi.ts`
    - `const RANGES = [{ key: '1h', label: '1시간', ms: 3_600_000 }, { key: '24h', label: '24시간', ms: 86_400_000 }, { key: '7d', label: '7일', ms: 604_800_000 }, { key: '30d', label: '30일', ms: 2_592_000_000 }] as const`
    - `type RangeKey = (typeof RANGES)[number]['key']`
    - `type Dashboard` — Task 1 Step 3 의 jsonb 모양 그대로 (`top_errors: TopError[]`)
    - `fetchDashboard(range: RangeKey): Promise<Dashboard>` — 에러면 throw
    - `envLabel(): '서비스' | '운영' | '실험' | '로컬'` — `VITE_SUPABASE_URL` 의 프로젝트 ref 로 (`lkvsbdbssrictnrxmdig` 서비스, `rpmkqbbmymvptziroyzg` 운영, `eimxyjlarbbbnqmpmmex` 실험, 그 밖 로컬)
  - `OpsCharts.tsx`: `ErrorBars({ series, bucketSec, from, to })`, `FpsLine({ series, bucketSec, from, to })`
  - `OpsDashboard.tsx`: `OpsDashboard(): JSX.Element`

- [ ] **Step 1: dataviz 스킬 읽기**

  그래프 코드를 쓰기 전에 `dataviz` 스킬을 읽고 색·축·범례 규칙을 따른다. 색은 이 앱의 어두운 창 배경(`#1f2229` 계열)에 맞춘다. 에러 종류 4색은 범례와 같이, FPS 30 기준선은 점선.

- [ ] **Step 2: `opsApi.ts` 구현** — `supabase.rpc('ops_dashboard', { p_from, p_to })`, `p_to = new Date()`, `p_from = p_to - ms`.

- [ ] **Step 3: `OpsCharts.tsx` 구현**

  - 너비는 부모에 맞춰 `viewBox` 로(가로 1000, 세로 160), 시간축 눈금 5개(`HH:mm` 또는 `M/D`).
  - `ErrorBars`: `fillSeries` 로 빈 칸을 채운 뒤 시간대마다 종류별 쌓은 막대. 막대에 마우스를 올리면 `<title>` 로 "시각 · 종류별 수".
  - `FpsLine`: 평균 FPS 선과 30 점선, 30 미만 비율은 아래쪽 옅은 막대. 데이터 없는 시간대는 선을 끊는다.

- [ ] **Step 4: `OpsDashboard.tsx` 구현**

  위에서 아래로:
  1. 머리줄: `[{envLabel()} DB]` 배지, 기간 버튼 4개(기본 24시간), 새로고침 버튼, 마지막 갱신 시각. 열려 있는 동안 60초마다 다시 받는다(창을 닫으면 멈춤).
  2. 요약 타일 4개: 보낸 사람(`summary.users`), 에러(`errors` 와 `4xx / 5xx`), FPS 30 미만 비율(`low_minutes / fps_minutes`, 분모 0 이면 `–`), FPS 중앙값.
  3. 그래프 2개 (`ErrorBars`, `FpsLine`)
  4. 상위 에러 표: 종류 · 코드 · 대상 · 횟수 · 사람 수 · 마지막 발생. 줄을 누르면 아래로 펼쳐 `diagnose` 결과(title·meaning·causes·steps, 없으면 "진단표에 없는 에러")와 detail·장소·브라우저·버전, **"AI 프롬프트 복사"** 버튼(`navigator.clipboard.writeText(buildPrompt(row, env))`, 복사되면 버튼 글자가 "복사됨" 2초).
  5. FPS 이상치 표: 시각 · 장소 · 평균/최저 · 30 미만 초 · 브라우저/OS · 그래픽 카드 · 버전.
  - 불러오는 중, 에러(팀이 아니면 "팀만 볼 수 있어요"), 기록 없음 상태를 각각 문구로.

- [ ] **Step 5: 빌드·린트** — Expected: 오류 0

- [ ] **Step 6: 커밋** — `feat: 운영 대시보드 화면 추가 (에러·FPS 그래프, 진단, AI 프롬프트)`

---

### Task 8: 설정의 관리자 탭과 넓은 창

**Files:**
- Create: `src/ops/OpsSettingsTab.tsx`
- Modify: `src/menu/panelTypes.ts` (`| { kind: 'ops' } // 관리자 대시보드 (팀만, #590)`), `src/menu/InfoPanel.tsx` (TITLE `ops: '관리자 대시보드'`, `wide` 조건에 `ops`, `<SettingsView myId={myId} onOpen={open} />`, `{view.kind === 'ops' && <OpsDashboard />}`), `src/menu/SettingsView.tsx` (props, 탭)

**Interfaces:**
- Consumes: `useIsTeam(myId)` (`src/report/useIsTeam.ts`), `fetchDashboard` (Task 7), `OpsDashboard`
- Produces: `SettingsView({ myId, onOpen }: { myId: string; onOpen: (v: PanelView) => void })`, `OpsSettingsTab({ onOpen }: { onOpen: () => void })`

- [ ] **Step 1: `SettingsView` 탭**

  `TABS` 는 그대로 두고, 팀이면 `['ops', '관리자']` 를 뒤에 붙인 목록을 쓴다(`Tab` 타입에 `'ops'` 포함). 파일 머리 주석의 탭 목록에 "관리자 (팀만) 운영 대시보드 요약과 열기 (#590)" 한 줄. `SettingsView` 를 부르는 곳은 `InfoPanel` 하나뿐이다(확인함).

- [ ] **Step 2: `OpsSettingsTab`**

  최근 24시간 `fetchDashboard('24h')` 로 타일 3개(보낸 사람, 에러, FPS 30 미만 비율)와 `[{env} DB]` 배지, "관리자 대시보드 열기" 버튼(`onOpen()` → `InfoPanel` 의 `open({ kind: 'ops' })`, "← 뒤로" 로 설정에 돌아옴). 한 줄 안내: "팀원에게만 보이는 탭이에요. 기록은 90일 보관해요."

- [ ] **Step 3: 빌드·린트** — Expected: 오류 0

- [ ] **Step 4: 커밋** — `feat: 설정에 팀 전용 관리자 탭과 대시보드 창 추가`

---

### Task 9: 서비스 DB 에서 끝까지 확인, 문서

**Files:**
- Modify: `CLAUDE.md` 폴더 구조 (`report/` 다음 줄에 `ops/  운영 대시보드 (화면 에러·FPS 1분 기록, 설정 → 관리자 탭, #590. opsLogic.ts·diagnosis.ts 는 순수 로직)`)

- [ ] **Step 1: 사용자에게 0071 적용 요청**

  서비스 DB(`lkvsbdbssrictnrxmdig`) SQL Editor 에 0071 을 붙여 실행하도록 안내하고(클립보드에 복사), `./scripts/check-db.sh` 로 `ops_report`·`ops_dashboard` 가 생겼는지 확인한다. (check-db.sh 가 마이그레이션 파일에서 객체를 읽으므로 브랜치의 커밋 기준 `./scripts/check-db.sh .env.local HEAD`)

- [ ] **Step 2: 개발 서버에서 일부러 만들기**

  `npm run dev`, 팀 계정으로 로그인.
  | 만들 것 | 방법 | 대시보드에서 기대 |
  |---|---|---|
  | Supabase 4xx | 화면에서 실제로 4xx 가 나는 흐름 하나를 쓴다(예: 다른 사람이 앉은 좌석을 키오스크로 지정). 개발자 도구 콘솔에서 직접 `fetch` 하면 감시를 지나가지 않으니 쓰지 않는다. 어떤 흐름이 4xx 인지는 Network 탭으로 먼저 확인 | 상위 에러에 그 대상·코드, 진단표 설명 |
  | 화면 오류 | 개발자 도구 콘솔에서 `setTimeout(() => { throw new Error('ops test') })` | `js` `error` `ops test` |
  | 중계 끊김 | Network 탭에서 Offline 30초 → 다시 Online | `relay` `1006` 또는 `TIMED_OUT` |
  | FPS 저하 | 개발자 도구 Performance → CPU 6x slowdown 으로 광장 2분 | FPS 이상치 표에 그 분, 장소 `plaza` |
  각각 1~2분 안에 대시보드(24시간)에 나오는지 본다. 프롬프트 복사 → 붙여 넣어 내용 확인.

- [ ] **Step 3: 팀이 아닌 계정**

  게스트로 들어가 설정에 "관리자" 탭이 없는지 확인. 개발자 도구에서 팀 아닌 세션으로 `ops_dashboard` 를 부를 수단이 없으므로 DB 쪽은 Task 1 확인으로 갈음한다.

- [ ] **Step 4: 개인정보 확인**

  Network 탭에서 `ops_report` 요청 본문을 열어 닉네임·이메일·채팅·트래킹 값이 없는지 본다.

- [ ] **Step 5: `CLAUDE.md` 한 줄, 린트·빌드, 커밋** — `docs: 폴더 구조에 운영 대시보드(ops) 추가`

- [ ] **Step 6: 사용자에게 넘기기**

  push·PR 은 사용자가 한다. PR 본문 초안(첫 줄 `Closes #590`, 무엇을 바꿨나·고친 파일·**적용할 DB: 서비스 0071(머지 전), 운영은 main 전**·확인·한계·김현 님 리뷰 요청(`SettingsView.tsx`))을 만들어 보여 준다. 운영 Supabase Pro 전환은 사용자가 대시보드에서 한다.
