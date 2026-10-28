# 오판·버그 신고 버튼과 팀용 신고 목록 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로비·지점의 오른쪽 위 메뉴에 "신고하기"를 두어 사용자가 오판·버그·의견을 최근 30초 판정 수치와 함께 보내고, 팀 세 명만 메뉴 "신고 목록"에서 걸러 보고 확인 표시를 한다. (#121)

**Architecture:** 판정 수치는 `src/report/recentSamples.ts`(순수 고리 버퍼)에 `StudyRunner`가 1초마다 밀어 넣고, 신고 창은 보낼 때 꺼내 읽는다. 신고 창과 신고 목록은 기존 메뉴 창 체계(`PanelView` → `InfoPanel`)에 종류 둘을 더해 띄우므로 `BranchScene`·`LobbyScene`은 손대지 않는다. 저장은 Supabase `reports` 표, 팀 구분은 쓰기 권한이 없는 `team_members` 표와 `is_team()` 함수로 하며 RLS가 실제 권한을 막는다.

**Tech Stack:** React 19, TypeScript(`erasableSyntaxOnly`, `verbatimModuleSyntax`), supabase-js, PostgreSQL RLS. 테스트 도구는 없으므로 순수 로직은 Node 26의 TypeScript 직접 실행(`node --input-type=module -e 'import ... from "./src/report/x.ts"'`)으로 검사한다. 화면은 `npm run lint`·`npm run build`와 브라우저 확인.

**Spec:** `docs/superpowers/specs/2026-10-28-report-button-design.md` (Task 1에서 저장소에 넣는다)

## Global Constraints

- 브랜치 `feat/wonjun/report-button`, `origin/develop`에서 딴다. 작업 폴더는 experiment에 미커밋 변경이 있으므로 worktree로 한다. PR base `develop`.
- 웹캠 영상·사진·화면 캡처는 어떤 형태로도 저장·전송하지 않는다. 수치와 글자만.
- 마이그레이션 `supabase/migrations/0030_reports.sql`은 코드 머지 전에 서비스 Supabase에 실행한다. 실험 프로젝트에는 실행하지 않는다.
- 주석·문구는 한국어, 기준값은 파일 위쪽에 이름 붙인 상수. 판정·계산은 순수 함수로, 화면은 부르기만.
- 다른 팀원 파일 수정은 `panelTypes.ts`·`InfoPanel.tsx`·`SceneMenu.tsx`에 한정하고, 각각 종류·제목·분기·줄 추가만 한다. `StudyRunner.tsx`는 훅 호출 한 줄.
- 커밋 메시지 `feat: 한국어 설명`, 한 커밋에 한 가지. 커밋 전 `npm run lint`·`npm run build` 통과.
- 저장 크기 제한(DB check): message 500자, context 4096바이트, samples 배열 16384바이트. 화면 maxLength는 방어선이 아니다.

## Review Focus

1. 공부 중이 아닐 때(2D 이동·로비) 신고하면 `samples`는 `[]`, `context.status`는 없고 창에 "판정 수치 없음(공부 중이 아님)"이 보여야 한다. — Task 2 `recentSamples` 시각 필터 검사, Task 5 확인 항목.
2. 자리를 떠난 지 30초가 지난 뒤 신고하면 옛 수치가 섞이면 안 된다. — Task 2 "31초 전 줄은 빠진다" 검사.
3. 네트워크 실패·RLS 거부(예: 마이그레이션 미적용) 때 창이 멈추지 않고 한국어 오류와 다시 시도가 보여야 한다. — Task 5 `sendReport`가 오류 문자열을 돌려주는 검사.
4. 팀이 아닌 계정이 API로 `team_members` insert, `reports` update·delete, 남의 `reports` select를 시도하면 모두 거부돼야 한다. — Task 1 확인 절차(브라우저 콘솔 supabase-js).
5. 설명 500자 초과·종류 미선택으로 보내기를 누르면 DB까지 가지 않고 화면에서 막혀야 한다. — Task 3 `validateDraft` 검사.

