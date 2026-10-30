# 광장 순위 게시판 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광장에 게시판을 세워 오늘·이번 주 공부 시간 순위(공개 범위 "모두"만)를 보여 준다. (#59)

**Architecture:** security definer DB 함수 `study_ranking`이 등수까지 매겨 20줄 + 내 줄만 돌려준다. `src/ranking/`에 순수 로직·읽기 훅·순위 창, `src/world/RankingBoard.tsx`가 3D 게시판. 게시판 E 는 Player 의 spots 에 게시판 자리를 더하고 `canSit=false → onSitBlocked`로 받는다.

**Tech Stack:** React 19, R3F 9, drei 10, three 0.186, Supabase(PL/pgSQL). 순수 로직은 Node `--experimental-strip-types` + 스크래치패드 `register.mjs`(저장소에 넣지 않음). 화면은 lint·build 와 로그인 없는 임시 미리보기(확인 뒤 지움).

**Spec:** `docs/superpowers/specs/2026-10-30-study-ranking-board-design.md`

## Global Constraints

- 브랜치 `feat/hyun/study-ranking-board`(develop d47149f 에서 땀). PR base `develop`, `Closes #59`. 머지 전에 서비스 DB 에 `0037_study_ranking.sql` 실행(PR 설명에 적음).
- 작업 중에는 커밋하지 않는다. 끝나면 멈추고 보고. "올려줘" 뒤 태스크별 커밋. `git add -A` 금지. Claude 표시 금지.
- 서울 기준 날짜(`Asia/Seoul`), 주는 월요일부터. 분 = 초 / 60 버림. 1분 이상만. 20줄. 판 3줄. 판 새로 읽기 5분.
- 공개 범위 `public` 만 `top` 에. 기록 원본은 내보내지 않음.
- 주석 한국어, 기준값은 파일 위쪽 상수, React compiler 린트 규칙.

## Review Focus

1. "친구만"·"나만"인 사람이 `top` 에 섞이면 안 된다 — Task 1 SQL 의 `where visibility = 'public'` 를 리뷰에서 확인, 화면 확인 목록에 공개 범위 바꾸기 포함.
2. 내가 비공개일 때 `me.rank` 는 공개 사람 기준 등수 — Task 1 SQL, Task 2 `myLine` 검사.
3. 같은 닉네임 셋 중 둘만 같을 때 그 둘만 태그 — Task 2 `labelNames` 검사.
4. 게시판이 시작 위치·길·벤치를 막지 않는지 — Task 3 화면 찍기.
5. 순위 창이 떠 있을 때 V·메뉴 단축키·감정표현이 막히는지 — Task 4 화면 확인 목록.

---

### Task 1: DB 함수 `study_ranking`

**Files:** Create `supabase/migrations/0037_study_ranking.sql`

- [ ] 스펙 3절대로 작성(`profile_summary` 틀: plpgsql, `stable security definer set search_path = ''`, `revoke ... from public, anon; grant ... to authenticated;`, `notify pgrst, 'reload schema'`). 순위는 CTE: `totals`(user_id, minutes) → `pub`(public, minutes ≥ 1, rank) → `top`(order by minutes desc, nickname, id limit 20).
- [ ] 문법은 리뷰로 확인(이 환경에 Postgres 없음). 사용자가 실행 뒤 화면으로 확인.

커밋: `feat: 공부 시간 순위 DB 함수 추가`

### Task 2: 순수 로직 `rankingLogic.ts`

**Files:** Create `src/ranking/rankingLogic.ts`. Test: 스크래치패드 `tests/ranking.test.mjs`

**Produces:**
```ts
export type Period = 'today' | 'week'
export type RankRow = { rank: number; id: string; nickname: string; minutes: number }
export type MyRank = { minutes: number; rank: number | null; visibility: Visibility }
export type Ranking = { period: Period; top: RankRow[]; me: MyRank }
export const TOP_N = 20, BOARD_TOP = 3, REFRESH_MS = 300_000
export const PERIOD_LABEL: Record<Period, string> // { today: '오늘', week: '이번 주' }
export function parseRanking(json: unknown): Ranking | null
export function labelNames(rows: { id: string; nickname: string }[]): string[]
export function minutesText(m: number): string
export function myLine(me: MyRank): { text: string; note: string }
export function boardLines(r: Ranking | null): string[]
```
- [ ] 검사 먼저(스펙 9절 Node 항목), 실패 확인 → 구현 → 통과.

커밋: `feat: 순위 표시 순수 로직 추가`

### Task 3: 게시판 자리와 3D 게시판

**Files:** Modify `src/world/world.json`, `src/world/worldLogic.ts`; Create `src/world/RankingBoard.tsx`. Test: 스크래치패드 `tests/board.test.mjs`

**Produces:** `PlazaLayout.board?: Point & { facing: Facing }`, `export const BOARD_NO = 1000`, `export function boardSpot(plaza): { no; x; z; rot } | null`, `plazaObstacles` 가 판 상자를 포함. `export function RankingBoard({ board, lines }: { board: Point & { facing: Facing }; lines: string[] })`.
- [ ] `boardSpot`·장애물 검사 먼저 → 구현 → 통과.
- [ ] RankingBoard: 기둥·판·지붕 띠(공용 재질 `MAT.wood`·`MAT.fence`), 앞면 캔버스(제목 "🏆 오늘의 공부왕" + lines), 값이 바뀔 때만 다시 그림, 언마운트 때 dispose.
- [ ] 임시 미리보기로 시작 위치에서 찍어 자리 맞춤.

커밋: `feat: 광장에 순위 게시판 세우기`

### Task 4: 읽기 훅·순위 창·광장 연결

**Files:** Create `src/ranking/useRanking.ts`, `src/ranking/RankingPanel.tsx`; Modify `src/world/WorldScene.tsx`, `CLAUDE.md`

- [ ] `useRanking(period, opts?)`(스펙 5절), `RankingPanel({ myId, onClose, onOpenProfile })`(스펙 7절, FortunePanel 의 Esc·포인터 잠금 해제 방식).
- [ ] WorldScene: spots 에 `boardSpot` 추가, `canEnter`/`blockedEnter`/안내 문구에서 `BOARD_NO` 처리, `rankingOpen` 상태를 `frozen`·`paused`·`disabled`·`panelRef` 에 더함, 판에는 `useRanking('today', { refreshMs: REFRESH_MS })` 결과의 `boardLines`.
- [ ] CLAUDE.md 폴더 구조에 `ranking/` 한 줄.
- [ ] lint·build, 임시 미리보기 삭제 확인.

커밋: `feat: 순위 창과 광장 게시판 연결`, `docs: CLAUDE.md 에 ranking 폴더 추가`
