# 스터디 플래너 노트 넘기기 + 내 글씨체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가방 속 스터디 플래너를 "쓴 날만큼 쌓인 종이 더미 + 모서리 끌어 넘기기"로 바꾸고, 직접 쓴 글씨의 글씨체를 3가지 중 골라 계정에 저장한다.

**Architecture:** 날짜 이동·쓴 날 계산·넘기기 판정은 React 와 무관한 순수 함수(`notebookLogic.ts`)에 두고 Node 로 검사한다. 글씨체는 CSS 변수(`--hand-font`, `--hand-scale`)로 바꿔서 플래너·메모의 손글씨가 props 없이 한꺼번에 따라 바뀌게 한다. 화면은 `NotebookStack`(더미·넘기기 효과)이 맡고 `PlannerWindow`가 데이터를 넣어 준다.

**Tech Stack:** React 19, TypeScript, Vite, Supabase(profiles 컬럼 1개 추가). 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-01-planner-notebook-design.md`

## Global Constraints

- 브랜치 `feat/wonjun/planner-notebook`(develop 기준), worktree `.claude/worktrees/planner-notebook`. PR base 는 `develop`.
- 새 라이브러리 추가 금지(넘기는 효과는 CSS·React 로).
- 플래너 창 크기는 지금 그대로(`SHEET_W`×`SHEET_H` × 배율). 더미는 종이 가장자리만 살짝(최대 14px) 삐져나오게.
- 앞날은 오늘부터 **7일 뒤까지**. 지난날은 **처음 쓴 날까지**. 빈 날도 건너뛰지 않고 하루씩.
- 쓴 날 = 그날 장에 글자·체크·기분·형광펜이 하나라도 있거나 그날 집중(focus) 기록이 있는 날, **오늘까지만** 센다.
- 글씨체 id: `'ochungi'`(기본) · `'sangju'` · `'myoeun'`. 저장은 `profiles.hand_font`.
- 폰트 파일은 변환·잘라내기 금지. 외부 주소 그대로:
  - 상주다정다감체: `https://cdn.jsdelivr.net/npm/@noonnu/sangju-dajungdagam@0.1.0/fonts/sangjudajungdagam-normal.woff` (family `SANGJUDajungdagam`)
  - 그리운 묘은또박체: `https://cdn.jsdelivr.net/gh/projectnoonnu/2601-1@1.0/Griun_Myoeunddobak-Rg.woff2` (family `BelovedMyoeunttobak`)
- 펜 고르기 버튼의 "가나다" 미리보기는 글씨체 파일이 아니라 PNG(`public/fonts/hand-preview-<id>.png`).
- 주석·화면 글자는 한국어. 기준값은 파일 위쪽 이름 붙인 상수.
- 커밋 형식 `feat: 한국어 설명`, 커밋 전 `npm run lint`·`npm run build` 통과.
- 마이그레이션이 있으므로 PR 머지 **전** 서비스 Supabase 에 `0048_hand_font.sql` 실행(육심호 요청). 커밋·푸시·PR 은 사용자가 요청할 때만.

## Review Focus

1. **처음 쓰는 사람(쓴 날 0)**: 더미 0장, "쓴 날 0장", 지난날로는 안 넘어가고 앞날로는 7일까지 넘어간다. → Task 1 `firstUser` 검사.
2. **오늘 처음 글자를 쓴 순간**: 다시 읽지 않아도 "쓴 날" 수가 바로 1 늘어야 한다. → Task 1 `withCurrent` 검사.
3. **새벽 5시가 지나 오늘이 바뀜**: 앞날 7일 한계와 "쓴 날" 기준이 새 오늘로 옮겨진다(오늘은 인자로 받는다). → Task 1 `canGoForward` 검사.
4. **`hand_font` 컬럼이 아직 없는 DB(마이그레이션 실행 전 배포)**: 읽기 실패해도 기본 글씨로 보이고 화면이 깨지지 않는다. → Task 3 Step 의 오류 처리 확인.
5. **쓴 기록이 1000줄을 넘는 사람**: Supabase 한 번 읽기 상한(1000행) 때문에 쓴 날이 덜 세어지면 안 된다(나눠 읽기). → Task 5 확인 단계.

---