---

### Task 1: 마이그레이션 `0030_reports.sql`과 설계·계획 문서

**Files:**
- Create: `supabase/migrations/0030_reports.sql`
- Create: `docs/superpowers/specs/2026-10-28-report-button-design.md` (스크래치패드의 설계 문서를 그대로 복사)
- Create: `docs/superpowers/plans/2026-10-28-report-button.md` (이 문서)

**Interfaces:**
- Produces (DB): 표 `public.team_members(user_id uuid pk, added_at timestamptz)`, 함수 `public.is_team() returns boolean`, 표 `public.reports(id uuid, user_id uuid, created_at timestamptz, kind text, detail text, message text, context jsonb, samples jsonb, checked_at timestamptz, checked_by uuid)`.
- Later tasks insert `{ user_id, kind, detail, message, context, samples }` and select/update `checked_at, checked_by`.

- [ ] **Step 1: worktree 만들기** (superpowers:using-git-worktrees). `git fetch origin develop` 뒤 `origin/develop`에서 `feat/wonjun/report-button`. 스크래치패드의 두 문서를 `docs/superpowers/specs/`·`docs/superpowers/plans/`로 복사.

- [ ] **Step 2: `0030_reports.sql` 작성.** 0029의 머리글 양식(제목 `-- 두뜀 0030: 오판·버그 신고 (#121)`, 실행 위치: 서비스 프로젝트·develop 전용, 배경, 권한, 다시 실행하기). 본문 순서:
  1. `begin;` 뒤 `drop policy if exists`·`drop function if exists public.is_team()`·`drop table if exists public.reports, public.team_members` (다시 실행 가능).
  2. `team_members` 표. RLS 켬. `revoke all ... from anon, authenticated; grant select ... to authenticated;` 정책 `"내 팀 행만 본다" for select to authenticated using (user_id = (select auth.uid()))`. insert/update/delete grant 없음.
  3. `is_team()`: `language sql stable security definer set search_path = ''`, `exists(select 1 from public.team_members where user_id = (select auth.uid()))`. `revoke execute from public, anon; grant execute to authenticated`.
  4. `reports` 표. 칸과 check 제약은 설계 5절 그대로(`kind in ('judgment','bug','other')`, `detail in ('false_alarm','missed','unsure')`, `char_length(message) <= 500`, `pg_column_size(context) <= 4096`, `jsonb_typeof(samples) = 'array' and pg_column_size(samples) <= 16384`). `create index reports_created_idx on public.reports (created_at desc)`.
  5. RLS 켬. `revoke all on public.reports from anon, authenticated; grant select, insert on public.reports to authenticated; grant update (checked_at, checked_by) on public.reports to authenticated;` 정책 셋: `"내 신고를 쓴다" for insert with check (user_id = (select auth.uid()))`, `"내 신고 또는 팀이면 본다" for select using (user_id = (select auth.uid()) or public.is_team())`, `"팀만 확인 표시를 바꾼다" for update using (public.is_team()) with check (public.is_team())`.
  6. `comment on table` 둘. 팀원 등록 예시는 주석으로만: `-- insert into public.team_members (user_id) values ('<auth.users.id>');`
  7. `commit; notify pgrst, 'reload schema';`

- [ ] **Step 3: 서비스 Supabase SQL Editor에서 실행** (원준이 직접). 그 뒤 팀 세 명의 `auth.users.id`를 Authentication 화면에서 찾아 `insert into public.team_members ...` 실행.

- [ ] **Step 4: 적용 확인.** 작업 폴더(develop 기준 worktree)에서 `./scripts/check-db.sh` 실행. Expected: `team_members`·`reports`·`is_team` 줄이 "있음". (스크립트는 마이그레이션에서 이름을 자동으로 뽑으므로 고칠 것 없음)

