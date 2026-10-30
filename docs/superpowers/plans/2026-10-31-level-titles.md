# 꽃 피는 칭호 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 누적 집중 시간으로 꽃 피는 8단계 칭호를 얻고, 닉네임 위 리본·공부 중 축하 카드·프로필·내 기록에 보여 준다.

**Architecture:** 단계 계산은 순수 로직(`src/level/levelLogic.ts`). 내 누적 시간·공개 범위는 기존 `profile_summary`(0013)로 읽는 훅 하나(`useMyTitle`). 공부 중에는 `StudyRunner` 가 "공부 전 누적 + 이번 공부 확정분"으로 넘김을 잡아 바깥에 알린다. 다른 사람에게는 공개 범위가 public 일 때만 `PresenceState.lv` 로 단계 번호를 싣는다. DB 변경 없음.

**Tech Stack:** TypeScript, React 19, React Three Fiber/drei(Billboard), Supabase JS.

**Spec:** `docs/superpowers/specs/2026-10-31-level-titles-design.md`

## Global Constraints

- 새 라이브러리 없음. DB(마이그레이션) 변경 없음. experiment 브랜치는 건드리지 않는다.
- 기준값(단계 시간·이름·이모지·색, 카드 표시 시간)은 파일 위쪽 이름 붙인 상수로.
- 주석·화면 글자는 한국어. 순수 로직은 React 와 무관하게(Node 로 검사).
- 축하 카드는 클릭·키 입력·초점을 가져가지 않는다(`pointer-events: none`, 버튼 없음, 소리 없음). 타이머·판정·트래킹에 영향 없음.
- 리본은 공개 범위를 따른다: 머리 위는 public 만, 프로필은 `profile_summary` 가 허락할 때만, 내 화면엔 늘.
- 커밋 전 `npm run lint`, `npm run build` 통과. 테스트 도구는 저장소에 넣지 않는다(검사 스크립트는 scratchpad, `tests/register.mjs` 훅으로 .ts 를 직접 불러옴).

## Review Focus

1. 과목·설정을 바꿔 `StudyRunner` 가 다시 만들어질 때 누적이 이중으로 세지거나 줄어들어, 이미 받은 칭호 축하가 또 뜨는 것 → 바깥(BranchScene)이 끝난 공부의 확정분을 더해 둔다(Task 4에서 검사).
2. 보류분(`pendingMs`)을 더해 칭호가 올랐다가 보류가 버려지는 것 → 확정분(`studyMs`)만 쓴다.
3. 칭호가 바뀌었는데 `changedEnough` 가 같다고 봐서 다른 사람 화면에 늦게 바뀌는 것(Task 2).
4. 공개 범위가 friends/private 인데 위치 메시지에 `lv` 가 실리는 것(Task 3).
5. 한 번에 여러 단계를 넘을 때 카드가 여러 번 뜨는 것 → 가장 높은 단계 하나(Task 1 `levelCrossed`).

---

### Task 1: 단계 계산 순수 로직

**Files:**
- Create: `src/level/levelLogic.ts`
- Test: `<scratchpad>/tests/level.test.mjs`

**Interfaces:**
- Produces:
  - `export type Title = { level: number; hours: number; name: string; emoji: string; color: string }`
  - `export const TITLES: Title[]` — 1~8단계, 스펙 3절 표 그대로 (hours 1, 5, 10, 30, 50, 100, 300, 1000; 이름 씨앗·새싹·떡잎·줄기·꽃봉오리·첫 꽃·만개·꽃밭; 이모지 🌰🌱🌿🪴🌷🌸🌺💐; 색 흙빛 갈색·연두·초록·진초록·분홍·진분홍·보라·금색 — hex 는 구현자가 시안 색에 맞춰 고름)
  - `export const MAX_LEVEL = 8`
  - `export function levelOf(seconds: number): number` — 0~8
  - `export function titleOf(level: number): Title | null` — 0이면 null
  - `export function progressOf(seconds: number): { level: number; next: Title | null; leftSeconds: number; ratio: number }` — 다음 단계까지 남은 초와 지금 단계 안에서의 비율(0~1). 8단계면 next null, ratio 1
  - `export function levelCrossed(beforeSeconds: number, nowSeconds: number): number | null` — 넘은 가장 높은 새 단계, 없으면 null
  - `export const DAILY_HOURS_GUESS = 2` 와 `export function daysLeft(leftSeconds: number): number` — 올림한 일수

- [ ] **Step 1: 실패하는 검사 작성** — `level.test.mjs`:
  - `levelOf(0)===0`, `levelOf(3599)===0`, `levelOf(3600)===1`, `levelOf(5*3600)===2`, `levelOf(1000*3600)===8`, `levelOf(5000*3600)===8`
  - `progressOf(62*3600)` → `level 5`, `next.name==='첫 꽃'`, `leftSeconds===38*3600`, `ratio` ≈ 12/50
  - `progressOf(1200*3600).next===null`
  - `levelCrossed(49*3600, 51*3600)===5`, `levelCrossed(0, 12*3600)===3`(한 번에 여러 단계 → 가장 높은 것), `levelCrossed(51*3600, 52*3600)===null`
  - `daysLeft(38*3600)===19`
