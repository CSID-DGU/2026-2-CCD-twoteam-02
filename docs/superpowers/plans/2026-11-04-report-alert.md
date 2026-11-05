# 신고 Slack 알림과 심각도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 신고를 1분 안팎으로 신고 전용 Slack 채널에 알리고, 팀이 신고 목록에서 심각도를 지정하고 걸러 보게 한다.

**Architecture:** `reports`에 `severity`, `notified_at` 칸을 더한다. `pg_cron`이 안 보낸 신고가 있을 때만 Edge Function `report-alert`를 부르고, 함수가 Slack 전송에 성공하면 `notified_at`을 기록한다. 화면은 `src/report/`에 심각도 표시, 지정, 필터를 더한다.

**Tech Stack:** PostgreSQL, Supabase Edge Function(Deno), `pg_cron`, `pg_net`, Slack Incoming Webhook, React 19, TypeScript. 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-04-report-alert-design.md`

**Issue:** #471

## Global Constraints

- 브랜치: `feat/simho/report-alert`. `git push`와 PR 생성은 하지 않는다. 커밋까지만 한다.
- 커밋 메시지: 한국어 `종류: 설명`, 왜 바꿨는지 개조식 본문, 끝에 `Claude-Session: https://claude.ai/code/session_01HDZYmsBJEDsDq7jxrnwT3f`
- 서비스 Supabase(`lkvsbdbssrictnrxmdig`)에만 적용한다. 실험 DB와 `experiment` 브랜치는 건드리지 않는다.
- Slack에 닉네임, 사용자 id, `samples`, 브라우저 정보, 좌석 이용 기록 id를 보내지 않는다.
- 비밀값(`REPORT_SLACK_WEBHOOK_URL`, `CRON_SECRET`)을 저장소에 넣지 않는다. 커밋 전마다 `git diff --cached`에서 `hooks.slack.com`, `sb_secret`을 검색한다.
- `src/space/`, `src/tracking/`, `src/focus/`, `src/App.tsx`는 수정하지 않는다.
- 저장소에 테스트 도구가 없으므로 검사 코드는 scratchpad에 두고 커밋하지 않는다. Node 26은 `.ts`를 직접 실행한다.
- 대시보드 조작과 SQL 실행은 사용자가 한다. 코드 주석은 한국어로 쓴다.

## Review Focus

1. 설명이 비어 있거나 공백·줄바꿈뿐인 신고: `(설명 없음)`으로 표시한다. (Task 2)
2. 200자 경계의 `<`, `&`, 이모지: 자른 뒤 이스케이프해 `&lt;`가 잘리지 않고, 이모지가 반으로 깨지지 않는다. (Task 2)
3. 브라우저가 넣는 `context`가 `null`, 배열, 숫자이거나 `branch`가 객체인 경우: 오류 없이 `-`로 표시한다. (Task 2)
4. Slack 전송 후 기록이 실패한 경우: 오류로 끝나고 다음 실행 때 다시 보낸다. (Task 2)
5. 팀 계정이 API로 `notified_at`을 바꾸거나 사용자가 insert에 `severity`를 넣는 경우: 권한 오류로 거절한다. (Task 1)

---

### Task 1: 마이그레이션과 권한

**Files:**
- Create: `supabase/migrations/0064_report_alert.sql`
- Test: `<scratchpad>/v471/db.sql`, `<scratchpad>/v471/run.sh` (기존 `<scratchpad>/v415/stub.sql` 재사용, 커밋 안 함)

**Interfaces:**
- Produces: `reports.severity`(`critical`, `normal`, `low`, `null`), `reports.notified_at`, 인덱스 `reports_unnotified_idx`

- [ ] **Step 1: #471을 In Progress로 옮기고 번호 재확인**

`git fetch origin`으로 `origin/develop`의 마지막 번호를 본다. `0064`가 이미 있으면 다음 번호를 쓴다. 진행판은 `gh project item-edit`로 옮기고, 권한 오류면 사용자에게 알린다.

- [ ] **Step 2: 검사 SQL 작성**

