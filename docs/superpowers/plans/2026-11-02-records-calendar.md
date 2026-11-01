# 내 기록 월 달력·과목 도넛·쉬는 날 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 화면 월 단위의 막대그래프를 시간이 적힌 초록 달력으로 바꾸고, 월·년에 과목별 비율 도넛을 두고, 달력 칸을 눌러 쉬는 날(OFF)을 계정에 저장한다.

**Architecture:** 달력 칸 배열·색 단계·도넛 조각·다음 달 허용·과목 색은 React 와 무관한 순수 함수(`calendarLogic.ts`, `subjectLogic.ts`)로 두고 Node 로 검사한다. 화면 부품 `MonthCalendar`·`SubjectDonut`을 `RecordsView`가 끼운다. OFF 는 새 표 `rest_days`와 `useRestDays` 훅.

**Tech Stack:** React 19, TypeScript, Vite, Supabase. 새 라이브러리 없음(SVG·HTML).

**Spec:** `docs/superpowers/specs/2026-11-02-records-calendar-design.md`

## Global Constraints

- 브랜치 `feat/wonjun/records-calendar`(develop 기준), worktree `.claude/worktrees/records-calendar`. PR base `develop`.
- 새 라이브러리 금지. 그래프는 `RecordCharts.tsx`처럼 SVG·HTML.
- 날짜 경계는 **자정**(기록 화면 기존 `byDayOfMonth`). 달력은 **월요일 시작**.
- 칸 색 단계: 0 / 2시간 미만 / 4시간 미만 / 6시간 미만 / 6시간 이상 (5단계), 초록 계열, 어두운 카드(#20232a) 위 흰 글자. 시간 형식 `H:MM`.
- OFF: 표시만(합계·색·도넛 영향 없음), 나만 봄, 게스트 허용, 누르면 바로 바뀌고 실패 시 되돌림+안내, 키보드로도.
- ▶: 월 단위만 이번 달 **다음 한 달까지**. 일·년은 그대로.
- 월 단위에서 기록이 0 이면(미래 달 포함) "공부 기록이 없어요" 대신 **빈 달력**. 미래 달은 표로 보기·도넛 숨김.
- 도넛: 월·년, **과목 칩으로 한 과목을 고르면 숨김**, 많은 순, 정수 %, 2% 미만 조각은 % 글자를 옆 목록에만, 가운데 합계.
- 과목 색: **내 과목 목록(만든 순서, 정리 포함) 몇 번째인지**로 8색 PALETTE, 지운 과목·목록 읽기 전 회색. 도넛과 플래너 시간표가 같은 함수.
- DB `supabase/migrations/0052_rest_days.sql`, 서비스 DB 만. PR 머지 **전** 실행(육심호 또는 사용자). 실험 DB 실행 안 함.
- 기준값은 파일 위 이름 붙인 상수, 주석·화면 글자 한국어. 순수 파일은 Node 검사를 위해 import 에 `.ts` 확장자.
- 커밋·푸시·PR 은 사용자가 요청할 때만.

## Review Focus

1. **2월·월요일/일요일로 시작하는 달**: 달력 칸이 7의 배수이고 1일이 맞는 요일에 온다. → Task 1 `monthCells` 검사.
2. **다음 달은 열리고 그다음 달은 막힘, 12월 → 다음 해 1월**: → Task 1 `canGoNextMonth` 검사.
3. **과목 목록을 아직 못 읽었거나 지운 과목**: 엉뚱한 색이 아니라 회색. → Task 2 `subjectColorOf` 검사.
4. **`rest_days` 표가 없는 DB(0052 실행 전)**: OFF 없이 달력만, 화면 안 깨짐. → Task 3 Step 의 오류 처리.
5. **좁은 창(로비 위 기록 창·폰)**: 가로 스크롤 없이 숫자가 읽힘. → Task 5 사용자 확인.

---

### Task 1: 달력·도넛 순수 로직 (`calendarLogic.ts`)

**Files:** Create `src/study/calendarLogic.ts`

**Interfaces — Produces:**
- `HEAT_STEPS = [7200, 14400, 21600]` (초), `heatLevel(seconds: number): 0 | 1 | 2 | 3 | 4`
- `dayKey(d: Date): string` — 현지 `YYYY-MM-DD`
- `monthCells(anchor: Date): { key: string; day: number; inMonth: boolean }[]` — 월요일 시작, 앞뒤 달로 채워 길이 7의 배수
- `SMALL_SLICE_PERCENT = 2`, `donutSlices(items: { subjectId: number | null; seconds: number }[]): { subjectId: number | null; seconds: number; percent: number; from: number; to: number }[]` — 많은 순, from/to 는 0~1 누적 비율, 합 0 이면 `[]`
- `canGoNextMonth(anchor: Date, now: Date): boolean` — anchor 의 다음 달이 now 의 다음 달 이하이면 true

- [ ] **Step 1: 검사 작성 후 실패 확인** (`.superpowers/sdd/<plan>/t1.mjs`에 두고 `node`로 실행)
```js
const C = await import(process.cwd() + "/src/study/calendarLogic.ts");
assert.equal(C.heatLevel(0), 0); assert.equal(C.heatLevel(60), 1); assert.equal(C.heatLevel(7199), 1);
assert.equal(C.heatLevel(7200), 2); assert.equal(C.heatLevel(14400), 3); assert.equal(C.heatLevel(21599), 3); assert.equal(C.heatLevel(21600), 4);
assert.equal(C.dayKey(new Date(2026, 1, 3)), "2026-02-03");
const oct = C.monthCells(new Date(2026, 9, 15));           // 2026-10-01 은 목요일
assert.equal(oct.length % 7, 0);
assert.deepEqual(oct.slice(0, 4).map(c => [c.day, c.inMonth]), [[28,false],[29,false],[30,false],[1,true]]);
assert.equal(oct.filter(c => c.inMonth).length, 31);
const feb = C.monthCells(new Date(2027, 1, 1));            // 2027-02-01 은 월요일, 28일
assert.equal(feb[0].key, "2027-02-01"); assert.equal(feb.length, 28);
const mar = C.monthCells(new Date(2026, 2, 1));            // 2026-03-01 은 일요일 → 앞에 6칸
assert.equal(mar.findIndex(c => c.inMonth), 6);
const s = C.donutSlices([{ subjectId: 2, seconds: 100 }, { subjectId: 1, seconds: 300 }, { subjectId: null, seconds: 0 }]);
assert.deepEqual(s.map(x => [x.subjectId, x.percent]), [[1, 75], [2, 25]]);   // 0초는 뺌, 많은 순
assert.equal(s[0].from, 0); assert.equal(s[1].to, 1);
assert.deepEqual(C.donutSlices([]), []);
const now = new Date(2026, 10, 2);
assert.equal(C.canGoNextMonth(new Date(2026, 10, 1), now), true);   // 11월 → 12월 가능
assert.equal(C.canGoNextMonth(new Date(2026, 11, 1), now), false);  // 12월 → 1월 막힘
assert.equal(C.canGoNextMonth(new Date(2026, 11, 1), new Date(2026, 11, 5)), true); // 12월에 있으면 1월 가능
console.log("calendarLogic OK");
```
Expected: FAIL (모듈 없음)
- [ ] **Step 2: 구현** — 위 Interfaces. 머리 주석은 `recordsLogic.ts` 형식.
- [ ] **Step 3: 검사 통과** — `calendarLogic OK`, `npm run lint && npm run build`
- [ ] **Step 4: Commit** `feat: 기록 달력·도넛 계산 순수 로직`

---

### Task 2: 과목 색을 내 과목 순서로 (도넛·플래너 공통)

**Files:** Modify `src/study/subjectLogic.ts`, `src/planner/plannerLogic.ts`(PALETTE·DELETED_COLOR·`subjectColor` 제거), `src/planner/PlannerSheet.tsx`, `src/planner/PlannerWindow.tsx`

**Interfaces — Produces:** `SUBJECT_PALETTE`(지금 plannerLogic PALETTE 8색 그대로), `DELETED_SUBJECT_COLOR = '#b8b8b8'`, `subjectColorOf(list: Subject[], id: number | null): string` — null 이거나 목록에 없으면 회색, 있으면 `SUBJECT_PALETTE[index % 8]`. `PlannerSheet` 새 prop `colorOf: (id: number | null) => string`.

- [ ] **Step 1: 검사 작성 후 실패 확인**
```js
const S = await import(process.cwd() + "/src/study/subjectLogic.ts");
const list = [{ id: 41, name: "수학", archivedAt: null }, { id: 9, name: "국어", archivedAt: "2026-10-01" }, { id: 49, name: "영어", archivedAt: null }];
assert.equal(S.subjectColorOf(list, 41), S.SUBJECT_PALETTE[0]);
assert.equal(S.subjectColorOf(list, 9), S.SUBJECT_PALETTE[1]);   // 정리한 과목도 자리 유지
assert.equal(S.subjectColorOf(list, 49), S.SUBJECT_PALETTE[2]);  // 41·49 는 번호 방식이면 같은 색이었음
assert.notEqual(S.subjectColorOf(list, 41), S.subjectColorOf(list, 49));
assert.equal(S.subjectColorOf(list, null), S.DELETED_SUBJECT_COLOR);
assert.equal(S.subjectColorOf([], 41), S.DELETED_SUBJECT_COLOR); // 목록 읽기 전
console.log("subjectColor OK");
```
Expected: FAIL (`subjectColorOf` 없음)
- [ ] **Step 2: 구현 + 플래너 연결** — `PlannerWindow`에서 `useSession`·`useSubjects(session?.user.id)`로 목록을 읽어 `colorOf={(id) => subjectColorOf(subjects, id)}`를 `PlannerSheet`에 넘긴다. `plannerLogic.subjectColor`를 쓰는 곳이 없게 지운다(`git grep subjectColor`).
- [ ] **Step 3: 검사 통과 + lint·build**
- [ ] **Step 4: Commit** `feat: 과목 색을 내 과목 순서로 정해 겹치지 않게 (플래너 시간표 포함)`

---

### Task 3: 쉬는 날 저장 (DB + 훅)

**Files:** Create `supabase/migrations/0052_rest_days.sql`, `src/study/useRestDays.ts`

**Interfaces — Produces:** `useRestDays(start: Date, end: Date): { days: Set<string>; toggle: (key: string) => Promise<string> }` — key 는 `dayKey` 형식, toggle 은 바로 반영 후 insert/delete, 실패 시 되돌리고 안내문(성공 `''`).

- [ ] **Step 1: 마이그레이션** — 머리말은 0048 형식(왜/권한/적용: 서비스 DB 만, 머지 전, 실험 DB 안 함, 실행 전엔 OFF 없이 달력만):
```sql
begin;
create table public.rest_days (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.rest_days enable row level security;
create policy "내 쉬는 날을 본다" on public.rest_days for select to authenticated using (user_id = (select auth.uid()));
create policy "내 쉬는 날을 찍는다" on public.rest_days for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 쉬는 날을 지운다" on public.rest_days for delete to authenticated using (user_id = (select auth.uid()));
commit;
```
- [ ] **Step 2: 훅** — 기간(`dayKey(start)` 이상, `dayKey(end)` 미만)으로 `select('day')`. 읽기 오류(표 없음 포함)는 `console.error` 후 빈 Set. toggle: 있으면 delete, 없으면 insert(`{ day: key }`).
- [ ] **Step 3: lint·build** — Commit `feat: 쉬는 날(OFF)을 계정에 저장 (rest_days)`

---

### Task 4: 화면 부품 (`MonthCalendar`, `SubjectDonut`)

**Files:** Create `src/study/MonthCalendar.tsx`, `src/study/SubjectDonut.tsx`

**Interfaces:**
- `MonthCalendar({ anchor: Date; seconds: number[] /* byDayOfMonth */; rest: Set<string>; today: Date; onToggleRest: (key: string) => void })`
  - 요일 머리(월~일), `monthCells`로 칸, 이번 달 칸만 `<button>`(누르면 `onToggleRest`, `aria-pressed`=OFF, `aria-label` "10월 5일 · 3:20 · 쉬는 날"), 앞뒤 달 칸은 흐린 `<div>`.
  - 칸: 날짜(작게) + `H:MM`(0이면 비움) + OFF 면 작은 "OFF" 딱지. 색 `HEAT_COLORS[heatLevel(s)]` = `['#2a2e36','#1f4d34','#2f7a4e','#3fa566','#5fd38a']`(시안 값), 오늘은 흰 테두리 2px.
  - 칸은 `grid-template-columns: repeat(7, 1fr)`, 높이는 `clamp`로 폭 따라. 좁으면 날짜 글자 10px. 아래에 색 단계 안내(0 … 6시간+).
- `SubjectDonut({ items: { subjectId: number | null; name: string; seconds: number }[]; colorOf: (id: number | null) => string })` — `donutSlices`로 SVG 원호(`stroke-dasharray`), 가운데 합계 `H:MM`, 옆 목록 "이름 % · H:MM", `SMALL_SLICE_PERCENT` 미만은 원호 위 글자 없음. `role="img"`, `aria-label`에 목록 요약.

- [ ] **Step 1: 두 파일 작성** (H:MM 은 초→`Math.floor(s/3600)`:`분 두 자리`, 같은 함수가 이미 없으면 `calendarLogic`에 `formatClock(seconds): string` 추가하고 Task 1 검사에 `assert.equal(C.formatClock(19200), "5:20"); assert.equal(C.formatClock(0), "0:00");` 추가 → RED→GREEN)
- [ ] **Step 2: lint·build** — Commit `feat: 기록 월 달력과 과목 도넛 부품`

---

### Task 5: 기록 화면 연결

**Files:** Modify `src/study/RecordsPage.tsx`

- [ ] **Step 1: 연결**
  - `period === 'month'`: `ColumnChart` 대신 `MonthCalendar`(`seconds = byDayOfMonth(filtered, anchor)`, `useRestDays(start, end)`). 월 단위는 `total === 0`이어도 "기록이 없어요" 대신 달력. OFF 저장 실패 안내는 달력 아래 3초 표시.
  - ▶: 월 단위는 `canGoNextMonth(anchor, new Date())`, 일·년은 기존 `isFuture`.
  - 미래 달(시작이 이번 달 다음): 표로 보기·도넛 숨김.
  - 도넛: `period !== 'day' && subjectId === null && total > 0`일 때 카드 아래 새 카드("과목별 비율 · 10월"/"· 2026년"), `items = bySubject(filtered)` + `nameOf`, `colorOf = (id) => subjectColorOf(subjects, id)`.
  - 년 단위 `ColumnChart`, 일 단위는 그대로.
- [ ] **Step 2: lint·build, Task 1·2 검사 다시**
- [ ] **Step 3: 사용자 확인 요청** — `npm run dev`(서비스 DB에 0052 실행 후)로: 숫자 읽힘·진한 칸 대비, OFF 켜기/끄기·새로고침 유지·키보드(Tab+Enter), 과목 칩→달력 다시 칠함·도넛 숨김, 다음 달까지만 ▶, 미래 달 빈 달력, 년 도넛, 로비 위 기록 창(R)·폰 폭에서 가로 스크롤 없음, 플래너 시간표 과목 색이 도넛과 같은지.
- [ ] **Step 4: Commit** `feat: 기록 화면 월 단위를 달력으로, 월·년 과목 도넛, 쉬는 날 표시`

---

### Task 6: 마무리
- [ ] 설계·계획 문서 커밋 `docs: 기록 달력·도넛·쉬는 날 설계와 계획`
- [ ] 사용자에게 PR 여부 확인. PR 설명: 적용할 DB 서비스 `0052_rest_days.sql`(머지 전), 플래너 과목 색 방식 바뀜(#394).
