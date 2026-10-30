# 캠빛 대학교 2단계: 건물 실내와 건물별 규칙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캠퍼스 건물 다섯 곳(도서관·강의동·정보관·학생회관 카페·학생 라운지)에 실내·좌석을 채우고, 건물마다 공부 방식(고정 설정·방해금지 고정·감정표현 끔·휴식)을 적용하며, 나오면 캠퍼스로 돌아간다.

**Architecture:** 지점 JSON 에 `rules`(고정 공부 설정·조용함)를 두고, 규칙 계산은 순수 함수(`src/space/rulesLogic.ts`). 공부 시작 창은 규칙을 받아 고정된 칸을 잠그고 안내한다. 도서관의 방해금지 고정은 작은 전역 저장소(`quietLock`)로 채팅 쪽에 알린다. 지점에서 나갈 때 돌아갈 월드는 `worldConfig` 가 지점 slug 로 찾는다. 실내 소품(칸막이 책상·초록 독서등·칠판·계단식 단·컴퓨터 책상)은 `Decor.tsx` 에 더한다.

**Tech Stack:** TypeScript, React 19, R3F, Supabase(마이그레이션 SQL 하나).

**Spec:** `docs/superpowers/specs/2026-10-31-cambit-campus-design.md` (9절 2단계, 5절)

## Global Constraints

- 새 라이브러리 없음. experiment 건드리지 않음. 테이블 변경 없음 — 지점·좌석 행만 넣는 마이그레이션 `0038_cambit_campus.sql`(kind `cafe`, 회의실 없음, 다시 실행해도 됨).
- 광장 지점들 동작 그대로(규칙 없는 지점은 지금과 같음).
- 배치는 JSON, 기준값은 상수, 주석·화면 글자 한국어. 강의실 공동 시간표는 3단계(이번엔 칠판·좌석만).
- 커밋 전 lint·build. 검사 스크립트는 scratchpad.

## Review Focus

1. 고정 설정이 공부 시작 창에서만 잠기고 실제 판정(StudyRunner)엔 사용자가 고른 값이 들어가는 것 → Task 1 `applyRules` 검사 + Task 2 에서 StudyRunner 에 넘기는 값이 `applyRules` 결과인지.
2. 도서관을 나가도 방해금지가 계속 고정되는 것(저장소 정리 누락) → Task 2 검사(잠금 해제).
3. 캠퍼스 건물에서 나왔는데 광장으로 가는 것 / 광장 지점에서 나왔는데 캠퍼스로 가는 것 → Task 3 검사.
4. 계단식 단(강의실)·칸막이(도서관) 때문에 자리에 못 가거나 일어나 갇히는 것 → Task 4 길찾기·일어나기 검사.
5. 학생 라운지(휴식)에서 공부 창이 뜨는 것 → `rest: true` 를 Task 4 검사로 고정.

---

### Task 1: 건물 규칙 순수 로직

**Files:**
- Create: `src/space/rulesLogic.ts`
- Modify: `src/space/layout.ts` (`BranchLayout.rules?: BranchRules`), `src/chat/chatLogic.ts` (`isQuiet(studying, manual, studyOff, locked = false)` — locked 면 항상 true)
- Test: `<scratchpad>/tests/rules.test.mjs`

**Interfaces:**
- `export type BranchRules = { allowOtherScreen?: boolean; allowDevices?: boolean; quiet?: boolean; emotes?: boolean; label?: string }` — 정해진 칸만 고정, 없는 칸은 사용자가 고름. `label`: 공부 시작 창 안내("도서관은 조용히 혼자 몰입하는 곳이에요")
- `export function applyRules<T extends { allowOtherScreen: boolean; allowDevices: boolean }>(choice: T, rules?: BranchRules): T`
- `export function lockedSettings(rules?: BranchRules): { allowOtherScreen: boolean | null; allowDevices: boolean | null }` — null 이면 고를 수 있음
- `export const emotesAllowed = (rules?: BranchRules) => rules?.emotes !== false`

- [ ] **Step 1: 실패하는 검사** — `applyRules({..., allowOtherScreen:true, allowDevices:true}, {allowOtherScreen:false, allowDevices:false})` → 둘 다 false; 규칙 없으면 그대로; 한 칸만 고정; `lockedSettings` null/값; `emotesAllowed({emotes:false})===false`; `isQuiet(false,false,false,true)===true`, `isQuiet(true,false,true,true)===true`(직접 꺼도 고정), 기존 3인자 결과 그대로
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 + lint·build**
- [ ] **Step 5: 커밋** — `feat: 건물별 공부 규칙 계산 (고정 설정·방해금지 고정·감정표현)`

### Task 2: 규칙을 공부 시작 창·판정·채팅·감정표현에 적용

**Files:**
- Create: `src/chat/quietLock.ts` (전역 저장소: `setQuietLock(on)`, `useQuietLock()` — liveTitle 과 같은 useSyncExternalStore 방식)
- Modify: `src/study/StartStudyDialog.tsx` (`rules?` prop: 고정 칸은 체크 잠금·고정 값 표시, 맨 위 `label` 안내), `src/study/SeatedStudy.tsx` (`rules?` → 창에 넘기고 `onStart` 의 선택에 `applyRules`), `src/space/BranchScene.tsx` (`branch.rules` 를 SeatedStudy 에, `emotesAllowed` 면 EmoteControls 켬, `rules.quiet` 면 들어와 있는 동안 `setQuietLock(true)` 나갈 때 false), `src/chat/ChatProvider.tsx` (`quiet = isQuiet(…, useQuietLock())`, 잠금 중 `setQuiet` 무시), `src/chat/ChatOverlay.tsx` (잠금 중 방해금지 버튼에 "도서관이라 켜져 있어요", 누를 수 없음)
- Test: `<scratchpad>/tests/quiet-lock.test.mjs` — 저장소 켜고 끄기·알림, 끈 뒤 false