`v415/test.sql`의 사용자 생성과 `set role` 방식을 따른다. 사용자 a, 팀 t(`team_members` 등록), 기존 신고 1건을 넣은 뒤 `0064`를 적용하고 확인한다. 예외 코드를 잡아 `기대 | 결과`로 출력한다.

| 확인 | 기대 |
|---|---|
| `0064` 이전 신고의 `notified_at` | 채워짐 |
| a의 새 신고 insert | 성공, `notified_at`과 `severity`는 `null` |
| a가 insert에 `severity` 포함 | `42501` |
| a가 insert에 `notified_at` 포함 | `42501` |
| a가 자기 신고의 `severity` update | 0행 변경 (RLS) |
| t가 `severity = 'critical'` update | 1행 변경 |
| t가 `severity = null` update | 1행 변경 |
| t가 `severity = 'urgent'` update | `23514` |
| t가 `notified_at` update | `42501` |
| `service_role`이 `notified_at` update | 성공 |
| 안 보낸 신고 조회 `explain` | `set enable_seqscan = off`에서 `reports_unnotified_idx` 사용 |

- [ ] **Step 3: 파일 없이 실행해 실패 확인**

Run: `bash <scratchpad>/v471/run.sh`
Expected: `severity` 칸이 없다는 오류

- [ ] **Step 4: `0064_report_alert.sql` 작성**

`begin; ... commit;`으로 감싸고 뒤에 `notify pgrst, 'reload schema';`를 둔다. 머리 주석에 실행 위치(서비스 프로젝트만)와 #471을 적는다. 본문은 스펙 "DB" 절의 SQL 그대로다.

- [ ] **Step 5: 검사 통과 확인**

