# 캠빛 대학교 3단계: 강의실 공동 시간표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캠빛 강의동에서 실제 시계(한국 시간) 기준으로 모두 같은 시간표(매시 정각~50분 수업, 50분~정각 쉬는 시간)를 칠판에 보여 주고, 쉬는 시간엔 타이머·기록만 자동으로 멈췄다가 수업 시작에 자동으로 이어 간다.

**Architecture:** 시간표 계산은 순수 함수(`src/study/timetableLogic.ts`, 지금 시각 → 수업/쉬는 시간·교시·남은 시간). 지점 규칙 `rules.timetable` 이 켜진 지점(강의동)만 1초마다 시간표를 읽는 훅(`useClassPhase`)을 쓴다. 쉬는 시간은 사용자의 "공부 중지"(`paused`, #236)와 따로 `breakNow` 로 내려보내, StudyRunner 는 `paused || breakNow` 일 때 판정·기록을 멈추되 캐릭터를 얼리거나 "다시 시작" 버튼을 띄우지 않는다. 칠판 글씨는 지점 화면이 시간표 문구로 바꿔 넘긴다.

**Tech Stack:** TypeScript, React 19, R3F. DB 변경 없음.

**Spec:** `docs/superpowers/specs/2026-10-31-cambit-campus-design.md` 6절

## Global Constraints

- 새 라이브러리·DB 변경 없음. experiment 건드리지 않음. 시간표 없는 지점은 지금과 같음.
- 기준값(수업 50분, 한 시간 60분, 한국 시간 +9) 상수로. 주석·화면 글자 한국어.
- 알림은 누를 것·초점·소리 없음(축하 카드와 같은 원칙), 3~4초 뒤 사라짐.
- 커밋 전 lint·build. 검사는 scratchpad.

## Review Focus

1. 쉬는 시간에도 기록(study_logs·segments)이 쌓이는 것 → StudyRunner 의 저장·구간 모으기가 `paused` 만 보지 않고 `halted`(= paused || breakNow)를 보는지.
2. 쉬는 시간에 캐릭터가 얼거나 나갈 수 없는 것 → `onDialogChange` 에 breakNow 를 넣지 않음.
3. 수업 시작에 자동으로 다시 시작되지 않는 것 / 사용자가 직접 중지한 것까지 풀리는 것 → `paused` 와 `breakNow` 를 따로 둠(Task 2).
4. 시간대 경계(59:59 → 00:00, 49:59 → 50:00)와 교시 번호(자정 넘김) → Task 1 검사.
5. 시간표 없는 지점(도서관 등)의 공부 화면이 바뀌는 것 → breakNow 기본 false.

---

### Task 1: 시간표 계산

**Files:** Create `src/study/timetableLogic.ts`; Test `<scratchpad>/tests/timetable.test.mjs`

**Interfaces:**
- `export const CLASS_MINUTES = 50`, `export const KST_OFFSET_MIN = 9 * 60`
- `export type ClassPhase = { phase: 'class' | 'break'; period: number; leftMs: number }` — period: 그날(한국 시간) 몇 교시(0시대 = 1교시 … 23시대 = 24교시), leftMs: 이 구간이 끝날 때까지
- `export function classPhase(nowMs: number): ClassPhase`
- `export function boardText(p: ClassPhase): string` — 수업 "2교시 · 남은 시간 23분", 쉬는 시간 "쉬는 시간 · 7분" (분은 올림, 1분 미만은 "1분")

- [ ] **Step 1: 실패하는 검사** — 한국 시간 13:05:00 → class, period 14, leftMs 45분; 13:49:59 → class, leftMs 1초; 13:50:00 → break, leftMs 10분; 13:59:59 → break; 14:00:00 → class period 15; 한국 23:55 → break period 24; 한국 00:10 → period 1; `boardText` 두 모양·올림
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과**
- [ ] **Step 5: 커밋** — `feat: 강의실 공동 시간표 계산 (매시 50분 수업·10분 쉬는 시간)`

### Task 2: 쉬는 시간 멈춤 (StudyRunner·SeatedStudy)

**Files:** Modify `src/study/StudyRunner.tsx` (`breakNow?: boolean`, `halted = paused || breakNow` 를 판정·추적·표시등·구간·샘플 기록에, 쉬는 시간 화면 "☕ 쉬는 시간 · 다음 수업까지 N분"(다시 시작·중지 버튼 없음)), `src/study/SeatedStudy.tsx` (`breakNow?` 를 StudyRunner 에, `useTracking` 의 paused 에 `paused || breakNow` — 웹캠 끔, `onDialogChange` 에는 넣지 않음)

- [ ] **Step 1:** StudyRunner 에서 `paused` 를 쓰는 곳을 하나씩 보고 판정·기록 쪽은 `halted` 로, 사용자 중지 UI 는 `paused` 그대로. lint·build
- [ ] **Step 2: 커밋** — `feat: 강의실 쉬는 시간에는 타이머·기록만 멈춤 (캐릭터는 자유)`

### Task 3: 강의동에 연결 — 칠판·알림·규칙

**Files:** Create `src/study/useClassPhase.ts` (1초마다 `classPhase(Date.now())`, `enabled` 아니면 null), `src/study/ClassBellNotice.tsx` (쉬는 시간 시작 "🔔 쉬는 시간이에요", 수업 시작 "🔔 수업 시작"), Modify `src/space/rulesLogic.ts` (`BranchRules.timetable?: boolean`), `src/space/branches/cambit-lecture.json` (`rules: { timetable: true, label: '강의동은 다 같이 매시 50분 공부·10분 쉬어요' }`), `src/space/Decor.tsx` (`Decor` 에 `boardText?` — 있으면 칠판 글씨를 그것으로), `src/space/BranchScene.tsx` (규칙 timetable 이면 useClassPhase → 칠판 글씨·`breakNow` 를 SeatedStudy 에·단계가 바뀌면 알림)
- Test: `<scratchpad>/tests/timetable.test.mjs` 에 `cambit-lecture.json` 의 `rules.timetable === true`, 다른 캠퍼스 건물엔 없음

- [ ] **Step 1: 실패하는 검사(규칙) → 구현 → 통과 + lint·build**
- [ ] **Step 2: 커밋** — `feat: 강의동 칠판 시간표와 쉬는 시간 알림`

### Task 4: 화면 확인 안내
- [ ] 강의동에서 공부 시작(수업 중/쉬는 시간 각각), 쉬는 시간에 타이머가 멈추고 일어나 걸을 수 있는지, 정각에 자동으로 이어지는지, 직접 중지는 그대로인지. 기다리기 어려우면 개발 중에만 `CLASS_MINUTES` 를 임시로 바꿔 보는 방법 안내(커밋 금지).