- [ ] **Step 5: 권한 확인** (SQL Editor에서 팀이 아닌 계정인 척한다. 한 트랜잭션 안에서):
  `begin; select set_config('request.jwt.claims', '{"sub":"<팀 아닌 계정 id>","role":"authenticated"}', true); set local role authenticated;` 뒤
  - `insert into public.team_members (user_id) values ('<그 id>');` → Expected: `permission denied`
  - `insert into public.reports (user_id, kind) values ('<그 id>', 'bug') returning id;` → Expected: 1행
  - `update public.reports set checked_at = now();` → Expected: 0 rows (정책에 막힘)
  - `delete from public.reports;` → Expected: `permission denied`
  - `select count(*) from public.reports;` → Expected: 자기 것 1
  마지막에 `rollback;`으로 전부 되돌린다(시험 행도 사라진다).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/0030_reports.sql docs/superpowers/specs/2026-10-28-report-button-design.md docs/superpowers/plans/2026-10-28-report-button.md
git commit -m "feat: 오판·버그 신고 표와 팀 구분 마이그레이션 추가"
```

---

### Task 2: 최근 수치 버퍼 `recentSamples.ts`

**Files:**
- Create: `src/report/recentSamples.ts`
- Test: 스크래치패드 `tests/recentSamples.test.mjs` (저장소에 넣지 않음)

**Interfaces:**
- Produces:
  ```ts
  export const SAMPLE_WINDOW_MS = 30_000  // 신고에 붙이는 최근 수치 범위
  export const SAMPLE_CAPACITY = 30       // 1초 간격이면 30초
  export type Sample = {
    at: number; status: FocusStatus; hold: 'face' | 'eyes' | 'frame' | 'phone' | null;
    face: boolean; pitch: number | null;  // 도 단위, 소수 1자리
    ear: number | null;                   // 소수 2자리
    body: boolean | null; framed: boolean | null; phone: boolean | null;
    awaySeconds: number; closedSeconds: number; phoneSeconds: number;
  }
  export type StudyContext = { allowOtherScreen: boolean; allowDevices: boolean; sessionId: string }
  export function pushSample(sample: Sample): void
  export function recentSamples(nowMs: number): Sample[]        // at > nowMs - SAMPLE_WINDOW_MS, 시간순
  export function setStudyContext(ctx: StudyContext | null): void
  export function currentStudyContext(): StudyContext | null
  export function clearSamples(): void                            // 시험용
  ```
- 모듈 변수 하나(길이 30 고리 버퍼)와 context 변수 하나. React와 무관.

- [ ] **Step 1: 검사 스크립트 작성** `tests/recentSamples.test.mjs` (worktree 루트에서 실행, `import ... from '<worktree>/src/report/recentSamples.ts'`). 단언:
  - 비었을 때 `recentSamples(1000)`은 `[]`
  - `at` 0~34초(35개) 밀어 넣고 `recentSamples(34_000)` → 길이 30, 첫 `at` 5000, 마지막 34000 (용량 30으로 오래된 것 밀림)
  - `at` 0, 10_000 둘 넣고 `recentSamples(39_999)` → `[ {at:10000} ]` (0은 30초 넘어 빠짐). 경계: `recentSamples(40_000)` → 10_000은 `at > now - 30000`이 아니므로 `[]`
  - `setStudyContext({allowOtherScreen:true, allowDevices:false, sessionId:'s1'})` 뒤 `currentStudyContext().sessionId === 's1'`, `setStudyContext(null)` 뒤 `null`
  - `clearSamples()` 뒤 `[]`
  `node:assert/strict`로 단언, 끝에 `console.log('recentSamples ok')`.

- [ ] **Step 2: 실행해 실패 확인.** Run: `node tests/recentSamples.test.mjs` Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: `recentSamples.ts` 구현.** 고리 버퍼는 배열 30칸 + 쓰기 위치 + 개수로. `recentSamples`는 시간순으로 모은 뒤 `filter`. 파일 머리 주석에 "영상은 없고 수치만, 신고(#121)에 붙이는 최근 30초"와 "비우기는 시각으로 한다(StudyRunner가 과목·설정마다 다시 마운트되므로)"를 적는다.

- [ ] **Step 4: 통과 확인.** Run: `node tests/recentSamples.test.mjs` Expected: `recentSamples ok`

- [ ] **Step 5: Commit**
```bash
git add src/report/recentSamples.ts
git commit -m "feat: 신고에 붙일 최근 30초 판정 수치 버퍼 추가"
```

---

### Task 3: 순수 로직 `reportLogic.ts`

**Files:**
- Create: `src/report/reportLogic.ts`
- Test: 스크래치패드 `tests/reportLogic.test.mjs`

**Interfaces:**
- Consumes: `Sample`, `StudyContext` (Task 2)
- Produces:
  ```ts
  export const MESSAGE_MAX = 500                       // reports.message check 와 같은 값
  export const LIST_LIMIT = 200                        // 목록에 불러오는 최대 건수
  export type ReportKind = 'judgment' | 'bug' | 'other'
  export type JudgmentDetail = 'false_alarm' | 'missed' | 'unsure'
  export const KIND_LABEL: Record<ReportKind, string>          // 판정 오류 / 화면·기능 버그 / 기타·의견
  export const DETAIL_LABEL: Record<JudgmentDetail, string>    // 공부 중인데 노랑·빨강 / 안 하는데 초록 / 모르겠음
  export type Draft = { kind: ReportKind | null; detail: JudgmentDetail | null; message: string }
  export function validateDraft(d: Draft): string | null        // 오류 문구 또는 null. 종류 없음 → '신고 종류를 골라 주세요.', 500자 초과 → '설명은 500자까지 적을 수 있어요.'
  export type ReportContext = {
    page: string; branch: string | null; sessionId: string | null; userAgent: string;
    status: FocusStatus | null; hold: Sample['hold']; allowOtherScreen: boolean | null; allowDevices: boolean | null;
  }
  export function buildContext(input: { page: string; search: string; userAgent: string; study: StudyContext | null; last: Sample | null }): ReportContext
    // branch 는 search 의 ?branch= 값(없으면 null), status·hold 는 last 에서, allow* 는 study 에서(없으면 null)
  export function toDegrees(rad: number): number               // 소수 1자리로 반올림
  export function round2(v: number | null | undefined): number | null
  export type ReportRow = { id: string; user_id: string; created_at: string; kind: ReportKind; detail: JudgmentDetail | null; message: string; context: ReportContext; samples: Sample[]; checked_at: string | null; checked_by: string | null }
  export type Filter = { kind: ReportKind | 'all'; checked: 'all' | 'unchecked' | 'checked' }
  export const DEFAULT_FILTER: Filter = { kind: 'all', checked: 'unchecked' }
  export function applyFilter(rows: ReportRow[], f: Filter): ReportRow[]
  export function relativeSeconds(sample: Sample, reportedAt: number): number  // 표 첫 열: 신고 시각 기준 -29…0 (초, 반올림)
  ```

- [ ] **Step 1: 검사 스크립트 작성** `tests/reportLogic.test.mjs`. 단언:
  - `validateDraft({kind:null, detail:null, message:''})` → `'신고 종류를 골라 주세요.'`; `kind:'bug'`, message 501자 → `'설명은 500자까지 적을 수 있어요.'`; `kind:'bug'`, 500자 → `null`
  - `buildContext({page:'/space', search:'?branch=byeol', userAgent:'ua', study:null, last:null})` → `branch:'byeol'`, `status:null`, `allowOtherScreen:null`, `sessionId:null`
  - `buildContext({..., search:'', study:{allowOtherScreen:true, allowDevices:false, sessionId:'s1'}, last:{status:'away', hold:null, ...}})` → `branch:null`, `status:'away'`, `allowOtherScreen:true`, `sessionId:'s1'`
  - `toDegrees(Math.PI/2) === 90`, `toDegrees(0.1234) === 7.1`, `round2(0.12345) === 0.12`, `round2(null) === null`
  - `applyFilter` 세 줄(bug 미확인, judgment 확인, other 미확인)에 `DEFAULT_FILTER` → bug·other 둘; `{kind:'judgment', checked:'all'}` → judgment 하나; `{kind:'all', checked:'checked'}` → judgment 하나
  - `relativeSeconds({at: 10_000, ...}, 39_400)` → `-29`

- [ ] **Step 2: 실행해 실패 확인.** Run: `node tests/reportLogic.test.mjs` Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: `reportLogic.ts` 구현.** `type` import만 쓰고 enum·namespace 금지(erasableSyntaxOnly). `buildContext`의 branch는 `new URLSearchParams(search).get('branch')`.

- [ ] **Step 4: 통과 확인.** Run: `node tests/reportLogic.test.mjs` Expected: `reportLogic ok`

- [ ] **Step 5: Commit**
```bash
git add src/report/reportLogic.ts
git commit -m "feat: 신고 종류·입력 검사·걸러 보기 순수 로직 추가"
```

---

### Task 4: `useSampleRecorder` 훅과 `StudyRunner` 연결

**Files:**
- Create: `src/report/useSampleRecorder.ts`
- Modify: `src/study/StudyRunner.tsx:46-66` (훅 호출 한 줄, import 한 줄)

**Interfaces:**
- Consumes: `pushSample`, `setStudyContext` (Task 2); `toDegrees`, `round2` (Task 3); `FocusInput`·`FocusState`·`holdReason` 결과(`src/focus/focusLogic.ts`), `PoseState`·`PhoneState`(`src/tracking/useTracking.ts`), `workerInterval`(`src/lib/workerInterval.ts`)
- Produces:
  ```ts
  export const SAMPLE_INTERVAL_MS = 1000
  export function useSampleRecorder(args: {
    face: RefObject<FocusInput>; pose: RefObject<PoseState>; phone: RefObject<PhoneState>;
    focus: FocusState; hold: Sample['hold']; paused: boolean;
    allowOtherScreen: boolean; allowDevices: boolean; sessionId: string;
  }): void
  ```
  - 최신 `focus`·`hold`는 ref에 복사해 두고 `workerInterval(1000)` 틱마다 읽는다(틱 콜백이 옛 클로저를 보지 않게). `paused`면 밀지 않는다.
  - 마운트·allow*·sessionId 변경 때 `setStudyContext({...})`, 언마운트 때 `setStudyContext(null)`. 샘플은 지우지 않는다.
  - Sample 값: `face: face.current.found`, `pitch: face.current.pitch == null ? null : toDegrees(face.current.pitch)`, `ear: round2(face.current.ear)`, `body: pose.current.found` (Pose 준비 전이면 `framed`가 null이므로 그때는 `body: null`), `framed: pose.current.framed`, `phone: phone.current.found`, 나머지는 `focus`에서.

- [ ] **Step 1: 훅 작성** 위 시그니처대로. 파일 머리 주석: "신고(#121)에 붙일 최근 수치를 1초마다 recentSamples에 넣는다. 영상은 없다."

- [ ] **Step 2: `StudyRunner.tsx`에 연결.** `hold` 계산(66행) 바로 아래에
  `useSampleRecorder({ face, pose, phone, focus, hold, paused, allowOtherScreen: choice.allowOtherScreen, allowDevices: choice.allowDevices, sessionId })`
  와 import 한 줄. 한국어 주석 한 줄("신고 창이 꺼내 쓸 최근 30초 수치, #121").

- [ ] **Step 3: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 4: Commit** (화면 확인은 Task 5의 신고 창 "같이 보내는 정보"에서 한다)
```bash
git add src/report/useSampleRecorder.ts src/study/StudyRunner.tsx
git commit -m "feat: 공부 중 판정 수치를 1초마다 신고 버퍼에 기록"
```

---

### Task 5: 신고 창 `ReportPanel`과 메뉴 "신고하기"

**Files:**
- Create: `src/report/ReportPanel.tsx`
- Create: `src/report/sendReport.ts`
- Modify: `src/menu/panelTypes.ts:2-7` (`| { kind: 'report' }`), `src/menu/InfoPanel.tsx:18` (TITLE에 `report: '신고하기'`)와 59-69 (분기 한 줄), `src/menu/SceneMenu.tsx:49-55` (아래 상자 "설정" 다음에 줄 하나)
- Test: 스크래치패드 `tests/sendReport.test.mjs`

**Interfaces:**
- Consumes: `recentSamples`, `currentStudyContext` (Task 2); `validateDraft`, `buildContext`, `KIND_LABEL`, `DETAIL_LABEL`, `MESSAGE_MAX`, `Draft` (Task 3); `supabase` (`src/lib/supabase.ts`)
- Produces:
  ```ts
  // sendReport.ts — supabase 호출을 한 곳에. 성공이면 null, 실패면 한국어 문구
  export type ReportInsert = { user_id: string; kind: ReportKind; detail: JudgmentDetail | null; message: string; context: ReportContext; samples: Sample[] }
  export function buildInsert(args: { myId: string; draft: Draft; nowMs: number; page: string; search: string; userAgent: string }): ReportInsert
    // draft.kind 가 'judgment' 가 아니면 detail 은 null. samples = recentSamples(nowMs), context = buildContext(..., study: currentStudyContext(), last: samples 마지막 또는 null)
  export type ReportClient = { from: (table: string) => { insert: (row: ReportInsert) => PromiseLike<{ error: { message: string } | null }> } }
  export async function sendReport(row: ReportInsert, client: ReportClient = supabase): Promise<string | null>
    // 실패 문구: `신고를 보내지 못했습니다: ${error.message}`
  // ReportPanel.tsx
  export function ReportPanel({ myId }: { myId: string }): JSX.Element
  ```

- [ ] **Step 1: 검사 스크립트** `tests/sendReport.test.mjs` (`buildInsert`만, 브라우저 전역 없이):
  - `pushSample` 2개(at 1000·2000, status 'focus'·'away') 뒤 `buildInsert({myId:'u', draft:{kind:'bug', detail:'unsure', message:'x'}, nowMs:2500, page:'/space', search:'?branch=sol', userAgent:'ua'})` → `detail === null`, `samples.length === 2`, `context.status === 'away'`, `context.branch === 'sol'`, `user_id === 'u'`
  - `draft.kind:'judgment', detail:'missed'` → `detail === 'missed'`
  - `clearSamples()` 뒤 → `samples.length === 0`, `context.status === null`
  - `sendReport(row, { from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }) })` → `'신고를 보내지 못했습니다: boom'`; error null → `null`

- [ ] **Step 2: 실행해 실패 확인.** Run: `node tests/sendReport.test.mjs` Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: `sendReport.ts` 구현.** `client` 기본값은 `supabase`. `insert(row)`만 하고 `select`는 하지 않는다.

- [ ] **Step 4: 통과 확인.** Run: `node tests/sendReport.test.mjs` Expected: `sendReport ok`

- [ ] **Step 5: `ReportPanel.tsx` 작성.** `InfoPanel` 안의 카드(`#20232a`, radius 12, padding 16) 스타일을 따른다. 상태: `draft: Draft`(초기 `{kind:null, detail:null, message:''}`), `sending`, `error`, `done`, `showInfo`.
  - 라디오 3개(KIND_LABEL), `kind === 'judgment'`일 때만 보조 라디오 3개(DETAIL_LABEL).
  - `<textarea maxLength={MESSAGE_MAX}>`와 `n/500` 글자 수.
  - "같이 보내는 정보 보기" 토글. 펼치면 `buildInsert(...)`를 미리 만들어 context 값을 `이름: 값` 줄로, samples는 표(열: 초·상태·보류·얼굴·고개·EAR·몸·구도·휴대폰). samples 비면 "판정 수치 없음(공부 중이 아님)". 영상·사진이 없다는 한 줄 안내.
  - 보내기: `validateDraft` 오류면 표시하고 멈춤. 아니면 `sendReport(buildInsert({... nowMs: Date.now(), page: location.pathname, search: location.search, userAgent: navigator.userAgent}))`. 보내는 동안 비활성. 성공하면 `done` → "접수됐어요. 고맙습니다." 한 줄만. 실패하면 `error` 표시, 다시 보내기 가능.
  - 취소 버튼은 없다(창 ✕·Esc가 닫기).

