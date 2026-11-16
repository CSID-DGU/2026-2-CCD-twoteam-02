# Cam Study Cafe 키오스크 1층 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1층 키오스크 하나에서 1·2층 자리를 배정하고, 2층 키오스크를 없애고, 남은 시간 창에서 반납할 수 있게 한다.

**Architecture:** DB는 그대로(층마다 다른 지점 번호). 키오스크가 건물의 층 목록(`buildingOf(PLACED, slug).floors`)과 층별 DB 번호를 받아 고른 층으로 `occupied_seat_numbers`·`assign_seat` 를 부른다. 지점 화면은 다른 층의 내 자리를 한 번 더 읽어 안내 문구를 만든다.

**Tech Stack:** React 19, TypeScript, Supabase JS. 테스트 도구는 없으므로 순수 로직은 `node --input-type=module` 로 확인하고, 나머지는 `npm run lint`·`npm run build`·개발 서버.

**Spec:** `docs/superpowers/specs/2026-11-16-cam-study-kiosk-merge-design.md`

## Global Constraints

- DB·마이그레이션 변경 없음.
- 문구: `내 자리: 2층 12번 · 계단으로 올라가세요` / `내 자리: 1층 5번 · 계단으로 내려가세요` / `1층 키오스크에서 자리를 받으세요` / `5번 자리를 반납할까요?`
- 반납 버튼은 이용권(`mode === 'pass'`)일 때만, 앉아 있는 동안은 숨김. 브라우저 confirm 금지.
- 층이 하나인 지점의 키오스크는 지금과 똑같이 보인다.
- 주석은 한국어.

## Review Focus

- 2층 키오스크를 지우면 `quickPlaces` 가 `!b.kiosk` 로 거르던 2층이 바로 앉기 목록에 새어 들어감 → `kioskAt` 으로도 거른다 (Task 1).
- 1층에서 2층 자리를 받은 직후 `onAssigned` 가 1층 `mySeat` 에 2층 번호를 넣으면 1층 같은 번호 의자가 파랗게 됨 → 층 번호를 같이 넘겨 지금 층일 때만 넣는다 (Task 2·3).
- 키오스크에서 2층 자리를 반납했을 때 1층 안내가 남아 있음 → 반납·배정 뒤 다른 층 자리를 다시 읽는다 (Task 3).
- 앉아서 공부 중 반납 → 버튼 숨김 (Task 4).
- 층 DB 번호를 아직 못 읽었을 때 키오스크 → 층 고르기 없이 지금 층만 (Task 2).

---

### Task 1: 층 안내 순수 로직 + 2층 키오스크 빼기

**Files:**
- Create: `src/kiosk/floorLogic.ts`
- Modify: `src/space/layout.ts` (BranchLayout 에 `kioskAt?: string` — 이 층의 자리를 받는 키오스크가 있는 층 slug)
- Modify: `src/space/branches/byeol-2f.json` (`kiosk` 삭제, `"kioskAt": "byeol"` 추가)
- Modify: `src/quickseat/quickSeatLogic.ts` (`!b.kiosk && !b.kioskAt`)

**Interfaces — Produces:**
- `floorSeatHint(hereLevel: number, mine: { level: number; seat: number }): string` → 위 문구
- `noSeatHint(kioskLevel: number | null): string` → kioskLevel 이 있으면 `${kioskLevel}층 키오스크에서 자리를 받으세요`, 없으면 `키오스크에서 자리를 지정하세요`

- [ ] node 로 확인: `floorSeatHint(1,{level:2,seat:12})` = `내 자리: 2층 12번 · 계단으로 올라가세요`, `floorSeatHint(2,{level:1,seat:5})` = `내 자리: 1층 5번 · 계단으로 내려가세요`, `noSeatHint(1)` = `1층 키오스크에서 자리를 받으세요`, `quickPlaces` 결과에 `byeol-2f` 없음
- [ ] lint·build

### Task 2: 키오스크 층 고르기

**Files:** Modify `src/kiosk/KioskScreen.tsx`; Create `src/space/useFloorIds.ts`

**Interfaces:**
- `useFloorIds(slugs: string[]): Map<string, number> | null` — `branches` 에서 `id, slug` 를 `in('slug', slugs)` 로 읽음
- `type KioskFloor = { level: number; layout: BranchLayout; branchId: number }` (floorLogic.ts 에 둠)
- KioskScreen 새 prop `floors?: KioskFloor[]` (2개 이상일 때만 층 버튼), `onAssigned?: (seat: number | null, branchId: number) => void`
- 좌석 단계 위에 `[1층 44석] [2층 46석]` 버튼. 처음 고른 층 = `branchId` 와 같은 층. 층 바꾸면 그 층으로 `loadOccupied`.
- 배정 완료 문구에 층이 둘 이상이면 `2층 12번 자리를 배정했습니다`.

- [ ] lint·build

### Task 3: 지점 화면 연결과 다른 층 안내

**Files:** Modify `src/space/BranchScene.tsx`; Create `src/space/useOtherFloorSeat.ts`

**Interfaces:**
- `useOtherFloorSeat(branchIds: number[], channel: number, refreshKey: unknown): { branchId: number; seat: number } | null` — `seat_sessions` 진행 중(ended_at null)·채널 같음·`seats.branch_id in ids`
- `onAssigned(seat, id)`: `id === BRANCH_ID` 이면 `setMySeat(seat)`, 아니면 `setMySeat(null)` 하고 refresh 올림
- 안내: `mySeat === null` 이면 다른 층 자리가 있을 때 `floorSeatHint`, 없으면 `noSeatHint(kioskAt 층 level)` (기존 "키오스크에서 자리를 지정하세요" 두 곳)

- [ ] lint·build

### Task 4: 남은 시간 창 반납

**Files:** Modify `src/kiosk/SeatTimeCorner.tsx`, `src/space/BranchScene.tsx`

**Interfaces:** SeatTimeCorner 새 prop `canRelease?: boolean`(기본 false), `onReleased?: () => void`. BranchScene 이 `canRelease={seat === null}`, `onReleased={() => setMySeat(null)}` 와 다른 층 자리 refresh.
- "시간 연장" 옆 "반납" → 창 안 확인(`5번 자리를 반납할까요?` / 회의실이면 `회의실 2번을 반납할까요?`) → `release_my_place` → `released.current = true` 후 `onReleased`, load.

- [ ] lint·build, 개발 서버 확인(스펙의 확인 항목)