- [ ] **Step 2: 실행해 실패 확인** — `node --import ./tests/register.mjs tests/level.test.mjs` → 모듈 없음 오류
- [ ] **Step 3: 구현** (`TITLES` 를 hours 오름차순 배열로, 나머지는 그 배열을 훑음)
- [ ] **Step 4: 실행해 통과 확인** → `level ok`
- [ ] **Step 5: 커밋** — `feat: 꽃 피는 칭호 단계 계산 (8단계)`

### Task 2: 머리 위 리본과 실시간 단계 칸

**Files:**
- Create: `src/level/ribbonTexture.ts` (캔버스 리본 텍스처, 단계마다 한 번만 만들어 캐시 — `NameTag` 의 nameTexture 방식)
- Modify: `src/realtime/participants.ts` (`PresenceState` 에 `lv?: number` — 칭호 단계, 공개 범위 public 일 때만 실음)
- Modify: `src/realtime/sendLogic.ts` (`changedEnough` 가 `lv` 도 비교)
- Modify: `src/realtime/NameTag.tsx` (`level?: number` 받으면 닉네임판 바로 위에 리본)
- Modify: `src/realtime/OtherParticipants.tsx` (두 `NameTag` 에 `level={p.lv}`)
- Test: `<scratchpad>/tests/send-lv.test.mjs`

**Interfaces:**
- Consumes: `titleOf`, `TITLES` (Task 1)
- Produces: `ribbonTexture(level: number): { texture: CanvasTexture; w: number; h: number } | null`, `NameTag({ x, z, name, level? })`, `PresenceState.lv`

- [ ] **Step 1: 실패하는 검사** — `changedEnough(base, { ...base, lv: 5 })===true` (base 는 `lv` 없음), `changedEnough({ ...base, lv: 5 }, { ...base, lv: 5 })===false`
- [ ] **Step 2: 실행해 실패 확인** (지금은 `lv` 차이를 무시해 false)
- [ ] **Step 3: 구현** — `changedEnough` 끊어진 값 줄에 `last.lv !== now.lv` 추가. 리본: 제비꼬리 양끝, "🌷 꽃봉오리" 굵은 흰 글씨, 단계 색 바탕(8단계는 금색 그라데이션). `NameTag` 는 리본을 닉네임판 위(닉네임판 높이 + 작은 틈)에 같은 Billboard 안에 둔다.
- [ ] **Step 4: 검사 통과 + `npm run lint && npm run build`**
- [ ] **Step 5: 커밋** — `feat: 닉네임 위 칭호 리본과 실시간 단계 칸`

### Task 3: 내 칭호 읽기와 위치 메시지에 싣기

**Files:**
- Create: `src/level/useMyTitle.ts`
- Modify: `src/space/BranchScene.tsx`, `src/world/WorldScene.tsx`, `src/meeting/MeetingScene.tsx` (위치 메시지 `me.current`/`meRef.current` 만드는 곳에 `lv`)

**Interfaces:**
- Consumes: `useProfile(userId)` (`src/profile/useProfile.ts`, `summary.total_seconds`·`summary.visibility`), `levelOf`
- Produces: `useMyTitle(userId: string | undefined): { savedSeconds: number | null; visibility: Visibility | null; level: number }` — `savedSeconds` 는 화면을 열 때 한 번 읽은 저장된 누적(못 읽었으면 null), `level` 은 그 값의 단계(0)
- 위치 메시지 규칙(세 화면 같게): `...(visibility === 'public' && lv > 0 ? { lv } : {})`. 지점에서는 `lv` 가 Task 4의 "지금 단계"(공부 중 오르면 바로 반영), 광장·회의실은 `useMyTitle().level`.

- [ ] **Step 1:** `useMyTitle` 구현 (useProfile 을 그대로 써서 내 요약 하나만 읽음)
- [ ] **Step 2:** 세 화면에 `lv` 싣기 — 공개 범위가 public 이 아니면 싣지 않음
- [ ] **Step 3:** `npm run lint && npm run build`
- [ ] **Step 4: 커밋** — `feat: 내 칭호를 공개 범위에 따라 다른 참여자에게 보내기`

### Task 4: 공부 중 칭호 오름 잡기 + 축하 카드

**Files:**
- Create: `src/level/LevelUpCard.tsx`
- Modify: `src/study/StudyRunner.tsx` (props `titleBaseSeconds?: number`, `onLevelUp?: (level: number) => void`, `onRunEnd?: (studyMs: number) => void`)
- Modify: `src/study/SeatedStudy.tsx` (세 props 를 StudyRunner 로 그대로 넘김)
- Modify: `src/space/BranchScene.tsx` (지금 단계·끝난 공부 확정분 보관, 카드 띄우기)
- Test: `<scratchpad>/tests/level.test.mjs` 에 이어서 (Review Focus 1·2)