- [ ] **Step 6: 메뉴 연결.** `panelTypes.ts`에 `| { kind: 'report' } // 신고하기 (#121)`, `InfoPanel.tsx` TITLE에 `report: '신고하기'`, 분기 `{view.kind === 'report' && <ReportPanel myId={myId} />}`, `SceneMenu.tsx` 아래 상자의 "설정" 다음에 `<button type="button" style={menuRowMinor} onClick={() => onOpen({ kind: 'report' })}>신고하기</button>` (키캡 없음). `PANEL_KEYS`·`KeyAction`은 손대지 않는다.

- [ ] **Step 7: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0. (`panelKey`는 kind를 그대로 쓰므로 수정 없음)

- [ ] **Step 8: 브라우저 확인(원준).** `npm run dev`:
  - 로비에서 메뉴 "신고하기" → 창. 창이 떠 있는 동안 WASD로 캐릭터가 안 움직인다. 버그 선택 → 정보 펼침 "판정 수치 없음" → 보내기 → "접수됐어요". Supabase Table Editor에서 행 확인: `samples = []`, `context.branch = null`.
  - 지점 자리에서 공부 시작 → 30초 뒤 신고 → 정보 펼침에 30줄 → 보내기 → 행의 `samples` 30줄, `context.status`·`sessionId` 있음.
  - 종류를 안 고르고 보내기 → "신고 종류를 골라 주세요."

