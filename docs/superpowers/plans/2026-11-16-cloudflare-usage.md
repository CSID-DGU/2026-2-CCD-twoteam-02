# Cloudflare 하루 사용량 모니터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `usage-monitor`가 Cloudflare Worker·Durable Objects의 하루 사용량도 재서, 80·95·100%를 넘으면 Supabase 경고와 같은 Slack 메시지로 알리고 아침 요약에 어제 하루 값을 싣는다.

**Architecture:** 새 파일 `cloudflare.ts`에 한도, UTC 하루 계산, GraphQL 질의 생성, 응답 변환, 경고 판단을 순수 로직으로 둔다. 네트워크 호출은 `fetch`를 인자로 받는 `queryCloudflare()` 하나로 모아 가짜 `fetch`로 검사한다. `index.ts`는 이 함수를 `check`, `summary`, `discover`에 연결만 한다.

**Tech Stack:** Supabase Edge Function(Deno), Cloudflare GraphQL Analytics API, Slack Incoming Webhook. 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-16-cloudflare-usage-design.md`

**Issue:** #574

## Global Constraints

- 브랜치: `feat/simho/cloudflare-usage`. `git push`와 PR 생성은 하지 않는다. 커밋까지만 한다.
- 커밋 메시지: 한국어 `종류: 설명`, 왜 바꿨는지 개조식 본문, 끝에 `Claude-Session: https://claude.ai/code/session_01HDZYmsBJEDsDq7jxrnwT3f`
- 경고 단계: 80·95·100%. 기간: UTC 하루(한국 09:00 ~ 다음 날 09:00).
- 한도: `cf_worker_requests` 100,000 · `cf_do_requests` 100,000 · `cf_do_duration_gbs` 13,000 · `cf_do_rows_read` 5,000,000 · `cf_do_rows_written` 100,000 · `cf_do_storage_bytes` 5GB. `CF_LIMITS_JSON`으로 덮어쓴다.
- 비밀값 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`는 Supabase 비밀값에만 둔다. 오류 문구·응답 JSON·Slack에 토큰이 나가지 않는다. 커밋 전마다 `git diff --cached`에서 토큰 모양 문자열과 `hooks.slack.com`을 찾는다.
- DB 마이그레이션 없음. `usage_monitor_alerts_sent`에 `cycle_start = UTC 날짜`, `metric = cf_...`로 쓴다.
- `relay/` 코드, 실험 DB, `experiment` 브랜치는 건드리지 않는다.
- 검사 코드는 `<scratchpad>/v574/`에 두고 커밋하지 않는다. Node 26은 `.ts`를 직접 실행한다(`node --test`). 함수 타입 검사는 `docker run --rm -v "$PWD/supabase/functions/usage-monitor:/app" -w /app denoland/deno:latest deno check --no-lock index.ts`.
- 배포, 비밀값 등록, 대시보드 조작은 사용자가 한다. 코드 주석은 한국어로 쓴다.

## Review Focus

1. 그날 요청이 하나도 없어 응답 행이 비어 있음: `null`(수집 안 됨)이 아니라 `0`으로 본다. (Task 1)
2. HTTP 200인데 GraphQL `errors`가 오고 `data`가 `null`인 데이터셋: 그 데이터셋 지표만 수집 안 됨, 나머지 데이터셋은 정상 값. 원인은 `errors`에 한 줄. (Task 1)
3. Cloudflare 오류 문구에 토큰이 그대로 들어 있음: `***`로 가려서 남긴다. (Task 1)
4. 한국 시각 08:59와 09:00: 앞은 전날 UTC 날짜, 뒤는 새 UTC 날짜로 계산한다. (Task 1)
5. 표본 추정 때문에 WebSocket 메시지 수가 DO 요청 수보다 큼: 환산값이 음수가 되지 않는다. (Task 1)

---

### Task 1: `cloudflare.ts` 순수 로직과 조회 함수

**Files:**
- Create: `supabase/functions/usage-monitor/cloudflare.ts`
- Test: `<scratchpad>/v574/cloudflare.test.ts` (커밋 안 함)

**Interfaces:**
- Consumes: `lib.ts`의 `newThresholds(pct, thresholds, sent)`, `bar(pct)`, `icon(pct)`, `GB`, `MB`
- Produces:
  - `type CfMetric = "cf_worker_requests" | "cf_do_requests" | "cf_do_duration_gbs" | "cf_do_rows_read" | "cf_do_rows_written" | "cf_do_storage_bytes"`
  - `CF_METRICS: CfMetric[]` (위 순서), `CF_FREE_LIMITS: Record<CfMetric, number>`, `CF_LABELS: Record<CfMetric, string>`, `CF_THRESHOLDS = [80, 95, 100]`
  - `type CfValue = { value: number | null; note?: string; alert: boolean }` — `alert: false`면 참고용 또는 수집 안 됨
  - `type CfResult = { values: Record<CfMetric, CfValue>; errors: string[] }`
  - `parseCfLimits(json: string | undefined): { limits: Record<CfMetric, number>; error: string | null }`
  - `utcDay(now: Date, offsetDays: 0 | -1): { date: string; start: string; end: string }` — `date`는 `YYYY-MM-DD`, `start`·`end`는 ISO. 오늘(0)은 `end = now`, 어제(-1)는 `end = 그날 23:59:59Z`
  - `queryCloudflare(o: { fetch: typeof fetch; token?: string; accountId?: string; now: Date; offsetDays: 0 | -1; timeoutMs?: number }): Promise<CfResult>`
  - `cfDiscover(o: { fetch: typeof fetch; token?: string; accountId?: string }): Promise<unknown>` — 데이터셋별 sum·max 타입과 filter 입력 타입의 필드 이름 목록
  - `cfAlertLine(metric: CfMetric, v: number, limit: number, indent: string): string` — 기존 `line()`과 같은 모양
  - `fmtCf(metric: CfMetric, v: number): string` — 저장 용량은 GB·MB, 실행 시간은 `GB-s`, 나머지는 천 단위 쉼표
  - `cfOverview(values: Record<CfMetric, CfValue>, limits: Record<CfMetric, number>): string | null`

**질의 구성 (문서 기준 첫 추정값, Task 3의 `discover`로 확정):**

| 데이터셋 | 블록 | 필드 → 원시 키 | 기간 필터 |
|---|---|---|---|
| `workersInvocationsAdaptive` | `sum` | `requests` → `workerRequests` | `datetime_geq`, `datetime_leq` |
| `durableObjectsInvocationsAdaptiveGroups` | `sum` | `requests` → `doRequests` | `datetime_geq`, `datetime_leq` |
| `durableObjectsPeriodicGroups` | `sum` | `activeTime` → `doActiveUs`, `inboundWebsocketMsgCount` → `doWsIn`, `rowsRead` → `doRowsRead`, `rowsWritten` → `doRowsWritten` | `datetimeHour_geq`, `datetimeHour_leq` |
| `durableObjectsSqlStorageGroups` | `max` | `storedBytes` → `doStoredBytes` | `date_geq`, `date_leq` |

- 데이터셋마다 **따로 요청**한다. GraphQL은 필드 하나가 틀려도 문서 전체를 거절하므로, 하나가 틀려도 나머지는 받기 위해서다. 질의 모양: `query($a: string!, $s: Time!, $e: Time!) { viewer { accounts(filter: {accountTag: $a}) { d: <데이터셋>(limit: 10000, filter: {<geq>: $s, <leq>: $e}) { <블록> { <필드들> } } } } }`. `date` 필터는 `Date` 타입과 날짜 문자열을 쓴다.
- 한도는 계정 전체에 걸리므로 `scriptName`으로 거르지 않고 계정 합계를 쓴다(지금 Worker는 `twoteam-relay` 하나라 값은 같다).
- 저장 용량은 누적 값이라 `offsetDays`와 상관없이 항상 `utcDay(now, 0).date`로 묻는다(요약에서 "지금 값").
- 행이 여러 개면 `sum`은 더하고 `max`는 최댓값을 쓴다. 행이 없으면 0이다.
- 변환: `cf_do_duration_gbs = doActiveUs / 1e6 × 0.125`. `doWsIn`이 있으면 `cf_do_requests = max(0, doRequests − doWsIn) + doWsIn / 20`, `alert: true`, `note`에 원시값. 없으면 `value = doRequests`, `alert: false`, `note = "WebSocket 메시지를 나눠 셀 수 없어 참고용"`. 원시 키가 없는 지표는 `value: null`, `alert: false`, `note: "수집 안 됨"`.
- 토큰이나 계정 id가 없으면 `fetch`를 부르지 않고 모든 지표를 수집 안 됨으로, `errors = ["Cloudflare 설정 없음"]`.
- 실패 원인(HTTP 상태, GraphQL `errors[0].message` 앞 200자, 시간 초과)은 `"<데이터셋>: <원인>"` 한 줄로 남기고, 토큰 문자열은 `***`로 바꾼다. 시간 제한은 `AbortSignal.timeout(timeoutMs ?? 10000)`.
- `cfOverview`: 경고 대상(`alert: true`, 값 있음) 중 가장 높은 %를 고른다. 80% 미만이면 `Cloudflare 어제 가장 높은 항목은 <라벨> <n>%예요.`, 80% 이상이면 `Cloudflare 어제 <라벨>이(가) 한도의 <n>% — 월 $5 플랜 검토`(조사는 `lib.ts`의 `iGa`), 대상이 없으면 `null`.

- [ ] **Step 1: 실패하는 검사 작성**

`<scratchpad>/v574/cloudflare.test.ts`. 가짜 `fetch`는 요청 본문의 데이터셋 이름을 보고 미리 정한 JSON을 돌려주고, 부른 횟수와 `Authorization` 헤더를 기록한다.

| 검사 이름 | 확인 |
|---|---|
| `utcDay: KST 08:59는 전날, 09:00은 새 날` | `2026-11-16T23:59:00Z` → `date = "2026-11-16"`, `2026-11-17T00:00:00Z` → `"2026-11-17"` |
| `utcDay: 어제는 하루 전체` | `offsetDays: -1`, `now = 2026-11-17T00:07Z` → `start = 2026-11-16T00:00:00.000Z`, `end = 2026-11-16T23:59:59.000Z` |
| `parseCfLimits: 덮어쓰기와 잘못된 JSON` | `'{"cf_do_requests":1000000}'` → 그 값만 바뀜. `'{'` → 기본값, `error`가 문자열 |
| `설정 없음이면 fetch 안 부름` | 토큰 없음 → 호출 0회, `errors = ["Cloudflare 설정 없음"]`, 모든 값 `null` |
| `정상 응답 변환` | `requests` 34000, DO `requests` 50000, `inboundWebsocketMsgCount` 40000, `activeTime` 3.6e9, `rowsRead` 1000, `rowsWritten` 10, `storedBytes` 2048 → 34000 / 12000(`alert: true`) / 450 / 1000 / 10 / 2048, `errors` 비어 있음, 헤더 `Bearer <토큰>` |
| `행이 여럿이면 sum은 합, max는 최댓값` | Worker 행 2개(10, 20) → 30. storedBytes 행 2개(5, 9) → 9 |
| `행이 없으면 0` | 모든 데이터셋 빈 배열 → 값 0, `null` 아님 |
| `WebSocket 필드가 없으면 DO 요청은 참고용` | periodic 응답에 `inboundWebsocketMsgCount` 없음 → `cf_do_requests.alert = false`, 값은 원시 DO 요청 |
| `WebSocket이 요청보다 많아도 음수 아님` | DO 30, ws 100 → 5 |
| `한 데이터셋 GraphQL 오류는 그 지표만 빠짐` | periodic만 `{data:null, errors:[{message:"unknown field rowsRead"}]}` → 실행 시간·행 지표 `null`, Worker·저장 용량 정상, `errors`에 `durableObjectsPeriodicGroups: unknown field rowsRead` |
| `HTTP 오류와 시간 초과` | 403 → `errors`에 `403`, 응답하지 않는 `fetch` + `timeoutMs: 50` → 시간 초과 한 줄, 예외가 밖으로 나오지 않음 |
| `오류 문구의 토큰은 가림` | 오류 메시지에 토큰 포함 → `errors`에 토큰 없음, `***` 있음 |
| `cfOverview 문구` | 최고 34% → `가장 높은 항목은 Worker 요청 34%`. DO 요청 85% → `한도의 85% — 월 $5 플랜 검토`. 경고 대상 없음 → `null` |
| `fmtCf` | `cf_do_storage_bytes` 2 GiB → `2.00 GB`, `cf_do_duration_gbs` 450 → `450 GB-s`, `cf_worker_requests` 34000 → `34,000` |
| `어제 조회에서도 저장 용량은 오늘 날짜` | `offsetDays: -1`, `now = 2026-11-17T00:07Z` → Worker 요청 변수는 `2026-11-16…`, storage 요청 변수는 `2026-11-17` |

- [ ] **Step 2: 실행해 실패 확인**

Run: `node --test <scratchpad>/v574/cloudflare.test.ts`
Expected: FAIL, `cloudflare.ts`를 찾을 수 없음

- [ ] **Step 3: `cloudflare.ts` 구현**

위 Interfaces와 질의 구성 표대로 쓴다. 데이터셋 표는 파일 위쪽 상수 `CF_DATASETS`로 두어 Task 3에서 필드 이름만 바꾸면 되게 한다.

- [ ] **Step 4: 다시 실행해 통과 확인**

Run: `node --test <scratchpad>/v574/cloudflare.test.ts`
Expected: 15개 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/usage-monitor/cloudflare.ts
git commit   # feat: 사용량 모니터에 Cloudflare 하루 사용량 계산 로직 추가
```

