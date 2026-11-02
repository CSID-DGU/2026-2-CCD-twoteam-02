# 캠빛 중앙도서관 개편과 책 대여 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도서관을 원통 건물로 바꾸고, 저작권이 끝난 책을 사서·서가에서 빌려 가방에서 꺼내 읽으며, 읽는 시간은 과목 `독서`로 기록되게 한다.

**Architecture:** 대여 판정은 순수 함수(`src/library/libraryLogic.ts`), 대여 기록은 Supabase 표 + DB 함수, 책 본문은 책마다 나눈 정적 JSON(`public/books/`)이다. 읽기 창은 플래너처럼 가방(`BagLayer`)이 띄운다. 내부는 숨 라운지의 `theme.round`를, 사서는 바리스타 구조를, 서가 E 입력은 게시판의 가짜 자리 방식을 다시 쓴다. 공부 기록·랭킹·레벨은 고치지 않고, 과목 `독서`로 기존 흐름을 탄다.

**Tech Stack:** React 19, TypeScript, Vite, React Three Fiber, Supabase. 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-02-library-books-design.md`

## Global Constraints

- 브랜치 `feat/wonjun/library-books`(develop 기준), worktree `.claude/worktrees/library-books`. PR base `develop`. `experiment`에 넣지 않는다.
- 커밋·푸시·PR은 사용자가 요청할 때만 한다. 그래서 태스크에 커밋 단계를 두지 않는다. 태스크가 끝나면 커밋 메시지 제안만 남긴다.
- 테스트 도구는 없다. 순수 로직은 `node --input-type=module -e '...'`와 `node:assert`로 검사한다. 순수 파일끼리 import할 때 `.ts`를 붙인다.
- 태스크마다 `npm run lint`와 `npm run build`가 통과해야 한다. worktree에 `node_modules`가 없으면 먼저 `npm install`을 실행한다.
- 대여 기간 14일, 동시 대여 5권. `LOAN_DAYS`, `MAX_LOANS` 상수(SQL 함수에도 같은 값).
- 서가 분야는 정확히 `한국 단편`, `한국 장편`, `시`. 좌석 24석, 번호 유지.
- 주석·화면 글자는 한국어. 기준값은 파일 위 상수. 지점 배치는 `cambit-library.json`에 둔다.
- 도서관 `rules`(다른 탭·휴대폰 금지, 방해금지 고정)는 그대로 둔다.
- 일반 노트북 30FPS 이상, 2D→3D 1초 이내.

## Review Focus

1. **기한이 지난 뒤 다시 빌리기·가방 열기:** 기한이 지난 책은 가방에서 사라지고 다시 빌릴 수 있다. → Task 1 `isActive` 검사, Task 3 SQL 확인.
2. **책을 읽는 중 기한이 끝남:** 열린 창을 강제로 닫지 않고, 닫은 뒤에는 다시 열 수 없다. → Task 4 확인.
3. **책 파일을 받지 못함·손상됨:** 흰 화면이 아니라 안내 문구와 다시 시도 버튼이 나온다. → Task 2 `parseBook` 검사, Task 4 확인.
4. **두 탭에서 동시에 빌리기로 5권 초과나 중복 대여:** DB가 막고 한국어 안내가 뜬다. → Task 3 SQL 확인, Task 1 `loanErrorText` 검사.
5. **서가 앞에서 앉기·좌석 번호 혼동:** 서가의 가짜 자리 번호가 앉기, 좌석 예약, 다른 참여자 표시로 새지 않는다. → Task 6 확인.

---

### Task 1: 대여 순수 로직

**Files:** Create `src/library/libraryLogic.ts`

**Interfaces — Produces:**
```ts
export const LOAN_DAYS = 14
export const MAX_LOANS = 5
export const SHELVES = ['한국 단편', '한국 장편', '시'] as const
export type BookShelf = (typeof SHELVES)[number] // theme.ts 의 Shelf(벽 선반)와 다른 타입
export type Loan = { id: number; bookId: string; dueAt: string; returnedAt: string | null; position: number }
export type BookInfo = { id: string; title: string; author: string; shelf: BookShelf }
export type BookText = { id: string; title: string; author: string; paragraphs: string[] }
export function isActive(loan: Loan, nowMs: number): boolean
export function activeLoans(loans: Loan[], nowMs: number): Loan[]
export function canBorrow(bookId: string, loans: Loan[], nowMs: number): 'ok' | 'already' | 'full'
export function daysLeft(dueAt: string, nowMs: number): number
export function dueLabel(dueAt: string, nowMs: number): string
export function booksOfShelf(books: BookInfo[], shelf: BookShelf | null): BookInfo[]
export function parseBook(raw: unknown): BookText | null
export function loanErrorText(code: string | undefined, message: string): string
```

- [ ] **Step 1: 검사를 먼저 쓴다.** 코드가 없어 import 오류로 실패하는지 확인한다.

```js
import assert from 'node:assert'
import { isActive, canBorrow, daysLeft, dueLabel, booksOfShelf, parseBook, loanErrorText } from './src/library/libraryLogic.ts'
const now = Date.parse('2026-11-02T00:00:00Z'), day = 864e5
const loan = (over) => ({ id: 1, bookId: 'a', dueAt: new Date(now + 3 * day).toISOString(), returnedAt: null, position: 0, ...over })
assert(isActive(loan(), now))
assert(!isActive(loan({ returnedAt: new Date(now).toISOString() }), now))
assert(!isActive(loan({ dueAt: new Date(now).toISOString() }), now)) // 기한 시각이 되면 끝
assert.equal(canBorrow('a', [loan()], now), 'already')
assert.equal(canBorrow('a', [loan({ dueAt: new Date(now - day).toISOString() })], now), 'ok') // 기한 지나면 다시 빌림
assert.equal(canBorrow('z', ['a','b','c','d','e'].map((bookId) => loan({ bookId })), now), 'full')
assert.equal(daysLeft(new Date(now + 2.5 * day).toISOString(), now), 3) // 올림
assert.equal(dueLabel(new Date(now + 3 * day).toISOString(), now), 'D-3')
assert.equal(dueLabel(new Date(now + 3600e3).toISOString(), now), 'D-1') // 오늘 안에 끝나도 남은 동안은 D-1
const books = [{ id: 'a', title: '봄봄', author: '김유정', shelf: '한국 단편' }, { id: 'b', title: '태평천하', author: '채만식', shelf: '한국 장편' }]
assert.deepEqual(booksOfShelf(books, '시'), [])
assert.equal(booksOfShelf(books, null).length, 2)
assert.equal(parseBook({ id: 'a', title: 't', author: 'x', paragraphs: ['p'] })?.paragraphs.length, 1)
assert.equal(parseBook({ id: 'a', title: 't', author: 'x', paragraphs: [] }), null)
assert.equal(parseBook('깨진 값'), null)
assert.match(loanErrorText('23505', ''), /이미/)
assert.match(loanErrorText('P0001', '5권까지 빌릴 수 있어요'), /5권/)
```

- [ ] **Step 2:** 함수를 구현해 검사를 통과시킨다. `Date.parse`로 시각을 비교하고 React·DB를 import하지 않는다. 23505는 "이미 빌린 책이에요.", P0001은 받은 문장을 그대로, 나머지는 `책을 빌리지 못했어요: ${message}`로 돌려준다.
- [ ] **Step 3:** 커밋 제안 `feat: 책 대여 순수 로직`.

### Task 2: 책 내용과 출처 표

**Files:** Create `src/library/catalog.ts`, `public/books/<id>.json`, `docs/도서-출처.md`

**Interfaces — Produces:** `export const BOOKS: BookInfo[]`, `export const bookUrl = (id: string) => string` (`/books/${id}.json`).

- [ ] **Step 1:** 설계 문서의 후보를 공유마당(gongu.copyright.or.kr)과 위키문헌(ko.wikisource.org)에서 찾는다. 스크립트나 사이트 안내문이 아니라 본문만 쓴다. 기준에 맞는 판본이 없으면 뺀다. 시는 시인별 한 권으로 묶는다(id 예: `yun-dongju-poems`).
- [ ] **Step 2:** `docs/도서-출처.md`에 책별로 제목, 작가, 사망 연도, 출처 주소, 출처의 이용 조건, 판본 상태(맞춤법만 고침 등), 받은 날짜를 표로 적는다. 1962년 이후 사망한 작가가 없는지 표로 확인한다.
- [ ] **Step 3:** **사용자에게 표를 보여 주고 확인받는다. 확인 전에는 본문을 앱에 넣지 않는다.** 7권 미만이거나 어느 분야가 비면 사용자에게 알린다.
- [ ] **Step 4:** `public/books/<id>.json`을 `{ id, title, author, paragraphs: string[] }`로 만들고, 내용을 고쳐 쓰지 않는다. `BOOKS`를 채운다.
- [ ] **Step 5:** 모든 JSON이 `parseBook`을 통과하고 `BOOKS`의 id와 파일이 1:1인지 Node로 검사한다. 파일 크기 합계를 보고한다. `src`에 본문을 import하지 않아 초기 번들이 늘지 않는지 `npm run build`로 본다.

### Task 3: 대여 표와 훅

**Files:** Create `supabase/migrations/0055_book_loans.sql`, `src/library/useLoans.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
export function useLoans(): {
  loans: Loan[]            // 지금 유효한 대여만
  loading: boolean
  borrow(bookId: string): Promise<string | null> // 실패 시 안내문, 성공 시 null
  giveBack(loanId: number): Promise<string | null>
  savePosition(loanId: number, paragraph: number): void // 700ms 모아 저장
}
```

- [ ] **Step 1:** SQL을 쓴다. 번호는 PR 직전 `develop`의 최신 번호 다음으로 다시 확인한다. 머리 주석에 왜·권한·적용 DB(서비스 DB만)를 `0052_rest_days.sql` 형식으로 적는다.
  - 표 `book_loans`: `id bigint identity pk`, `user_id uuid default auth.uid() references profiles on delete cascade`, `book_id text not null`(1~80자 check), `borrowed_at timestamptz default now()`, `due_at timestamptz not null`, `returned_at timestamptz`, `position int not null default 0 check (position >= 0)`.
  - 유니크 부분 인덱스 `(user_id, book_id) where returned_at is null`.
  - RLS 켜기. select와 update는 본인 행만. insert·delete 정책은 두지 않는다.
  - `revoke update on book_loans from authenticated, anon` 후 `grant update (returned_at, position) to authenticated`. 기한은 사용자가 고칠 수 없다.
  - 함수 `borrow_book(p_book_id text) returns book_loans` (`security definer`, `set search_path = public`, 로그인 확인): 같은 사용자의 행을 먼저 `pg_advisory_xact_lock(hashtext(auth.uid()::text))`로 잠근다 → 기한 지난 미반납 행의 `returned_at`을 `due_at`으로 채운다 → 유효 대여가 5권 이상이면 `raise exception '5권까지 빌릴 수 있어요.'` → `due_at = now() + interval '14 days'`로 넣고 돌려준다. `execute`는 `authenticated`에만 준다.
- [ ] **Step 2:** 사용자에게 SQL을 보여 주고, 개발 중 적용할 DB를 정할 때까지 실제 DB에 실행하지 않는다. 적용은 머지 전에 육심호에게 요청한다.
- [ ] **Step 3:** 훅을 `useMemos.ts` 방식으로 구현한다. `.from('book_loans').select().is('returned_at', null)`로 읽고 `activeLoans`로 거른다. 빌리기는 `.rpc('borrow_book', { p_book_id })`, 반납은 `returned_at` update. 저장 대기 중인 `position`은 언마운트 때 저장한다. 다른 화면과 맞추도록 `useSubjects.ts`의 `listeners/changed` 방식을 쓴다.
- [ ] **Step 4:** 적용된 DB에서 SQL Editor로 확인한다: 다른 계정 행이 안 보임, `due_at` 직접 수정 실패, 같은 책 중복 대여 23505, 6권째 P0001, 기한 지난 책 재대여 성공. 적용 전이면 "미확인"으로 보고한다.

### Task 4: 가방과 읽기 창

**Files:** Create `src/library/ReaderWindow.tsx`, `src/library/useBookText.ts`. Modify `src/planner/BagLayer.tsx`

**Interfaces — Consumes:** Task 1~3. **Produces:** `ReaderWindow({ loan, info, onClose, onPosition })`.

- [ ] **Step 1:** `useBookText(id)`: `fetch(bookUrl(id))` → `parseBook`. 상태 `{ status: 'loading' | 'error' | 'ready', book, retry }`.
- [ ] **Step 2:** `ReaderWindow`: `PlannerWindow`처럼 손잡이로 옮기는 창이다. 본문은 문단 단위 세로 스크롤이고, 쪽 나눔은 하지 않는다. 처음 열 때 `loan.position` 문단으로 스크롤하고, 스크롤하면 화면 맨 위 문단 번호를 `onPosition`으로 보낸다. 오류면 안내 문구와 다시 시도 버튼을 보여 준다. 저자·제목을 위에 표시한다.
- [ ] **Step 3:** `BagLayer`에 `빌린 책` 칸을 추가한다. 책마다 제목, `dueLabel`, `꺼내기/넣기`, `반납`을 둔다. 빌린 책이 없으면 "도서관에서 책을 빌려 보세요."를 보여 준다. 꺼낸 책 id는 계정별 localStorage에 기억하고, 한 번에 한 권만 연다.
- [ ] **Step 4:** 기한 처리: 창을 연 동안 책이 만료돼도 강제로 닫지 않는다(`ReaderWindow`는 열 때 받은 `loan` 값을 쓴다). 닫으면 목록에서 사라져 다시 열 수 없다. 설계 문서의 "공부가 끝날 때까지 그대로"를 "창을 닫을 때까지"로 단순화한 것으로, 공부 흐름을 끊지 않는 것은 같다.
- [ ] **Step 5:** 사용자가 개발 서버로 확인: 다른 지점·광장에서 B로 열기, 새로고침 뒤 읽던 위치, 네트워크를 끊고 오류 화면, 공부 중 책을 열어도 `offscreen`이 되지 않음.

### Task 5: 원통 내부

**Files:** Modify `src/space/branches/cambit-library.json`, `src/space/theme.ts`, `src/space/layout.ts`, `src/space/Decor.tsx`, `src/space/BranchInterior.tsx`. Create `src/space/LibraryStacks.tsx`, `supabase/migrations/0056_library_seats.sql`

**Interfaces — Produces:**
```ts
// theme.ts
export type LibraryStack = { a: number; shelf: BookShelf }   // a: 방 가운데에서 본 각도 (자리 각도 규칙, 0 = +z)
export const STACK = { from: 5.6, to: 9.2, thick: 0.6, h: 2.6, boxStep: 0.45 }
export function stackBoxes(stacks?: LibraryStack[]): Box[] // decorBoxes 에 합침
export function stackFront(s: LibraryStack): { x: number; z: number; rot: number } // r = 4.9, 책장을 바라봄
// theme 추가 필드: stacks?: LibraryStack[]; round.windows?: number; ceiling.grid?: number (격자 칸 크기 m)
// layout.ts: SeatDesk 에 'long' 추가 (이어 붙는 긴 나무 책상 + 스탠드)
```

- [ ] **Step 1:** `stackBoxes`와 `stackFront`를 Node로 먼저 검사한다: `a = Math.PI`면 상자가 모두 `z` -5.6~-9.2 사이이고, 앞자리는 `{x≈0, z≈-4.9}`이며 어떤 상자와도 겹치지 않는다.
- [ ] **Step 2:** JSON을 바꾼다. `size` 20×20, 바깥 벽 4개를 ±10으로, `spawn {0, 9}`, `door {0, 10, 1.6, 0.3}`, `theme.round {r: 9.6, gaps: [0], windows: 10, fins: 10}`, 천장 `grid: 2`, 나무 바닥, 의자 빨강 `#b3262e`, 책상 밝은 나무. `shelves`는 지운다.
- [ ] **Step 3:** 좌석: 번호 1~24, `desk: 'long'`, `rot: 3.142`. x는 `-3.25, -1.95, -0.65, 0.65, 1.95, 3.25`, z는 `-0.6, 1.2, 3.0, 4.8`. `stacks`는 각도 `π, π±0.45, π±0.9, π±1.35`의 7개에 왼쪽부터 `시, 시, 한국 장편, 한국 단편, 한국 단편, 한국 단편, 한국 단편` 순으로 둔다.
- [ ] **Step 4:** `LibraryStacks`: 책장 몸체와 책등을 `InstancedMesh`로 한 번에 그리고, 책등 색·두께는 시드로 고정한다. 안쪽 끝면에 분야 흰 안내판을 단다. 흰 기둥 4개와 큰 화분은 `decorBoxes`에 잡히는 기존 `pillars`·`planters`를 쓴다. `RoundWall`에 `windows` 패널, 천장에 `grid` 격자를 추가하고 다른 지점 화면은 바뀌지 않게 한다.
- [ ] **Step 5:** `0056_library_seats.sql`: `cambit-library`의 24개 좌석 `pos_x`, `pos_z`를 JSON 값으로 update한다. JSON과 같은 값인지 Node로 비교한다.
- [ ] **Step 6:** 사용자가 개발 서버로 확인(`/space?branch=cambit-library`): 벽·책장을 뚫지 않음, 문 통과, 모든 자리에 앉았다가 일어나기, 1인칭 시야 가림, FPS 30 이상, 숨 라운지 등 다른 지점 그대로.