- [ ] **Step 9: Commit**
```bash
git add src/report/ReportPanel.tsx src/report/sendReport.ts src/menu/panelTypes.ts src/menu/InfoPanel.tsx src/menu/SceneMenu.tsx
git commit -m "feat: 메뉴에 오판·버그 신고하기 창 추가"
```

---

### Task 6: 팀용 신고 목록 `ReportsPanel`과 메뉴 "신고 목록"

**Files:**
- Create: `src/report/useIsTeam.ts`
- Create: `src/report/useReports.ts`
- Create: `src/report/ReportsPanel.tsx`
- Modify: `src/menu/panelTypes.ts` (`| { kind: 'reports' }`), `src/menu/InfoPanel.tsx` (TITLE `reports: '신고 목록'`, 분기), `src/menu/SceneMenu.tsx` ("신고하기" 다음 줄, 팀일 때만)

**Interfaces:**
- Consumes: `ReportRow`, `Filter`, `DEFAULT_FILTER`, `applyFilter`, `KIND_LABEL`, `DETAIL_LABEL`, `LIST_LIMIT`, `relativeSeconds` (Task 3); `supabase`
- Produces:
  ```ts
  export function useIsTeam(myId: string | undefined): boolean   // team_members 에서 내 행 select, alive 플래그(useMyNickname 양식). 로딩 중·없음은 false
  export function useReports(enabled: boolean): {
    rows: ReportRow[]; names: Record<string, string>; loading: boolean; error: string;
    setChecked: (id: string, checked: boolean) => Promise<string | null>;   // update checked_at/checked_by, 성공 null, 실패 문구
    reload: () => void;
  }
  export function ReportsPanel({ myId }: { myId: string }): JSX.Element
  ```
  - `useReports`: `.from('reports').select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT)`. 닉네임은 `.from('avatars').select('id, nickname').in('id', [...user_id 집합])`로 한 번 더. `setChecked`는 `update({ checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? myId : null }).eq('id', id)` 뒤 rows를 자리에서 바꾼다.