### Task 1: 노트 순수 로직 (`notebookLogic.ts`)

**Files:**
- Create: `src/planner/notebookLogic.ts`

**Interfaces:**
- Consumes: `plannerLogic.ts`의 `PlannerData`, `normalizePlanner`, `shiftDay`, `plannerDayOf`
- Produces:
  - `MAX_AHEAD_DAYS = 7`, `MAX_VISIBLE_SHEETS = 8`, `FLIP_COMPLETE = 0.5`, `TAP_MAX_MOVE_PX = 6`, `TAP_MAX_MS = 300`
  - `hasWriting(d: PlannerData): boolean`
  - `writtenDays(pages: { day: string; data: unknown }[], focusStarts: number[], today: string): string[]` — 오름차순, 중복 없음, `<= today` 만. `focusStarts`는 집중 구간 시작 시각(ms), 날짜는 `plannerDayOf`로.
  - `withCurrent(written: string[], day: string, writingNow: boolean, today: string): string[]` — 보고 있는 장의 지금 상태를 반영(`day > today`면 그대로).
  - `canGoBack(day: string, written: string[], today: string): boolean` — `day > (written[0] ?? today)`
  - `canGoForward(day: string, today: string): boolean` — `day < shiftDay(today, MAX_AHEAD_DAYS)`
  - `stackInfo(written: string[], day: string): { below: number; flipped: number; total: number; index: number }` — below = day 보다 앞선 쓴 날 수, flipped = day 보다 뒤인 쓴 날 수, total = 전체, index = day 이하 쓴 날 수
  - `visibleSheets(n: number): number` — `min(n, MAX_VISIBLE_SHEETS)`
  - `flipOutcome(g: { progress: number; movedPx: number; ms: number }): 'flip' | 'cancel'` — 짧게 누름(`movedPx <= TAP_MAX_MOVE_PX && ms <= TAP_MAX_MS`) 또는 `progress >= FLIP_COMPLETE`면 `'flip'`

- [ ] **Step 1: 검사 실행해서 실패 확인** (파일이 없으니 import 실패)

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { normalizePlanner } from "./src/planner/plannerLogic.ts";
import * as N from "./src/planner/notebookLogic.ts";
const empty = normalizePlanner({});
assert.equal(N.hasWriting(empty), false);
assert.equal(N.hasWriting({ ...empty, goal: "수학" }), true);
assert.equal(N.hasWriting({ ...empty, marks: { 3: 0 } }), true);
assert.equal(N.hasWriting({ ...empty, mood: 2 }), true);
assert.equal(N.hasWriting({ ...empty, rows: empty.rows.map((r, i) => i === 0 ? { ...r, done: true } : r) }), true);
// 빈 장은 안 셈, 집중 기록 날은 셈, 오늘 뒤는 안 셈, 중복 없음, 오름차순
const t = "2026-11-10";
const at = (d, h) => new Date(`${d}T${String(h).padStart(2,"0")}:00:00`).getTime();
const w = N.writtenDays(
  [{ day: "2026-11-08", data: { goal: "a" } }, { day: "2026-11-05", data: {} }, { day: "2026-11-12", data: { goal: "미리" } }],
  [at("2026-11-03", 9), at("2026-11-08", 10), at("2026-11-09", 3)], t);