- [ ] **Step 1: 실패하는 검사(quietLock) → 실패 확인 → 구현 → 통과**
- [ ] **Step 2:** 창·판정·지점·채팅 연결, lint·build
- [ ] **Step 3: 커밋** — `feat: 도서관·정보관 고정 설정과 도서관 방해금지·감정표현 끔`

### Task 3: 캠퍼스 건물에서 나오면 캠퍼스로

**Files:**
- Modify: `src/world/worldConfig.ts` (`export function worldOfBranch(slug: string): WorldConfig` — 그 지점(위층 포함)이 있는 월드, 없으면 광장), `src/space/BranchScene.tsx` (나가기 `navigate(worldOfBranch(branch.id).path, …)`, 출입문 표지판·안내·L 키 글자 "광장" → 그 월드 이름(`title`))
- Test: `<scratchpad>/tests/branch-world.test.mjs` — `worldOfBranch('cambit-library').id==='campus'`, `('breath')` 와 `('byeol')` 은 `'plaza'`, 없는 slug 는 `'plaza'`

- [ ] **Step 1: 실패하는 검사 → 실패 확인 → 구현 → 통과 + lint·build**
- [ ] **Step 2: 커밋** — `feat: 캠퍼스 건물에서 나오면 캠퍼스로`

### Task 4: 다섯 건물 실내

**Files:**
- Modify: `src/space/branches/cambit-*.json` (생성 스크립트 scratchpad), `src/space/layout.ts` (`Seat.desk` 에 `'carrel' | 'computer'`, `Seat.rise?: number` — 계단식 단 위 자리: 의자·책상·앉은 높이를 올림), `src/space/theme.ts` (`risers?: {x,z,w,d,h}[]`(부딪힘), `board?: {x,z,w,h,face}`(칠판), `greenLamps?: boolean`), `src/space/Decor.tsx` (`Carrel`(책상 + 세 면 칸막이 + 초록 독서등), `ComputerDesk`(모니터·키보드), `Risers`, `Blackboard`), `src/space/BranchScene.tsx` (desk 종류·rise 그리기)
- Test: `<scratchpad>/tests/cambit-rooms.test.mjs`

**Interfaces / 내용:**
- 공통: 16×16 방, 남쪽 출입문, 캠퍼스 분위기(벽돌 벽·흰 몰딩·원목·남색/크림), 회의실 없음
- 📚 `cambit-library` "캠빛 중앙도서관": 칸막이 책상 24석(4줄), 벽 서가(shelves), 높은 천장·큰 창 느낌, 초록 독서등. `rules: { allowOtherScreen:false, allowDevices:false, quiet:true, emotes:false, label:'도서관은 조용히 혼자 몰입하는 곳이에요' }`
- 🏛 `cambit-lecture` "캠빛 강의동": 북쪽 벽 칠판, 긴 책상 3줄×8석, 뒤 두 줄은 계단식 단(`rise` 0.3·0.6, 단은 부딪힘 상자·통로는 비움). 규칙 없음(3단계에서 시간표).
- 🖥 `cambit-info` "캠빛 정보관": 컴퓨터 책상 20석(줄지어). `rules: { allowOtherScreen:true, allowDevices:true, label:'정보관은 인강·코딩처럼 다른 화면을 써도 공부로 인정돼요' }`
- ☕ `cambit-cafe` "학생회관 카페": 큰 테이블 5개×4석(카페 지점과 같은 규칙), 커피 바 느낌
- 🌳 `cambit-lounge` "학생 라운지": `rest: true`, 라운지 소파(`chair:'lounger'`) 10석 + 러그·화분
- 검사(각 방): 좌석 번호 1..N, 책상·소품·단 겹침 없음, 들어오는 자리에서 모든 의자 자리에 0.85 안으로 걸어서 닿음, 모든 의자 자리에서 일어나 0.5m 넘게 걸어 나감, 라운지 `rest`, 도서관·정보관 `rules`

- [ ] **Step 1: 실패하는 검사 → 실패 확인** (지금은 좌석 없음)
- [ ] **Step 2: 소품·필드 구현, 배치 생성 → 통과 + lint·build**
- [ ] **Step 3: 커밋** — `feat: 캠빛 대학교 건물 다섯 곳 실내`

### Task 5: 마이그레이션

**Files:**
- Create: `supabase/migrations/0038_cambit_campus.sql` (생성 스크립트가 JSON 좌석으로 만듦; 0036 과 같은 모양: 지점 5개 + 좌석, `on conflict do nothing`)

- [ ] **Step 1:** 생성·확인(행 수 = JSON 좌석 수), 커밋 — `feat: 캠빛 대학교 지점·좌석 마이그레이션`

### Task 6: 화면 확인 안내
- [ ] SQL 실행(클립보드), 각 건물 들어가 앉아 보기(도서관: 설정 잠김·방해금지 고정·감정표현 없음, 정보관: 다른 탭 써도 초록, 라운지: 공부 창 없음, 강의실: 단 위 자리), 나오면 캠퍼스 정문 쪽이 아니라 그 건물 앞. 못 본 것은 못 봤다고 말함.