- [ ] **Step 1: `useIsTeam.ts`·`useReports.ts` 작성** 위대로. 오류는 `console.error` + 한국어 문구(`'신고를 불러오지 못했어요. 새로고침해 주세요.'`).

- [ ] **Step 2: `ReportsPanel.tsx` 작성.** `useIsTeam(myId)`가 false면 카드에 "팀만 볼 수 있습니다." 한 줄. 참이면:
  - 위: 종류 select(전체 + KIND_LABEL), 확인 select(전체/미확인/확인함). 상태 `filter: Filter`(초기 `DEFAULT_FILTER`). 목록은 `applyFilter(rows, filter)`.
  - 줄(버튼): `created_at`을 `ko-KR` 날짜·시각, 닉네임(없으면 `user_id.slice(0,8)`), `KIND_LABEL[kind]`(+ `DETAIL_LABEL[detail]`), 설명 첫 줄(40자까지), `context.branch ?? '-'`, `context.status ?? '-'`, 확인 여부 ✓.
  - 누르면 펼침: 설명 전체, context 전부 `이름: 값`, samples 표(첫 열 `relativeSeconds(s, Date.parse(created_at))`초, 나머지 Task 5 표와 같은 열), 비면 "수치 없음". "확인함"/"확인 취소" 버튼 → `setChecked`. 오류면 줄 아래 문구.
  - 빈 목록: "신고가 없어요."

