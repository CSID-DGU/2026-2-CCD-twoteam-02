# 각본 시험 측정 행동 추가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연구 근거가 없는 정책 기준(자리 이탈 60초, 엎드림 60초, 휴대폰 3초, 끊김 내성 2초, 졸음 아래 여유)을 팀원 측정으로 정할 수 있게, 각본 시험에 "채점하지 않고 수치만 모으는 측정 행동"과 집계를 더한다.

**Architecture:** 행동 표(`BEHAVIORS`)에 `expect: "measure"` 행동 4개(14~17)를 추가하고, 모든 회차에서 0.1초 표본(얼굴·눈 감음·휴대폰·고개 각도)으로 `Measure`(최장 연속 길이, 끊김 구간, 고개 변동 폭)를 계산해 `TrialResult.measure`에 저장한다. 정확도·시간 오차 요약에서는 측정 행동을 뺀다. 정식판 반복은 행동마다 다르게(`repeats`) 둔다. 패널은 휴대폰 상태를 받아 기록한다.

**Tech Stack:** TypeScript, React 19 (패널), Node 타입 제거 실행으로 순수 로직 시나리오 검사(스크래치패드 복사본, 확장자 붙여 실행).

**Spec:** `docs/판정-기준-근거.md` 10절 "각본 실험으로 정할 값" (2026-10-22) + 사용자 결정(사람 수 팀원 3명 + 팀 외 2명, 다른 화면은 측정 없음). 각본 시험 설계: `docs/superpowers/specs/2026-10-15-script-test-design.md` (이 계획에서 갱신).

## Global Constraints

- 새 의존성 없음. 영상·이미지는 기록하지 않고 숫자만 남긴다. 서버로 보내지 않는다.
- 기준값 상수는 `focusLogic.ts`의 것을 가져다 쓴다(`RETURN_SECONDS`, `EYE_GAP_SECONDS`, `PHONE_SECONDS`). 각본 시험이 자체 기준값을 두지 않는다.
- 주석은 한국어, 이유 중심. 기존 함수·변수 이름 유지. 측정 행동은 정확도·필기 오판율·시간 오차에 넣지 않는다.
- `src/HeadTrackingTest.tsx`(김현 파일)는 패널에 `phone`을 넘기는 한 줄만 바꾼다.
- 브라우저 저장(`scriptTest:v1`)의 기존 결과(`measure` 없음)도 읽힌다: `measure`는 `Measure | null`.

## Review Focus

- 보정 전·`ear` 없음·얼굴 없음 표본: `closed`는 `null`(모름)이고 최장 감음 계산이 `null` 구간에서 끊긴다. 테스트: Task 1 시나리오 "closed null이면 longestClosedMs null".
- 휴대폰 감지 꺼짐(`phone.found === null`) 회차: `longestPhoneMs`가 `null`이고 표에 "-"로 나온다. 테스트: Task 1 "phone 전부 null".
- 표본이 0개(스페이스바 직후 끝난 경우)나 1개: `measureOf`가 0/null을 돌려주고 예외가 없다. 테스트: Task 1 "빈 표본".
- 고개 변동 폭은 얼굴이 보인 표본만 쓴다. 엎드려 얼굴이 없으면 `null`. 테스트: Task 1 "found false만 → pitchRangeDeg null".
- 저장된 옛 결과(`measure` 필드 없음)로 결과표를 그릴 때 깨지지 않는다. 테스트: Task 2 "measure undefined 결과로 measureRows".

---

### Task 1: 순수 로직 — 측정 행동·반복 횟수·집계 (`scriptTest.ts`)

**Files:**
- Modify: `src/focus/scriptTest.ts`
- Test: 스크래치패드 `measure-scenarios.mjs` (지난 방식: `scriptTest.ts`·`focusLogic.ts`·`calibration.ts`를 확장자 붙인 복사본으로 실행)