### Task 2: `index.ts`에 연결

**Files:**
- Modify: `supabase/functions/usage-monitor/index.ts` (환경 변수 26~37행 근처, `runCheck` 303~331행, `runSummary` 421~459행, `runDiscover` 461~473행, 머리 주석 1~8행)

**Interfaces:**
- Consumes: Task 1의 Produces 전부
- Produces: `check`·`summary` 응답 JSON에 `cloudflare: CfResult["values"]`, `cloudflare_errors: string[]`. `discover` 응답에 `cloudflare` 키

- [ ] **Step 1: 환경 변수와 한도**

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 읽고, `parseCfLimits(env("CF_LIMITS_JSON"))`의 `error`가 있으면 `check`·`summary`의 `warnings`에 `CF_LIMITS_JSON 형식 오류 → 기본 한도 사용`을 넣는다.

- [ ] **Step 2: `runCheck`**

`queryCloudflare({ now, offsetDays: 0, fetch })`. `cycle_start = utcDay(now, 0).date`로 `alert: true`인 지표만 `CF_THRESHOLDS`와 비교해 새 단계를 기록하고 `cfAlertLine` 아래에 `↳ *N% 단계 도달*`을 붙인다. 메시지는 하나로 보낸다.
- Supabase 경고가 있으면 기존 메시지 끝에 `\n\n☁️ *Cloudflare (오늘 9시부터)*\n<줄들>`
- Cloudflare만 있으면 `🚨 *Cloudflare 사용량 경고* (무료 플랜)\n\n☁️ *Cloudflare (오늘 9시부터)*\n<줄들>\n\n하루 한도는 매일 오전 9시(KST)에 초기화돼요.`
- 조회 실패(`errors`)는 경고를 보내지 않고 응답 JSON에만 남긴다.