assert.deepEqual(w, ["2026-11-03", "2026-11-08"]); // 11-09 03시는 새벽 5시 전이라 11-08
// firstUser
assert.deepEqual(N.writtenDays([], [], t), []);
assert.equal(N.canGoBack(t, [], t), false);
assert.equal(N.canGoForward(t, t), true);
assert.deepEqual(N.stackInfo([], t), { below: 0, flipped: 0, total: 0, index: 0 });
// withCurrent: 오늘 처음 씀 → 바로 늘어남, 지움 → 줄어듦, 앞날은 무시
assert.deepEqual(N.withCurrent(w, t, true, t), ["2026-11-03", "2026-11-08", t]);
assert.deepEqual(N.withCurrent(["2026-11-08"], "2026-11-08", false, t), []);
assert.deepEqual(N.withCurrent(w, "2026-11-12", true, t), w);
// 넘기기 한계
assert.equal(N.canGoBack("2026-11-03", w, t), false);
assert.equal(N.canGoBack("2026-11-04", w, t), true);
assert.equal(N.canGoForward("2026-11-16", t), true);
assert.equal(N.canGoForward("2026-11-17", t), false);
assert.equal(N.canGoForward("2026-11-17", "2026-11-11"), true); // 오늘이 바뀌면 한계도 옮겨짐
// 두 묶음
assert.deepEqual(N.stackInfo(w, "2026-11-08"), { below: 1, flipped: 0, total: 2, index: 2 });
assert.deepEqual(N.stackInfo(w, "2026-11-05"), { below: 1, flipped: 1, total: 2, index: 1 });
assert.equal(N.visibleSheets(47), 8);
assert.equal(N.visibleSheets(3), 3);
// 넘기기 판정
assert.equal(N.flipOutcome({ progress: 0, movedPx: 2, ms: 120 }), "flip");
assert.equal(N.flipOutcome({ progress: 0.3, movedPx: 80, ms: 600 }), "cancel");
assert.equal(N.flipOutcome({ progress: 0.6, movedPx: 200, ms: 600 }), "flip");
console.log("notebookLogic OK");
'
```
Expected: FAIL (`Cannot find module ... notebookLogic.ts`)

- [ ] **Step 2: `src/planner/notebookLogic.ts` 작성** — 위 Interfaces 의 상수·함수. 맨 위 주석에 "React 와 무관한 순수 로직 (Node 로 검사)"와 각 함수 한 줄 설명(`plannerLogic.ts` 머리말 형식). 날짜는 `YYYY-MM-DD` 문자열이라 문자열 비교로 순서를 정한다.

- [ ] **Step 3: Step 1 명령 다시 실행** — Expected: `notebookLogic OK`

- [ ] **Step 4: lint·build** — `npm run lint && npm run build` 통과

- [ ] **Step 5: Commit**
```bash
git add src/planner/notebookLogic.ts
git commit -m "feat: 플래너 노트 넘기기 순수 로직 (쓴 날, 넘기기 한계, 두 묶음)"
```

---

### Task 2: 글씨체 목록과 CSS 변수로 손글씨 바꾸기

**Files:**
- Create: `src/planner/handFonts.ts`
- Create: `public/fonts/hand-preview-ochungi.png`, `hand-preview-sangju.png`, `hand-preview-myoeun.png`
- Modify: `src/index.css` (오춘기 김작가 `@font-face` 아래에 두 글씨체 `@font-face`와 출처·라이선스 주석, `:root`에 `--hand-font`·`--hand-scale` 기본값)
- Modify: `src/planner/paperStyle.ts` (`HAND`, `handInput`, 새 `handSize`)
- Modify: `src/planner/PlannerSheet.tsx`, `src/planner/StickyNote.tsx`, `src/planner/BagLayer.tsx` (손글씨 글자 크기)

**Interfaces:**
- Produces:
  - `type HandFontId = 'ochungi' | 'sangju' | 'myoeun'`
  - `HAND_FONTS: { id: HandFontId; label: string; family: string; scale: number; preview: string }[]` — label: `'오춘기 김작가'`, `'상주다정다감'`, `'묘은또박'`. scale 은 지금 크기(오춘기) 기준 배율, 처음 값 `1`, `1`, `1` 로 두고 Step 4 에서 맞춘다.
  - `DEFAULT_HAND_FONT: HandFontId = 'ochungi'`
  - `handFontFromDb(v: unknown): HandFontId` — 목록에 없으면 기본값
  - `applyHandFont(id: HandFontId): void` — `document.documentElement.style`에 `--hand-font`, `--hand-scale` 설정
  - `paperStyle.ts`: `HAND = "var(--hand-font, 'OchungiKim', 'KyoboHandwriting2020A', cursive)"`, `handSize(px: number): string` → `` `calc(${px}px * var(--hand-scale, 1))` ``

- [ ] **Step 1: 검사로 실패 확인**
```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { HAND_FONTS, handFontFromDb, DEFAULT_HAND_FONT } from "./src/planner/handFonts.ts";
assert.deepEqual(HAND_FONTS.map(f => f.id), ["ochungi", "sangju", "myoeun"]);
assert.equal(handFontFromDb("sangju"), "sangju");
assert.equal(handFontFromDb("busan"), DEFAULT_HAND_FONT);
assert.equal(handFontFromDb(null), "ochungi");
console.log("handFonts OK");
'
```
Expected: FAIL (모듈 없음)

- [ ] **Step 2: `handFonts.ts`·`index.css`·`paperStyle.ts` 작성** — `paperStyle.ts`는 import 하지 않는 순수 데이터 파일로 두어 Node 검사가 되게 한다(`applyHandFont`는 `document`를 함수 안에서만 쓴다). `index.css` 주석에 라이선스: 상주시(산돌구름 표 "임베딩 사용 가능", 재판매 금지), 그리운 × 묘은(눈누 표 "임베딩 사용 가능", 파일 수정·재배포·판매 금지).

- [ ] **Step 3: 손글씨 글자 크기를 `handSize`로** — `fontFamily: HAND`나 `...handInput`을 쓰는 곳의 `fontSize: N`을 `fontSize: handSize(N)`로 바꾼다(`PlannerSheet` 53·57·62·66·69·70·79·83·98·103·107·131행, `StickyNote` 57행, `BagLayer` 127행; `handInput` 자체의 22 도). `printLabel`·`PRINT` 글자는 그대로.

- [ ] **Step 4: 미리보기 PNG 3장 만들기** — 스크래치 폴더에 세 글씨체로 "가나다"(잉크 `#2c3e66`, 투명 배경, 26px)를 쓴 HTML 을 만들고 Chrome 헤드리스로 찍어 `public/fonts/`에 둔다(폰트 파일 자체는 저장소에 넣지 않음):
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --default-background-color=00000000 --window-size=72,36 --screenshot=public/fonts/hand-preview-<id>.png file://<스크래치>/<id>.html
```
같은 HTML 로 세 글씨체를 플래너 칸 크기(22px·높이 26px)에 써 보고, 칸을 넘치는 글씨체는 `scale`을 줄인다(예: 0.9). 정한 값과 이유를 `handFonts.ts` 상수 옆 주석에.

- [ ] **Step 5: Step 1 검사 + lint·build** — `handFonts OK`, 둘 다 통과. 이 시점 화면은 기본 글씨 그대로여야 한다.

- [ ] **Step 6: Commit**
```bash
git add src/planner/handFonts.ts src/planner/paperStyle.ts src/planner/PlannerSheet.tsx src/planner/StickyNote.tsx src/planner/BagLayer.tsx src/index.css public/fonts/hand-preview-*.png
git commit -m "feat: 손글씨 글씨체 3가지를 CSS 변수로 바꿀 수 있게 준비"
```

---

### Task 3: 글씨체 계정 저장 (DB + 훅)

**Files:**
- Create: `supabase/migrations/0048_hand_font.sql`
- Create: `src/planner/useHandFont.ts`
- Modify: `src/planner/BagLayer.tsx` (훅 호출 한 줄 — 로그인 화면 어디서나 깔려 있어 글씨체가 앱 전체에 적용됨)

**Interfaces:**
- Consumes: Task 2 `HandFontId`, `handFontFromDb`, `applyHandFont`, `DEFAULT_HAND_FONT`
- Produces: `useHandFont(): { font: HandFontId; save: (id: HandFontId) => Promise<string> }` — save 성공 `''`, 실패 안내문. 같은 화면 안 여러 곳(BagLayer, PlannerWindow)이 같은 값을 보도록 `useMyAvatar`처럼 모듈 캐시 + 바뀜 알림.

- [ ] **Step 1: 마이그레이션 작성** — 머리말은 0045 형식(실행 위치: 서비스 프로젝트만, 실험 DB 실행 안 함 / 배경 / 권한). 본문:
```sql
begin;
alter table public.profiles
  add column hand_font text not null default 'ochungi'
  check (hand_font in ('ochungi', 'sangju', 'myoeun'));