**Interfaces (Produces):**
```ts
export type Behavior = { ...기존; expect: FocusStatus | "measure"; repeats?: number /* 정식판 반복, 기본 1 */ };
export const BEHAVIORS: Behavior[]; // 14 일상 동작 90초 repeats 2 / 15 눈 감고 쉬기 60초 repeats 2 / 16 휴대폰 없이 평소 책상 180초 repeats 1 / 17 휴대폰 확인 1회 30초 repeats 3
// 기존 행동 repeats: 2·3·4·8·11 = 3, 나머지 1 (2026-10-21 제안: 반복 대신 사람 수, 오판 위험 행동만 3회)
export type TrialSample = { elapsedMs; plain; guide; found?: boolean; closed?: boolean | null; phone?: boolean | null; pitch?: number };
export type Measure = {
  longestMissingMs: number;          // 얼굴 안 보임 최장 연속
  longestClosedMs: number | null;    // 눈 감음 최장 연속 (closed 기록이 하나도 없으면 null)
  longestPhoneMs: number | null;     // 휴대폰 잡힘 최장 연속 (감지 안 했으면 null)
  shortFoundMaxMs: number; shortFoundCount: number;        // 안 보임 사이에 잠깐(≤ RETURN_SECONDS) 보인 구간 — 끊김
  shortOpenMaxMs: number | null; shortOpenCount: number | null; // 감음 사이에 잠깐(≤ EYE_GAP_SECONDS) 뜬 구간
  pitchRangeDeg: number | null;      // 10초 창 안 고개 각도(최대−최소)의 최대, 도. 얼굴 보인 표본만
};
export function measureOf(samples: TrialSample[]): Measure;
export type TrialResult = { trial; behaviorId; plain; guide; measure: Measure | null };
export function scoreTrial(trial, behavior, samples): TrialResult; // measure = measureOf(samples) (모든 행동)
export function makePlan(mode, random?): number[]; // full = 행동마다 repeats만큼 섞기
export const MEASURE_WINDOW_SECONDS = 10;
export const MEASURE_IDS: number[] = [3, 7, 8, 11, 12, 14, 15, 16, 17]; // 측정표에 보여 줄 행동
export type MeasureRow = { behavior: Behavior; n: number; longestMissingMs: number /* 최대 */; longestClosedMs: number | null; longestPhoneMs: number | null; shortFoundMaxMs: number; shortFoundCount: number /* 합 */; shortOpenMaxMs: number | null; shortOpenCount: number | null; pitchRangeDeg: number | null /* 평균 */ };
export function measureRows(results: TrialResult[]): MeasureRow[];
```
`summarize`·`byBehavior`는 `expect === "measure"` 행동을 뺀다. `scoreVariant`는 measure 행동이면 `correct: true`(쓰지 않음). `logCsv` 헤더에 `closed,phone` 열을 `pitch` 뒤에 추가(`LogRow`에 `closed: boolean | null; phone: boolean | null`). `resultsCsv`에 측정 열 8개(`안 보임 최장ms,감음 최장ms,휴대폰 최장ms,끊김(보임)최장ms,끊김(보임)횟수,끊김(뜸)최장ms,끊김(뜸)횟수,고개 변동 폭°`) 추가.

- [x] **Step 1: 실패하는 시나리오 작성** — `measure-scenarios.mjs`:
  - BEHAVIORS 17개, 14~17 `expect === "measure"`, 14·15 repeats 2, 16 repeats 1, 17 repeats 3, 2·3·4·8·11 repeats 3.
  - `makePlan("quick")` = 1..17 순서. `makePlan("full")` 길이 31, 행동별 개수 = repeats.
  - `measureOf`: 0.1초 표본 90개 — 0~2s found, 2~27s missing(그중 10.0~11.0s found), 27~90s found → longestMissingMs 16000(11~27), shortFoundCount 1, shortFoundMaxMs 1000. closed: 30~38s true, 33.0~33.5 false → longestClosedMs 8000(틈 포함하지 않음: 3000·4500 중 최대 4500), shortOpenCount 1, shortOpenMaxMs 500. phone: 50~52s true → longestPhoneMs 2000. pitch: found 표본에서 ±15°(라디안) 번갈아 → pitchRangeDeg ≈ 30 (±0.01).
  - `measureOf([])` → longestMissingMs 0, closed/phone/pitch null, 예외 없음. closed 전부 null → longestClosedMs null. phone 전부 null → null. found 전부 false → pitchRangeDeg null.
  - `summarize(results,"plain")`에 measure 회차 포함 시 trials에 안 셈. `byBehavior`에 measure 행 없음. `measureRows`에 14 행이 있고 n·최대·합이 맞음; `measure: undefined` 결과가 섞여도 예외 없음.
  - `logCsv` 헤더에 `pitch,closed,phone,framed`. `resultsCsv` 헤더 끝에 `고개 변동 폭°`.