- [ ] **Step 3: 메뉴 연결.** `panelTypes.ts`에 `| { kind: 'reports' } // 신고 목록 (팀만, #121)`, `InfoPanel.tsx` TITLE·분기 `{view.kind === 'reports' && <ReportsPanel myId={myId} />}`, `SceneMenu.tsx`에서 `const team = useIsTeam(myId)` 뒤 `{team && <button ... onClick={() => onOpen({ kind: 'reports' })}>신고 목록</button>}` ("신고하기" 바로 아래).

- [ ] **Step 4: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 5: 브라우저 확인(원준).**
  - 팀 계정: 메뉴에 "신고 목록" 보임 → 기본 미확인 목록에 Task 5에서 보낸 신고 2건 → 지점 것 펼치면 30줄 표 → "확인함" → 목록에서 빠짐 → 확인 select "확인함"에서 보임 → "확인 취소"로 돌아옴. 공부 중에 열어도 자리·타이머가 유지된다.
  - 팀 아닌 계정: 메뉴에 "신고 목록" 없음. DevTools Network에서 `reports` 응답은 자기 것만.

- [ ] **Step 6: Commit**
```bash
git add src/report/useIsTeam.ts src/report/useReports.ts src/report/ReportsPanel.tsx src/menu/panelTypes.ts src/menu/InfoPanel.tsx src/menu/SceneMenu.tsx
git commit -m "feat: 팀용 신고 목록 창과 확인 표시 추가"
```