commit;
```
정책 추가 없음(0004 "본인 프로필만 조회/수정"이 그대로 적용된다고 주석).

- [ ] **Step 2: `useHandFont.ts` 작성** — `useSession`으로 내 id, `profiles.select('hand_font').eq('id', myId).single()`. 읽기 오류(컬럼 없음 포함)는 `console.error` 후 기본값으로 두고 화면은 그대로. 값이 정해질 때마다 `applyHandFont`. `save`는 먼저 `applyHandFont`(바로 바뀌어 보이게) 후 update, 실패하면 이전 값으로 되돌리고 안내문 반환.

- [ ] **Step 3: lint·build 통과**

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/0048_hand_font.sql src/planner/useHandFont.ts src/planner/BagLayer.tsx
git commit -m "feat: 내 손글씨 글씨체를 계정에 저장 (profiles.hand_font)"
```

---

### Task 4: 형광펜 옆 펜 고르기

**Files:**
- Modify: `src/planner/PlannerWindow.tsx` (손잡이 줄)

**Interfaces:**
- Consumes: Task 2 `HAND_FONTS`, Task 3 `useHandFont`

- [ ] **Step 1: 형광펜 버튼들 뒤에 `펜` 글자 + 버튼 3개** — 각 버튼은 `HAND_FONTS[i].preview` 그림(`<img alt={label}>`), `title`/`aria-label`=label, `aria-pressed`. 고른 버튼은 형광펜과 같은 표시(흰 테두리 3px + 바깥 고리, ✓는 그림 오른쪽 위 작은 동그라미). 누르면 `save(id)`, 실패 안내문은 손잡이 줄 저장 상태 자리(`SAVE_TEXT` 칸)에 잠깐(3초) 보여 준다.