Run: `bash <scratchpad>/v471/run.sh`
Expected: 위 표가 모두 기대대로 나옴. 마지막에 임시 컨테이너를 지움.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0064_report_alert.sql
git commit  # feat: 신고에 심각도와 Slack 알림 시각 칸 추가
```

### Task 2: 알림 순수 로직

**Files:**
- Create: `supabase/functions/report-alert/lib.ts`
- Test: `<scratchpad>/v471/lib.test.ts` (커밋 안 함)

**Interfaces:**
- Produces:
  - `type UnsentReport = { id: string; created_at: string; kind: 'judgment' | 'bug' | 'other'; detail: 'false_alarm' | 'missed' | 'unsure' | null; message: string; context: unknown }`
  - `MAX_BATCH = 50`, `MAX_DETAILED = 5`, `MAX_MESSAGE_CHARS = 200`, `MAX_BRANCH_CHARS = 30`
  - `escapeSlack(text: string): string`
  - `buildAlertText(rows: UnsentReport[]): string`
  - `runAlert(deps: { fetchUnsent: () => Promise<UnsentReport[]>; send: (text: string) => Promise<void>; markSent: (ids: string[]) => Promise<void> }): Promise<{ sent: number }>`

- [ ] **Step 1: `node:test` 검사 작성**

```ts
test('전체 멘션과 가짜 링크는 글자로만 남는다', () => {
  const t = buildAlertText([row({ message: '<!channel> <http://x|y> a&b' })])
  assert.ok(t.includes('&lt;!channel&gt; &lt;http://x|y&gt; a&amp;b'))
  assert.ok(!t.includes('<!channel>'))
})
test('자른 뒤 이스케이프한다', () => {
  const t = buildAlertText([row({ message: '<'.repeat(250) })])
  assert.equal(t.match(/&lt;/g)!.length, 200)
})
test('이모지를 반으로 자르지 않는다', () => {
  assert.ok(!buildAlertText([row({ message: '😀'.repeat(250) })]).includes('�'))
  assert.equal(buildAlertText([row({ message: '😀'.repeat(250) })]).match(/😀/g)!.length, 200)
})
test('빈 설명', () => {
  for (const message of ['', '  \n ']) assert.ok(buildAlertText([row({ message })]).includes('> (설명 없음)'))
})
test('줄바꿈은 공백으로 바뀌어 인용 줄을 벗어나지 않는다', () => {
  assert.ok(buildAlertText([row({ message: 'a\n*b*\nc' })]).includes('> a *b* c'))
})
test('context 모양이 달라도 지점은 -', () => {
  for (const context of [null, [], 3, { branch: {} }, {}]) assert.ok(buildAlertText([row({ context })]).includes(' · - · '))
})
test('지점은 30자까지, 이스케이프함', () => {
  const t = buildAlertText([row({ context: { branch: '<'.repeat(40) } })])
  assert.equal(t.match(/&lt;/g)!.length, 30)
})
test('종류와 보조 선택, 한국 시간', () => {
  const t = buildAlertText([row({ kind: 'judgment', detail: 'false_alarm', created_at: '2026-11-04T07:20:00Z' })])
  assert.ok(t.includes('판정 오류(공부 중인데 노랑·빨강)'))
  assert.ok(t.includes('11/04 16:20'))
})
test('6건이면 5건만 자세히, 외 1건', () => {
  const t = buildAlertText(Array.from({ length: 6 }, () => row()))
  assert.ok(t.startsWith('🐞 새 신고 6건'))
  assert.equal(t.match(/^• /gm)!.length, 5)
  assert.ok(t.includes('외 1건'))
  assert.ok(t.includes('https://twoteam.vercel.app'))
})
test('개인 정보 칸은 싣지 않는다', () => {
  const t = buildAlertText([{ ...row(), user_id: 'USERID', samples: ['S'], context: { branch: 'plaza', userAgent: 'UA', sessionId: 'SID' } } as UnsentReport])
  for (const s of ['USERID', 'UA', 'SID']) assert.ok(!t.includes(s))
})
test('없으면 보내지 않는다', async () => { /* send, markSent 호출 0회, sent 0 */ })
test('성공하면 읽은 id를 모두 기록한다', async () => { /* 6건이면 send 1회, markSent에 id 6개, sent 6 */ })
test('send 실패면 기록하지 않고 오류를 던진다', async () => { /* assert.rejects, markSent 0회 */ })
test('markSent 실패면 오류를 던져 다음 실행에 다시 보낸다', async () => { /* assert.rejects */ })
```

- [ ] **Step 2: 실패 확인**

Run: `node --test <scratchpad>/v471/lib.test.ts`
Expected: FAIL, `lib.ts`를 찾을 수 없음

- [ ] **Step 3: `lib.ts` 구현**

이 파일은 Deno 전용 API와 외부 패키지를 쓰지 않는다. 종류와 보조 선택 문구는 `src/report/reportLogic.ts`의 `KIND_LABEL`, `DETAIL_LABEL`과 같게 두고, Edge Function이 `src/`를 가져올 수 없어서 복사한다고 주석에 적는다. 글자 수는 `Array.from`으로 세어 이모지를 깨지 않는다. 처리 순서는 줄바꿈 정리 → 자르기 → `escapeSlack`이다. 시각은 `Intl.DateTimeFormat`의 `Asia/Seoul`로 `MM/DD HH:mm` 모양을 만든다. 메시지 모양은 스펙 "메시지" 절을 따른다.

- [ ] **Step 4: 통과 확인**

Run: `node --test <scratchpad>/v471/lib.test.ts`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/report-alert/lib.ts
git commit  # feat: 신고 알림 메시지와 재시도 순수 로직 추가
```

### Task 3: Edge Function

**Files:**
- Create: `supabase/functions/report-alert/index.ts`

**Interfaces:**
- Consumes: Task 2의 `runAlert`, `buildAlertText`, `MAX_BATCH`, `UnsentReport`
- Produces: `POST /functions/v1/report-alert`. 헤더가 맞으면 `{ sent: number }`, 틀리면 401, 실패하면 500과 `{ error: string }`

- [ ] **Step 1: `index.ts` 구현**

`usage-monitor/index.ts`의 `createClient`와 `x-monitor-secret` 확인 방식을 따른다.