### Task 6: 사서와 서가, 대여 창

**Files:** Create `src/library/BookPanel.tsx`. Modify `src/space/baristaLogic.ts`, `src/space/layout.ts`, `src/space/BranchScene.tsx`, `src/space/branches/cambit-library.json`, `src/space/branches/index.ts`

**Interfaces — Consumes:** Task 1~3, Task 5의 `stackFront`. **Produces:**
```ts
// baristaLogic.ts: Barista 에 service?: 'library' 추가. 값이 있으면 주문 대신 대여 창을 엽니다
// layout.ts
export const SHELF_NO = 9100 // 9100 + 책장 순서. 게시판(NOTE_BOARD_NO)처럼 앉지 않는 가짜 자리
export const isShelfNo = (no: number) => no >= SHELF_NO && no < SHELF_NO + 100
export function shelfSpots(theme?: BranchTheme): Spot[]
// BookPanel({ shelf: BookShelf | null, onClose }) — null 이면 전체 목록
```

- [ ] **Step 1:** `shelfSpots` 검사: 번호가 9100부터 이어지고 24개 좌석 번호와 겹치지 않으며, 책장 상자와 겹치지 않는다.
- [ ] **Step 2:** JSON의 `barista`를 사서로 채운다: `{x: -5, z: 6.5, w: 2.4, facing: 'east', counter: true, service: 'library', menu: [], greeting: '찾는 책이 있으세요? 📚', look: ...}`. `index.ts`에서 `barista`를 단언한다.
- [ ] **Step 3:** `BranchScene`을 잇는다. `freeSpots`에 `shelfSpots`를 더한다. `canSitHere`에서 서가 번호를 제외하고 `acts`에 포함하며, `onSitBlocked`에서 서가 번호면 그 책장의 분야로 창을 연다. 힌트 문구는 `{분야} 서가 · E 책 보기`와 사서의 `사서 · E 책 빌리기`다. `onKiosk`는 `barista.service === 'library'`면 `setBookShelf(null)`을 호출한다. 창이 열린 동안 이동·시점 전환을 막는 기존 조건 목록에 넣는다.
- [ ] **Step 4:** `BookPanel`: 책별 제목, 저자, `대여하기` 또는 `빌린 책`을 보여 준다. `canBorrow`가 `full`이면 버튼을 끄고 안내한다. 성공하면 "가방에 넣었어요. B키로 꺼내 읽어요."를 보여 주고, 실패하면 `borrow`의 안내문을 표시한다. 폰(`touch`)에서도 빌릴 수 있게 한다.
- [ ] **Step 5:** 사용자가 개발 서버로 확인: 서가별 목록이 맞음, 사서는 전체 목록, 서가 앞 번호로 앉아지지 않음, 다른 참여자 화면에 가짜 자리가 보이지 않음, 카페 바리스타 주문은 그대로.