- [ ] **Step 2: lint·build 통과 후 사용자 확인 요청** — `npm run dev`로: 펜 셋이 각자 글씨로 보이는지, 누르면 플래너·붙인 메모·가방 속 메모 글씨가 바로 바뀌는지, 새로고침해도 유지되는지, 칸을 넘치지 않는지.

- [ ] **Step 3: Commit**
```bash
git add src/planner/PlannerWindow.tsx
git commit -m "feat: 플래너 형광펜 옆에서 손글씨 글씨체 고르기"
```

---

### Task 5: 쓴 날 읽기와 옆 장 미리 읽기 (훅)

**Files:**
- Modify: `src/planner/usePlanner.ts`

**Interfaces:**
- Consumes: Task 1 `writtenDays`
- Produces:
  - `useWrittenDays(today: string): string[] | null` — 플래너를 열 때 한 번 읽음(null = 읽는 중). `planner_pages`의 `day, data` 전부 + `study_segments`의 `kind = 'focus'`인 `started_at`. **둘 다 1000행씩 `.range()`로 끝까지 나눠 읽는다.** `today`가 바뀌면 다시 계산(다시 읽지는 않음).
  - `usePlannerPeek(day: string | null): { data: PlannerData; segs: Seg[] } | null` — 읽기 전용(저장 없음). null 이면 읽지 않음. 넘길 때 드러날 장을 미리 그리는 데 씀. 시간표 칠하기는 기존 `useDaySegments`를 재사용.

- [ ] **Step 1: 두 훅 작성** — 기존 `usePlannerPage`·`useDaySegments`와 같은 모양(`alive` 플래그, 오류는 `console.error` 후 빈 값).
- [ ] **Step 2: lint·build 통과**
- [ ] **Step 3: Commit**
```bash
git add src/planner/usePlanner.ts
git commit -m "feat: 플래너 쓴 날 목록과 옆 장 미리 읽기"
```

---

### Task 6: 종이 더미와 모서리 넘기기 (`NotebookStack`) + 플래너 창 연결

**Files:**
- Create: `src/planner/NotebookStack.tsx`
- Modify: `src/planner/PlannerWindow.tsx` (◀ ▶ 버튼 제거, "오늘" 버튼 유지, 시트 영역을 `NotebookStack`으로 감쌈)

**Interfaces:**
- Consumes: Task 1 전부, Task 5 `useWrittenDays`, `usePlannerPeek`, 기존 `PlannerSheet`
- Produces:
```ts
type Props = {
  width: number; height: number            // 배율 적용된 종이 크기 (창 크기 그대로)
  below: number; flipped: number           // 두 묶음 장 수 (visibleSheets 로 줄이기 전 값)
  label: string                            // "쓴 날 47장 중 37번째" (total 0 이면 "쓴 날 0장")
  canBack: boolean; canForward: boolean
  onBack: () => void; onForward: () => void
  top: ReactNode                           // 보고 있는 장 (입력 가능)
  prev: ReactNode | null                   // 지난날로 넘길 때 드러날 장 (읽기 전용)
  next: ReactNode | null                   // 앞날로 넘길 때 덮일 장 (읽기 전용)
}
export function NotebookStack(props: Props): JSX.Element
```