**Interfaces:**
- Consumes: `levelCrossed`, `progressOf`, `titleOf` (Task 1), `useMyTitle` (Task 3)
- Produces: `LevelUpCard({ level, totalSeconds, onDone })` — `CARD_MS = 3500` 뒤 `onDone`
- 흐름:
  - BranchScene: `doneMs` ref(이 지점에서 끝난 공부들의 확정분 합). `titleBaseSeconds = savedSeconds + doneMs/1000`. `StudyRunner` 가 끝날 때(정리 함수) `onRunEnd(studyMs.current)` → `doneMs += studyMs`.
  - StudyRunner: `focus.studyMs`(확정분, 보류분 제외)가 바뀔 때 `levelCrossed(base + 이전 확정분/1000, base + 지금 확정분/1000)` 이 있으면 `onLevelUp(level)`. `savedSeconds` 를 못 읽었으면(null) 넘김을 잡지 않음.
  - BranchScene: `onLevelUp` → 지금 단계 갱신(위치 메시지 `lv` 에 바로 반영) + 카드.
  - 휴식방(`rest`)은 StudyRunner 가 없어 해당 없음.

- [ ] **Step 1: 실패하는 검사** — 시나리오 함수로 검증할 수 있게 `levelLogic` 에 `export function runCrossings(baseSeconds: number, studyMsSteps: number[]): number[]` 를 두고(StudyRunner 와 같은 규칙: 확정분만, 이전 값 대비) 검사:
  - `runCrossings(49*3600, [0, 30*60e3, 61*60e3, 62*60e3])` → `[5]` (한 번만)
  - 과목 바꾸기: 첫 공부 `runCrossings(49*3600, [0, 61*60e3])` → `[5]`, 이어서 둘째 공부 base 를 `49*3600 + 61*60` 으로 `runCrossings(base2, [0, 10*60e3])` → `[]` (이미 받은 5단계 축하가 또 안 뜸)
- [ ] **Step 2: 실행해 실패 확인**
- [ ] **Step 3: 구현** — `runCrossings` 는 `levelCrossed` 를 이어 부르는 얇은 함수, StudyRunner 는 같은 규칙을 ref 로. 카드: 화면 가운데 조금 위, 꽃 이모지가 커지며 피고 주변 꽃잎·반짝이가 터짐(CSS keyframes), "꽃봉오리 달성!", "누적 50시간 · 다음 🌸 첫 꽃까지 50시간"(8단계면 "가장 높은 단계예요"). `pointer-events: none`, 버튼·소리·초점 없음.
- [ ] **Step 4: 검사 통과 + `npm run lint && npm run build`**
- [ ] **Step 5: 커밋** — `feat: 공부 중 칭호가 오르면 축하 카드 (집중을 끊지 않게)`

### Task 5: 프로필 리본·진행 막대, 내 기록 "꽃 피는 길"

**Files:**
- Create: `src/level/TitleBadge.tsx` (DOM 리본: 3D 리본과 같은 모양·색), `src/level/FlowerPath.tsx`
- Modify: `src/profile/ProfileView.tsx` (이름 옆 리본, 내 프로필이면 진행 막대 + "누적 62시간 · 다음 🌸 첫 꽃까지 38시간", 공개 범위 칸 아래 안내 한 줄 "칭호도 이 범위를 따라요 (머리 위 칭호는 '모두'일 때만)")
- Modify: `src/study/RecordsPage.tsx` (`RecordsView` 위쪽에 `FlowerPath`)

**Interfaces:**
- Consumes: `progressOf`, `titleOf`, `TITLES`, `daysLeft` (Task 1), `useMyTitle` (Task 3), `ProfileSummary.total_seconds/allowed`
- Produces: `TitleBadge({ level })` (0이면 아무것도 안 그림), `FlowerPath({ seconds })`
- 남의 프로필: `summary.allowed` 이고 `levelOf(total_seconds) > 0` 일 때만 리본, 진행 막대 없음. 허락 안 되면 리본 없음.

- [ ] **Step 1:** `TitleBadge`, `FlowerPath`(8단계 한 줄: 지난 단계 색, 지금 크게, 남은 흐리게 + 진행 막대 + "다음 … 까지 N시간 (하루 2시간이면 약 M일)") 구현
- [ ] **Step 2:** ProfileView·RecordsView 연결
- [ ] **Step 3:** `npm run lint && npm run build`
- [ ] **Step 4: 커밋** — `feat: 프로필·내 기록에 칭호와 꽃 피는 길`

### Task 6: 화면 확인 안내

- [ ] 개발 서버에서 확인할 것을 사용자에게 안내: 리본(공개 범위 public/friends/private 바꿔 다른 계정에서 보기), 축하 카드(공부 중 넘김 — 기준 근처 계정이 없으면 개발 중에만 `TITLES` 를 임시로 낮춰 보는 방법 안내, 커밋하지 않음), 프로필·내 기록 화면. 확인하지 못한 부분은 못 했다고 말한다.