- [x] **Step 2: 실행해 실패 확인** — `sh run-measure-scenarios.sh` → FAIL (measureOf 없음).
- [x] **Step 3: 구현** — 위 인터페이스대로. 연속 구간은 `runsOf(samples, pick: (s) => boolean | null)`(private)로 구해 `[{ value, ms }]`를 만들고, null은 구간을 끊는다. "잠깐 보임"은 value true이고 앞뒤 구간이 모두 false이며 `ms <= RETURN_SECONDS*1000`. 고개 변동 폭은 두 포인터로 10초 창을 밀며 최대−최소를 구한다(도 변환 `* 180 / Math.PI`).
- [x] **Step 4: 실행해 통과 확인** — 모두 PASS.
- [ ] **Step 5: 커밋** — `feat: 각본 시험에 측정 행동 4개와 최장 연속·끊김·고개 변동 집계 추가` (사용자 요청 시)

### Task 2: 패널 — 휴대폰·눈 감음 기록과 측정표 (`ScriptTestPanel.tsx`, `HeadTrackingTest.tsx`)

**Files:**
- Modify: `src/focus/ScriptTestPanel.tsx`
- Modify: `src/HeadTrackingTest.tsx:104` (`phone={phone}` 추가)

**Interfaces (Consumes):** Task 1의 `measureRows`, `MEASURE_IDS`, `TrialSample` 확장 필드. `eyeClosed(input, wasClosed)` (`focusLogic.ts`), `PhoneState` (`useTracking.ts`).

- [x] **Step 1: Props에 `phone: RefObject<PhoneState>` 추가**, `HeadTrackingTest.tsx`에서 넘김.
- [x] **Step 2: 표본에 측정값 넣기** — 워커 신호마다 `closed`는 `baseline`이 있고 `face.current.found && ear !== null`일 때 `eyeClosed(face.current, prevClosed.current)`(히스테리시스용 ref), 아니면 `null`. `phone`은 `phone.current.found`. `LogRow`와 `run.samples`에 `found, closed, phone, pitch`를 넣는다.
- [x] **Step 3: 결과표** — 기존 표 아래에 `MeasureTable`: 열 `# / 행동 / 회차 / 안 보임 최장 / 감음 최장 / 휴대폰 최장 / 끊김(보임) / 끊김(뜸) / 고개 변동 폭`. 초 표시는 기존 `sec()`, 횟수는 `최장 (n회)`, null은 "-". 기준값 안내 한 줄: "자리 이탈 60초 · 졸음 21초 · 휴대폰 3초 · 끊김 내성 2초 — 측정값이 기준에 가까우면 10절 검토".
- [x] **Step 4: 시작 버튼 문구** — 정식판 버튼의 회차·분을 `makePlan("full")`로 계산(`quickIds.length * 5` 제거). "다음 행동" 안내에서 measure 행동은 "측정만 (정답 없음)"으로 표시.
- [x] **Step 5: `npm run lint && npm run build` 통과 확인.**
- [ ] **Step 6: 브라우저 확인(사용자)** ← 대기 — `/tracking` 보정 → 빠른 점검판 → 14~17 진행 → 측정표에 값이 뜨고 결과 CSV에 측정 열이 있는지. 휴대폰을 들면 17번 "휴대폰 최장"이 0이 아닌지.
- [ ] **Step 7: 커밋** — `feat: 각본 시험 패널이 눈 감음·휴대폰을 기록하고 측정표를 보여 줌` (사용자 요청 시)

### Task 3: 문서

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-script-test-design.md` — 2절(정식판 반복: 행동별 `repeats`, 사람 수 팀원 3 + 팀 외 2, 1인 약 30분), 3절(측정 행동 표 14~17 추가, "정답 = 없음(측정)"), 5절(CSV 열 `closed`·`phone`), 6절(측정 집계와 측정표, 정확도에서 제외), 8절(시나리오 검사 항목), 9절(측정값은 기준을 만드는 값이라 팀 외 인원이 필요).
- Modify: `docs/판정-기준-근거.md` 10절 — 사람 수(팀원 3명 + 팀 외 2명), 행동 번호 14~17, "제안"을 "결정(2026-10-22)"으로.

- [x] **Step 1: 두 문서 수정.**
- [ ] **Step 2: 커밋** — `docs: 각본 시험 설계와 판정 근거 10절에 측정 행동·사람 수 반영` (사용자 요청 시)