- [ ] **Step 1: 더미 그리기** — 아래 묶음: 종이 뒤에 `visibleSheets(below)`장, 장마다 왼쪽 아래로 1.5px씩 어긋나고 고정된 작은 회전(-1.5°~1.5°, 장 번호로 정해지는 값, 렌더마다 흔들리지 않게). 넘겨 온 묶음: 종이 오른쪽에 `visibleSheets(flipped)`장 가장자리가 1.5px씩 삐져나옴. 둘 다 최대 14px 이내. 아래에 `label`(PRINT 글꼴, 11px). 바로 아래 한 장 자리에 `prev`를 깔아 둔다.
- [ ] **Step 2: 모서리 끌기** — 오른쪽 아래·왼쪽 아래에 48×48px 모서리 영역(종이 입력 칸·창 손잡이 끌기와 분리, `touchAction: 'none'`, pointer 이벤트). 마우스를 올리면 모서리가 살짝 들림(접힌 삼각형). 오른쪽 아래를 끌면 맨 위 장이 왼쪽 끝을 축으로 `rotateY`(진행률 0→1, `perspective` + 그라데이션 그림자)로 들리며 `prev`가 드러남. 왼쪽 아래를 끌면 `next`가 오른쪽에서 덮이듯 들어옴. 놓을 때 `flipOutcome` → `'flip'`이면 끝까지 애니메이션(약 250ms) 후 `onBack`/`onForward`, `'cancel'`이면 제자리로. `canBack`/`canForward`가 false 면 그 모서리는 들리지 않고 반응 없음.
- [ ] **Step 3: `PlannerWindow` 연결** — `written = withCurrent(useWrittenDays(today) ?? [], day, hasWriting(data), today)`, `stackInfo(written, day)`로 below/flipped/label, `canGoBack(day, written, today)`/`canGoForward(day, today)`. `prev`/`next`는 `usePlannerPeek(canBack ? shiftDay(day,-1) : null)` 등으로 그린 `PlannerSheet`(update 는 아무것도 안 하는 함수). 넘기면 `setDay` — 쓰던 글은 기존 `usePlannerPage` 정리 단계에서 저장된다. ◀ ▶ 버튼 삭제, "오늘" 유지. 쓴 날을 읽는 중(null)이면 더미 없이 넘기기만.
- [ ] **Step 4: lint·build 통과 후 사용자 확인 요청** — `npm run dev`로: (1) 더미 두께가 쓴 날만큼인지 (2) 오른쪽 아래 끌기·짧게 누르기로 어제가 깜빡임 없이 드러나는지, 넘긴 장이 오른쪽 묶음에 쌓이는지 (3) 반만 끌다 놓으면 돌아오는지 (4) 처음 쓴 날·7일 뒤에서 멈추는지 (5) 오늘 장에 처음 글자를 쓰면 숫자가 바로 느는지 (6) 폰(기기 모드)에서 탭·끌기 (7) 창 옮기기·입력 칸이 그대로 되는지.
- [ ] **Step 5: Commit**
```bash
git add src/planner/NotebookStack.tsx src/planner/PlannerWindow.tsx
git commit -m "feat: 플래너를 쓴 날만큼 쌓인 종이로, 모서리를 끌어 넘기기"
```

---

### Task 7: 마무리

- [ ] **Step 1:** 설계 문서·계획 문서 커밋 (`docs: 스터디 플래너 노트 넘기기·글씨체 설계와 계획`)
- [ ] **Step 2:** Task 1·2 검사 명령 다시 실행, `npm run lint && npm run build`
- [ ] **Step 3:** 사용자에게 PR 여부 확인. PR 설명에 "적용할 DB: 서비스 Supabase, `0048_hand_font.sql` (머지 전 실행 — 육심호)", 관련 #385.