### Task 7: 원통 외관

**Files:** Create `src/world/LibraryDrum.tsx`. Modify `src/world/campus.json`, `src/world/worldLogic.ts`, `src/world/WorldScene.tsx`, `src/world/CampusDecor.tsx`

**Interfaces — Produces:**
```ts
// BuildingSpec 에 shape?: 'drum' 추가
export function drumBoxes(rect: Box): Box[] // 둘레를 BOX_STEP 0.8 간격 작은 상자로
```

- [ ] **Step 1:** `drumBoxes` 검사: 모든 상자 중심이 원 위에 있고, 입구 앞 상자가 문을 막지 않는다.
- [ ] **Step 2:** `campus.json`의 도서관을 `x -6, z -26, w 12, d 12, shape: 'drum'`으로 바꾼다. 앞면 z -20은 그대로이고, 뒤쪽 끝은 울타리 -32에 닿는다. 나무 `(6, -27.5)`와 벤치 `(2, -18.6)`와 겹치지 않는지 Node로 검사한다.
- [ ] **Step 3:** `plazaObstacles`는 `shape === 'drum'`이면 `rect` 대신 `drumBoxes(rect)`를 쓴다. `WorldScene`은 `Building` 대신 `LibraryDrum`을 그리고 `CampusBuildingTrim`은 건너뛴다. 시계탑·담쟁이도 그래서 사라진다. 전체 지도(`src/map`)가 네모로 깨지지 않는지 본다.
- [ ] **Step 4:** `LibraryDrum`: 밝은 석재 원통, 위 띠 2줄, 입체 `LIBRARY` 글자(새 폰트 라이브러리 없이 기존 `labelTexture` 방식으로 곡면에 맞춰 글자별 판), 가운데 2층 높이 유리창과 양옆 창, 유리문 두 짝(`near`·`open` 색 규칙은 `Building`과 같게), 양쪽 벽등, 문 앞 붉은 벽돌 길.
- [ ] **Step 5:** 사용자가 개발 서버로 확인(`/campus`): `~/Downloads/IMG_4662.JPG`와 비교, 건물 둘레 부딪힘, 입구 E, 나갔을 때 문 앞으로 복귀, 캠퍼스 FPS.