- `fetchUnsent`: `id, created_at, kind, detail, message, context`만 고른다. `notified_at is null`, 오래된 순, `MAX_BATCH`개.
- `send`: `REPORT_SLACK_WEBHOOK_URL`로 `{ text, unfurl_links: false, unfurl_media: false }`를 POST한다. `AbortSignal.timeout(10_000)`을 쓰고, 응답이 2xx가 아니면 오류를 던진다. 주소가 비어 있으면 오류를 던진다. 오류 문구와 로그에 웹훅 주소를 넣지 않는다.
- `markSent`: `.update({ notified_at: new Date().toISOString() }).in('id', ids)`. 오류면 던진다.

- [ ] **Step 2: 타입 검사**

Run: `docker run --rm -v "$PWD/supabase/functions/report-alert:/app" -w /app denoland/deno:2 check index.ts`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add supabase/functions/report-alert/index.ts
git commit  # feat: 새 신고를 Slack으로 보내는 report-alert 함수 추가
```

함수를 실제 DB, Slack과 연결한 확인은 Task 4에서 한다.

### Task 4: 서비스 적용과 실제 알림 확인 (사용자 작업 포함)

**Files:**
- Create: `<scratchpad>/v471/cron.sql` (`<CRON_SECRET>` 자리표시자가 든 예약 작업 SQL, 커밋 안 함)

**Interfaces:**
- Consumes: Task 1의 마이그레이션, Task 3의 함수

여기서 멈추고 사용자에게 아래를 순서대로 안내한다. 메뉴 이름과 입력값을 구체적으로 적는다.

- [ ] **Step 1: 사용자가 Slack 채널과 웹훅 생성**

신고 전용 채널을 만들고 Incoming Webhook을 추가한 뒤, 주소를 Supabase 대시보드 Edge Functions > Secrets에 `REPORT_SLACK_WEBHOOK_URL`로 등록한다. 주소를 대화에 붙여 넣지 않게 안내한다.

- [ ] **Step 2: 사용자가 `0064` 실행 후 Claude가 확인**

Run: `supabase db query --linked --output json "select count(*) filter (where notified_at is null) as unsent, count(*) as total from public.reports;"`
Expected: `unsent` 0, `total`은 기존 신고 수

- [ ] **Step 3: 사용자가 함수 배포**

Run: `supabase functions deploy report-alert --no-verify-jwt`
Expected: 배포 성공. 그다음 틀린 비밀값으로 `curl -X POST -H 'x-monitor-secret: wrong' <함수 주소>`를 보내면 401.

- [ ] **Step 4: 사용자가 예약 작업 등록**

`cron.sql`의 `<CRON_SECRET>`을 실제 값으로 바꿔 SQL Editor에서 실행한다. 값은 사용자가 대시보드 Integrations > Cron의 `usage-monitor-check` 명령에서 직접 확인한다. Claude는 `cron.job.command`를 조회하지 않는다.

- [ ] **Step 5: 실제 신고로 확인**

사용자가 서비스에서 시험 신고를 보낸다. `<!channel>`을 글에 넣어 함께 확인한다.

Expected: 2분 안에 신고 전용 채널에 메시지가 오고 전체 멘션은 동작하지 않는다. 사용량 채널에는 오지 않는다. `notified_at`이 채워지고, 다음 1분에는 같은 알림이 오지 않는다. 시험 신고는 확인함으로 처리한다.

Run: `supabase db query --linked --output json "select j.jobname, d.status, count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'report-alert' and d.start_time > now() - interval '10 minutes' group by 1, 2;"`
Expected: `succeeded`만 있음

### Task 5: 신고 목록의 심각도

**Files:**
- Modify: `src/report/reportLogic.ts`
- Modify: `src/report/useReports.ts`
- Modify: `src/report/ReportsPanel.tsx`
- Test: `<scratchpad>/v471/logic.test.ts` (커밋 안 함)

**Interfaces:**
- Consumes: `reports.severity`
- Produces:
  - `type Severity = 'critical' | 'normal' | 'low'`
  - `SEVERITY_LABEL: Record<Severity, string>` = 긴급, 보통, 낮음
  - `severityBadge(s: Severity | null): string` = `🔴 긴급`, `🟡 보통`, `🟢 낮음`, `⚪ 미지정`
  - `ReportRow.severity: Severity | null`
  - `Filter.severity: Severity | 'none' | 'all'`, `DEFAULT_FILTER.severity = 'all'`
  - `useReports().setSeverity(id: string, severity: Severity | null): Promise<string | null>`

- [ ] **Step 1: 실패하는 검사 작성**

```ts
const base = { kind: 'all', checked: 'all' } as const
test('심각도 필터', () => {
  const rows = [r('critical'), r('low'), r(null)]
  assert.equal(applyFilter(rows, { ...base, severity: 'all' }).length, 3)
  assert.deepEqual(applyFilter(rows, { ...base, severity: 'none' }).map((x) => x.severity), [null])
  assert.deepEqual(applyFilter(rows, { ...base, severity: 'critical' }).map((x) => x.severity), ['critical'])
})
test('다른 필터와 함께 걸린다', () => { /* severity critical + checked unchecked 조합 */ })
test('기본 필터', () => assert.deepEqual(DEFAULT_FILTER, { kind: 'all', checked: 'unchecked', severity: 'all' }))
test('신호등 표시', () => { /* 네 값 모두 위 Interfaces 문구와 같음 */ })
```

- [ ] **Step 2: 실패 확인**

Run: `node --test <scratchpad>/v471/logic.test.ts`
Expected: FAIL

- [ ] **Step 3: `reportLogic.ts`에 타입, 표시, 필터 구현**

- [ ] **Step 4: 통과 확인**

Run: `node --test <scratchpad>/v471/logic.test.ts`
Expected: 모두 PASS

- [ ] **Step 5: `useReports.ts`에 `setSeverity` 추가**

`setChecked`와 같은 방식으로 `.update({ severity })`한 뒤 목록을 자리에서 바꾼다. 실패 문구는 `심각도를 바꾸지 못했습니다: ...`이다. 조회는 그대로 `select('*')`다.

- [ ] **Step 6: `ReportsPanel.tsx`에 표시, 지정, 필터 추가**

필터 줄의 확인 뒤에 심각도 `select`(전체, ⚪ 미지정, 🔴 긴급, 🟡 보통, 🟢 낮음)를 둔다. 목록 줄에는 `severityBadge`를 종류 앞에 둔다. 펼친 영역의 `actions`에서 "확인함" 버튼 왼쪽에 심각도 `select`를 둔다. 실패 문구는 기존 `rowError`로 띄운다. 파일 머리 주석도 고친다.

- [ ] **Step 7: 린트와 빌드**

Run: `npm run lint && npm run build`
Expected: 둘 다 통과

- [ ] **Step 8: 사용자가 화면 확인**

`npm run dev`를 띄우고 팀 계정으로 메뉴 > 신고 목록을 연다. 심각도 지정, 미지정으로 되돌리기, 새로고침 후 유지, 심각도별 필터, 미확인과의 조합을 확인한다. 이 단계가 끝난 뒤 커밋한다.

- [ ] **Step 9: 커밋**

```bash
git add src/report/reportLogic.ts src/report/useReports.ts src/report/ReportsPanel.tsx
git commit  # feat: 신고 목록에 심각도 신호등 표시, 지정, 필터 추가
```

### Task 6: PR 준비

**Files:**
- Create: `<scratchpad>/pr-report-alert.md` (커밋 안 함)

- [ ] **Step 1: 최신 `develop`과 비교**

`git fetch origin` 후 `git merge-tree --write-tree origin/develop HEAD`로 충돌을 보고 번호 겹침을 확인한다. 겹치면 사용자에게 먼저 알린다.

- [ ] **Step 2: PR 본문 작성**

첫 줄은 `Closes #471`이다. 무엇을 바꿨나, 고친 파일, DB(서비스 DB, `0064`, 적용 완료 여부), 확인, 한계 순서로 쓰고 끝에 `https://claude.ai/code/session_01HDZYmsBJEDsDq7jxrnwT3f`를 넣는다. 예약 작업 SQL은 비밀값이 있어 저장소에 없다고 적는다.

- [ ] **Step 3: 사용자에게 push, PR, 머지 명령 전달**

머지 후 #471 완료 댓글, 브랜치 정리를 진행한다.