- [ ] **Step 3: `runSummary`**

`queryCloudflare({ now, offsetDays: -1, fetch })`. 저장 용량은 Task 1에서 항상 오늘 날짜로 묻기 때문에 따로 부르지 않는다.
- 제목 `📊 *Supabase 일일 점검*` → `📊 *서비스 일일 점검*`
- 사용량 묶음 뒤에 `☁️ *Cloudflare* (어제 YYYY-MM-DD 9시 ~ 오늘 9시, 저장 용량은 지금 값)` 묶음. 값 있으면 `cfAlertLine`, `alert: false`면 `⚪ *라벨 · 참고용*  값` + `note`, `null`이면 `⚪ *라벨*  수집 안 됨`
- `cfOverview`가 문자열이면 "한눈에 보기" 결제 주기 문장 앞에 넣는다(`overview` 배열의 사용량 문장 뒤)
- `errors`는 `⚠️ *수집 오류*`에 `Cloudflare <원인>`으로 더한다

- [ ] **Step 4: `runDiscover`**

기존 결과에 `cloudflare: await cfDiscover({ ... })`를 더한다. Metrics API가 실패해도 Cloudflare 결과는 나오도록 둘을 각각 `try`로 감싼다.

- [ ] **Step 5: 타입 검사와 검사 재실행**