### Task 8: 독서 과목 연결과 전체 확인

**Files:** Modify `src/study/StartStudyDialog.tsx`, 그 부모(`src/study/SeatedStudy.tsx` 또는 `StudyRunner.tsx`)

- [ ] **Step 1:** `StartStudyDialog`에 `suggestReading?: boolean`을 추가한다. 빌린 책이 있고 활성 과목에 `독서`가 없으면 칩 `+ 독서`를 보여 주고, 누르면 `addSubject('독서')`로 만들어 고른다. 정리해 둔 `독서`가 있으면 칩을 숨겨 이름 겹침을 피한다.
- [ ] **Step 2:** 전 과정을 사용자와 확인한다: 도서관 입장 → 서가에서 대여 → 착석 → `독서`로 공부 시작 → 가방에서 책 꺼내기 → 타이머 증가 → 눈 감음·자리 이탈 시 멈춤 → 내 기록·랭킹·레벨 반영 → 반납. 다른 지점에서도 한 번 반복한다.
- [ ] **Step 3:** 도서관 규칙 확인: 공부 시작 창의 다른 탭·휴대폰 고정, 방해금지 고정.
- [ ] **Step 4:** `npm run lint`, `npm run build`, `./scripts/check-db.sh`(DB 적용 뒤). PR 설명 초안에 Issue 번호, "적용할 DB: 서비스 Supabase, `0055_book_loans.sql`, `0056_library_seats.sql`"를 적는다. 사용자가 요청하면 커밋·PR한다. 개인 문서(CLAUDE.local.md, PRIVATE_CONTEXT.md)를 갱신한다.