---

### Task 7: 마무리 — 문서 한 줄과 PR

**Files:**
- Modify: `CLAUDE.md` 폴더 구조 표에 `report/` 한 줄 (팀 파일이라 PR에 포함해 팀이 본다)

- [ ] **Step 1: `CLAUDE.md` 폴더 구조에 `report/  오판·버그 신고(메뉴 "신고하기", 최근 30초 판정 수치 첨부)와 팀용 신고 목록 (recentSamples.ts·reportLogic.ts는 순수 로직)` 추가.** 다른 줄은 손대지 않는다.

- [ ] **Step 2: 전체 검사.** Run: `npm run lint && npm run build` Expected: 오류 0. `node tests/*.test.mjs` 세 개 모두 `ok`.

- [ ] **Step 3: Commit**
```bash
git add CLAUDE.md
git commit -m "docs: 폴더 구조에 report 폴더 추가"
```

- [ ] **Step 4: 푸시·PR** (원준 요청 시). `git push -u origin feat/wonjun/report-button`, `gh pr create --base develop --title "feat: 오판·버그 신고하기 버튼과 팀용 신고 목록"`. PR 본문: Closes #121, 적용할 DB: **서비스**, 파일 `0030_reports.sql`(이미 실행함), 팀원 등록 SQL은 각자 id로, 다른 팀원 파일 수정 범위(panelTypes·InfoPanel·SceneMenu 각 줄 추가), 확인 방법(설계 8절).