Run: `docker run --rm -v "$PWD/supabase/functions/usage-monitor:/app" -w /app denoland/deno:latest deno check --no-lock index.ts`
Expected: 오류 없음

Run: `node --test <scratchpad>/v574/cloudflare.test.ts`
Expected: 15개 모두 PASS

- [ ] **Step 6: 비밀값 점검 후 커밋**

`git diff --cached | grep -nE 'hooks\.slack\.com|sb_secret|Bearer [A-Za-z0-9_-]{20,}'` 결과가 없어야 한다.

```bash
git add supabase/functions/usage-monitor/index.ts
git commit   # feat: 사용량 경고와 일일 점검에 Cloudflare 사용량 추가
```

### Task 3: 배포와 실제 필드 확인 (사용자와 함께)

**Files:**
- Modify (필요할 때만): `supabase/functions/usage-monitor/cloudflare.ts`의 `CF_DATASETS`

- [ ] **Step 1: 사용자 안내** — 토큰 만들기(Account Analytics: Read 하나), 계정 id 확인, `supabase secrets set`으로 두 값 등록, `supabase functions deploy usage-monitor --no-verify-jwt`. 토큰은 대화창에 붙이지 말라고 함께 적는다.
- [ ] **Step 2: `discover` 호출** — 사용자가 터미널에서 부르고(시크릿 헤더 필요) 결과 JSON을 붙인다. 토큰은 응답에 없다.
- [ ] **Step 3: 필드 확정** — `CF_DATASETS`의 필드·필터 이름과 다르면 고치고, 검사의 가짜 응답도 같은 이름으로 바꿔 Task 1 검사를 다시 통과시킨 뒤 커밋(`fix: Cloudflare 사용량 질의 필드를 실제 응답에 맞춤`)하고 재배포를 안내한다. 같으면 커밋 없음.
- [ ] **Step 4: `summary` 호출** — Slack에서 모양을 보고, 어제 값이 Cloudflare 대시보드(Workers & Pages → `twoteam-relay` → Metrics)와 크게 다르지 않은지 사용자와 확인한다. WebSocket 필드가 있었는지(DO 요청이 경고 대상인지) 결과를 Issue에 남긴다.
- [ ] **Step 5: 실패 확인** — 사용자가 `CLOUDFLARE_ACCOUNT_ID`를 잠시 틀린 값으로 바꿔 `summary`를 부르면, Supabase 부분은 나가고 수집 오류에 Cloudflare 원인이 적힌다. 확인 뒤 원래 값으로 되돌린다.
