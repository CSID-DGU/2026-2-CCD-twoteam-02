# 자동 보정과 판정 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공부 시작 때 3단계 보정(정면·필기 자세·눈 감기)으로 개인 기준을 재고, 숙여서도 EAR로 눈 감음을 판정하며, 얼굴을 놓쳐도 몸이 있으면 자리 이탈이 아니라 엎드림(60초 → 졸음)으로 판정한다.

**Architecture:** 계산은 순수 함수 파일 셋(`eyeMetrics.ts` EAR, `calibration.ts` 보정 요약, `focusLogic.ts` 판정)에 두고 Node로 검사한다. `useTracking`은 EAR과 손목 보임을 더 내보내고, `useFocusState`가 몸·기준·마지막 입력 시각을 판정에 넘긴다. 보정 화면(`CalibrationDialog`)은 `SeatedStudy`(공부 시작 직후)와 `/tracking`에 붙인다.

**Tech Stack:** TypeScript, React 19, `@mediapipe/tasks-vision` 1.0.1, Web Audio(삐 소리), Node 타입 제거 기능(순수 함수 검사)

**Spec:** `docs/superpowers/specs/2026-10-15-calibration-design.md`

## Global Constraints

- 정책 기준(그대로 씀): 졸음 `DROWSY_SECONDS = 21`(정면·숙임 같음), 자리 이탈·엎드림 `AWAY_SECONDS = 60`.
- 보정: 정면 3초, 필기 자세 3초, 필기 자세로 눈 감기 2초(끝나면 삐). 품질 확인 값 `MIN_FACE_RATIO = 0.8`, `MAX_PITCH_RANGE_DEGREES = 15`, `MAX_CLOSED_RATIO = 0.8`.
- 감음 기준 = 그 자세의 뜬 EAR과 감은 EAR의 중간, 다시 뜸 = 감음 기준에서 뜬 EAR 쪽으로 1/4.
- 보정하지 않았으면 눈 감음 판정 없음. eyeBlink 판정(`EYE_CLOSED_SCORE`, `EYE_OPEN_SCORE`, `HEAD_DOWN_DEGREES`)은 지운다.
- 기준값은 메모리에만. 서버로 보내지 않는다. 영상·이미지 저장 없음. 새 의존성 없음. 주석·문구는 한국어.
- 순수 함수 파일(`eyeMetrics.ts`, `calibration.ts`, `focusLogic.ts`)은 다른 파일을 값으로 import하지 않는다(`import type`만 허용 — Node가 지움).
- 커밋 전 `npm run lint`, `npm run build`. 커밋 메시지 `종류: 한국어 설명`.

## Review Focus

0. 보정 화면은 부모가 자주 다시 그려져도(`/tracking`은 0.1초마다) 측정이 처음부터 다시 시작되면 안 된다 → `onDone`을 ref로 받는다. (Task 5 브라우저 확인: `/tracking`에서 보정이 끝까지 진행)
1. 숙여 필기하며 얼굴이 띄엄띄엄 끊길 때 내 화면에 노란 "얼굴을 찾는 중"이 깜빡이면 #119와 같은 체감이다 → 몸이 있으면 보류 표시를 하지 않는다. (Task 3 시험: 얼굴 없음+몸 있음 30초에 `holdReason`이 `null`)
2. Pose가 준비 전·오류일 때(`framed = null`) 몸을 "없음"이 아니라 "모름"으로 넘겨야 한다 → 지금처럼 자리 이탈 판정. (Task 3 시험: `bodyFound` 생략 → 60초에 `away`)
3. 다시 맞추기 중에 타이머가 0으로 돌아가면 안 된다 → 다시 맞추기는 `StudyRunner`를 내리지 않고 위에 창만 띄운다. (Task 5 브라우저 확인 항목)
4. 보정 ③에서 눈을 덜 감으면(실눈) 감음 기준이 뜬 눈과 너무 가까워져 오판이 늘어난다 → 감은 EAR이 숙인 EAR의 80% 미만이어야 통과. (Task 2 시험: 0.14 vs 0.15 → 실패)
5. 타이핑하면서 얼굴만 안 보이는 경우(카메라 각도)에는 엎드림으로 판정하면 안 된다 → 입력이 있으면 엎드림 시간을 다시 센다. (Task 3 시험: 30초에 입력 → 60초에 아직 초록, 90초에 졸음)

---

### Task 1: EAR 계산과 손목 보임 (`eyeMetrics.ts`, `useTracking`)

**Files:**
- Create: `src/tracking/eyeMetrics.ts`
- Modify: `src/tracking/useTracking.ts`
- Test: `.superpowers/sdd/2026-10-15-calibration/t1.mjs`

**Interfaces:**
- Produces: `earOf(points: { x: number; y: number }[] | undefined, width: number, height: number): number | null`, `FaceState.ear: number | null`, `PoseState.wristsInView: boolean`

- [ ] **Step 1: 실패하는 시험 작성** (`R`은 저장소 절대 경로)

```js
import assert from "node:assert/strict";
import { earOf } from "R/src/tracking/eyeMetrics.ts";
// 눈 점 6개를 픽셀로 놓고 정규화 좌표로 바꿔 넣는다: 가로 10, 세로 4 → EAR = (4+4)/(2*10) = 0.4
const W = 640, H = 480;
const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
const put = (ids, ox) => {
  const px = [[0, 0], [3, -2], [7, -2], [10, 0], [7, 2], [3, 2]]; // 바깥, 위1, 위2, 안쪽, 아래2, 아래1
  ids.forEach((id, k) => (pts[id] = { x: (ox + px[k][0]) / W, y: (100 + px[k][1]) / H }));
};
put([33, 160, 158, 133, 153, 144], 100);
put([362, 385, 387, 263, 373, 380], 300);
assert.ok(Math.abs(earOf(pts, W, H) - 0.4) < 1e-9);
assert.equal(earOf(undefined, W, H), null);
assert.equal(earOf(pts.slice(0, 300), W, H), null);
console.log("eyeMetrics OK");
```

- [ ] **Step 2: 실패 확인** — Run: `node .superpowers/sdd/2026-10-15-calibration/t1.mjs` / Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: `src/tracking/eyeMetrics.ts` 작성**

```ts
// 눈 크기(EAR: 눈 세로 ÷ 가로)를 Face 랜드마크로 계산합니다. 작을수록 감긴 눈입니다.
// 정규화 좌표(0~1)는 가로세로 비율이 달라 왜곡되므로 픽셀 좌표로 바꿔 계산합니다. (프로토타입과 같은 방식)
// 화면·MediaPipe와 무관한 순수 함수입니다. (Node로 검사 — 다른 파일을 import하지 않음)

// 눈 점 6개: 바깥 끝, 위 2, 안쪽 끝, 아래 2 (prototype/face_tracking.py와 같은 번호)
export const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
export const LEFT_EYE = [362, 385, 387, 263, 373, 380];

type Point = { x: number; y: number };

// 양쪽 눈 EAR 평균. 랜드마크가 모자라면 null
export function earOf(points: Point[] | undefined, width: number, height: number): number | null {
  if (!points || points.length < 400) return null;
  const dist = (a: number, b: number) =>
    Math.hypot((points[a].x - points[b].x) * width, (points[a].y - points[b].y) * height);
  const one = (e: number[]) => (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * dist(e[0], e[3]) || 1e-6);
  return (one(RIGHT_EYE) + one(LEFT_EYE)) / 2;
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: `eyeMetrics OK`

- [ ] **Step 5: `useTracking`에 연결**

import 추가: `import { earOf } from "./eyeMetrics";`

`FaceState`에 `ear: number | null; // 눈 크기(EAR). 보정·눈 감음 판정용` 추가, 초기값 `ear: null`.
`PoseState`에 `wristsInView: boolean; // 손목이 화면 아래쪽 안에 보이는지 (책상이 보이는 구도인지)` 추가, 초기값 `wristsInView: false`.

`readFace`에서 얼굴을 못 찾은 경우 `faceState.ear = null;` 를 `faceState.found = false;` 옆에 추가하고, 찾은 경우 blink 계산 아래에:

```ts
      faceState.ear = earOf(result.faceLandmarks?.[0], video.videoWidth || 640, video.videoHeight || 480);
```

`readPose`에서 `poseState.framed = isFramed(image);` 위에:

```ts
      // 손목(15·16)이 화면 아래쪽 안에 있으면 책상이 보이는 구도 (보정 때 기록만 함)
      poseState.wristsInView =
        !!image && [image[15], image[16]].some((p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0.5 && p.y <= 1);
```

- [ ] **Step 6: lint·build** — Run: `npm run lint && npm run build` / Expected: 통과

- [ ] **Step 7: 커밋**

```bash
git add src/tracking/eyeMetrics.ts src/tracking/useTracking.ts
git commit -m "feat: 트래킹에 눈 크기(EAR)와 손목 보임 추가"
```

---

### Task 2: 보정 요약 (`calibration.ts`)

**Files:**
- Create: `src/focus/calibration.ts`
- Test: `.superpowers/sdd/2026-10-15-calibration/t2.mjs`

**Interfaces:**
- Produces:
  - `CALIB_STEPS: readonly { key: CalibStepKey; seconds: number; text: string }[]`, `type CalibStepKey = "front" | "down" | "closed"`
  - `type CalibSample = { found: boolean; ear: number | null; pitch: number | null; framed: boolean | null; wristsInView: boolean }` (pitch는 라디안)
  - `type StepOk = { ok: true; ear: number; pitch: number; handsVisible: boolean }`, `type StepResult = StepOk | { ok: false; reason: string }`
  - `summarizeStep(step: CalibStepKey, samples: CalibSample[]): StepResult`
  - `type Baseline = { frontEar: number; downEar: number; closedEar: number; frontPitch: number; downPitch: number; handsVisible: boolean }`
  - `makeBaseline(front: StepOk, down: StepOk, closed: StepOk): { ok: true; baseline: Baseline } | { ok: false; reason: string }`

- [ ] **Step 1: 실패하는 시험 작성**

```js
import assert from "node:assert/strict";
import { summarizeStep, makeBaseline } from "R/src/focus/calibration.ts";
const rad = (d) => (d * Math.PI) / 180;
const s = (o = {}) => ({ found: true, ear: 0.27, pitch: rad(-5), framed: true, wristsInView: false, ...o });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// 정면 정상 → 중앙값
const front = summarizeStep("front", many(30, (i) => s({ ear: 0.26 + (i % 3) * 0.01 })));
assert.equal(front.ok, true);
assert.ok(Math.abs(front.ear - 0.27) < 1e-9);
// 얼굴이 절반만 보임 → 실패
assert.equal(summarizeStep("front", many(30, (i) => s({ found: i % 2 === 0 }))).ok, false);
// 고개가 30° 흔들림 → 실패
assert.equal(summarizeStep("down", many(30, (i) => s({ pitch: rad(i) }))).ok, false);
// 정면인데 머리~가슴이 화면 밖 → 실패 (framed null은 무시)
assert.equal(summarizeStep("front", many(30, () => s({ framed: false }))).ok, false);
assert.equal(summarizeStep("front", many(30, () => s({ framed: null }))).ok, true);
// 필기 자세에서 손목이 보이면 기록
const down = summarizeStep("down", many(30, () => s({ ear: 0.15, pitch: rad(20), wristsInView: true })));
assert.equal(down.ok && down.handsVisible, true);
// 감은 눈이 충분히 작으면 기준 완성, 실눈(0.14 vs 0.15)이면 실패 (Review Focus 4)
const closed = summarizeStep("closed", many(20, () => s({ ear: 0.08, pitch: rad(18) })));
const ok = makeBaseline(front, down, closed);
assert.equal(ok.ok, true);
assert.equal(ok.baseline.closedEar, 0.08);
assert.equal(ok.baseline.handsVisible, true);
const squint = summarizeStep("closed", many(20, () => s({ ear: 0.14, pitch: rad(18) })));
assert.equal(makeBaseline(front, down, squint).ok, false);
console.log("calibration OK");
```

- [ ] **Step 2: 실패 확인** — Run: `node .superpowers/sdd/2026-10-15-calibration/t2.mjs` / Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: `src/focus/calibration.ts` 작성**

```ts
// 자동 보정: 공부 시작 때 정면·필기 자세·눈 감기를 잠깐씩 재서 그 사람의 기준(눈 크기·고개 각도)을 만듭니다.
// 몸·자리마다 다른 값이라 팀이 고정값을 정하지 않고 사람마다 잽니다. (docs/판정-기준-근거.md "세 층"의 2층)
// 화면·React와 무관한 순수 함수입니다. (Node로 검사 — 다른 파일을 import하지 않음)

export type CalibStepKey = "front" | "down" | "closed";

export const CALIB_STEPS: readonly { key: CalibStepKey; seconds: number; text: string }[] = [
  { key: "front", seconds: 3, text: "평소처럼 화면을 봐 주세요" },
  { key: "down", seconds: 3, text: "종이에 쓰는 자세로 숙여 주세요" },
  { key: "closed", seconds: 2, text: "그 자세로 눈을 감아 주세요 (끝나면 소리가 나요)" },
];

// 측정이 제대로 됐는지 거르는 값 (판정 기준이 아님. 보정 실패가 잦으면 각본 시험 뒤 조정)
export const MIN_FACE_RATIO = 0.8; // 얼굴이 기록의 이 비율 이상에서 보여야 함
export const MAX_PITCH_RANGE_DEGREES = 15; // 그동안 고개 각도가 이만큼 넘게 흔들리면 다시
export const MAX_CLOSED_RATIO = 0.8; // 감은 눈이 숙인 눈의 이 비율보다 작아야 진짜 감은 것

export type CalibSample = {
  found: boolean;
  ear: number | null;
  pitch: number | null; // 라디안, 숙이면 +
  framed: boolean | null; // 머리~가슴이 화면 안인지 (null = 확인 못 함 → 무시)
  wristsInView: boolean;
};

export type StepOk = { ok: true; ear: number; pitch: number; handsVisible: boolean };
export type StepResult = StepOk | { ok: false; reason: string };

export type Baseline = {
  frontEar: number;
  downEar: number;
  closedEar: number;
  frontPitch: number; // 라디안
  downPitch: number;
  handsVisible: boolean; // 필기 자세에서 손목이 보였는지 (책상이 보이는 구도)
};

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

export function summarizeStep(step: CalibStepKey, samples: CalibSample[]): StepResult {
  const seen = samples.filter((s) => s.found && s.ear !== null && s.pitch !== null);
  if (samples.length === 0 || seen.length / samples.length < MIN_FACE_RATIO)
    return { ok: false, reason: "얼굴이 잘 보이지 않았어요. 카메라를 보고 다시 해 주세요." };
  const pitches = seen.map((s) => s.pitch as number);
  const rangeDeg = ((Math.max(...pitches) - Math.min(...pitches)) * 180) / Math.PI;
  if (rangeDeg > MAX_PITCH_RANGE_DEGREES)
    return { ok: false, reason: "고개가 많이 움직였어요. 자세를 유지한 채 다시 해 주세요." };
  if (step === "front") {
    const checked = samples.filter((s) => s.framed !== null);
    if (checked.length > 0 && checked.filter((s) => s.framed).length / checked.length < MIN_FACE_RATIO)
      return { ok: false, reason: "머리와 어깨가 화면에 보이도록 카메라를 맞춘 뒤 다시 해 주세요." };
  }
  return {
    ok: true,
    ear: median(seen.map((s) => s.ear as number)),
    pitch: median(pitches),
    handsVisible: samples.filter((s) => s.wristsInView).length / samples.length >= 0.5,
  };
}

export function makeBaseline(
  front: StepOk,
  down: StepOk,
  closed: StepOk
): { ok: true; baseline: Baseline } | { ok: false; reason: string } {
  if (closed.ear >= down.ear * MAX_CLOSED_RATIO)
    return { ok: false, reason: "눈을 완전히 감은 채로 다시 해 주세요." };
  return {
    ok: true,
    baseline: {
      frontEar: front.ear,
      downEar: down.ear,
      closedEar: closed.ear,
      frontPitch: front.pitch,
      downPitch: down.pitch,
      handsVisible: down.handsVisible,
    },
  };
}
```

- [ ] **Step 4: 통과 확인** — Expected: `calibration OK`

- [ ] **Step 5: lint·build 후 커밋**

```bash
git add src/focus/calibration.ts
git commit -m "feat: 보정 3단계 기록을 개인 기준으로 요약하는 순수 로직 추가"
```

---

### Task 3: 판정 개편 (`focusLogic.ts`)

**Files:**
- Modify: `src/focus/focusLogic.ts`
- Test: `.superpowers/sdd/2026-10-15-calibration/t3.mjs`

**Interfaces:**
- Consumes: `type Baseline` (Task 2, `import type`)
- Produces:
  - `FocusInput = { found: boolean; ear?: number | null; pitch?: number; framed?: boolean | null; bodyFound?: boolean | null; baseline?: Baseline | null }` (`blink` 제거)
  - `ScreenInput`에 `lastInputMs?: number | null` 추가
  - `FocusState`에 `bodyWhileMissing: boolean` 추가
  - `eyeClosed(input: FocusInput, wasClosed: boolean): boolean`
  - `holdReason`: 얼굴 없음 + 몸 있음이면 `null`

- [ ] **Step 1: 실패하는 시험 작성**

```js
import assert from "node:assert/strict";
import { nextFocusState, initialFocusState, holdReason, AWAY_SECONDS } from "R/src/focus/focusLogic.ts";
const rad = (d) => (d * Math.PI) / 180;
const baseline = { frontEar: 0.27, downEar: 0.15, closedEar: 0.077, frontPitch: rad(-5), downPitch: rad(20), handsVisible: false };
const scr = (o = {}) => ({ pageHidden: false, windowFocused: true, allowDevices: false, ...o });
// from~to ms를 0.5초 간격으로 진행. input/screen은 함수(시각 → 값)도 됨
const run = (input, to, from = 0, prev = initialFocusState, screen = scr()) => {
  let s = prev;
  for (let t = from; t <= to; t += 500)
    s = nextFocusState(s, typeof input === "function" ? input(t) : input, t, typeof screen === "function" ? screen(t) : screen);
  return s;
};
const face = (ear, deg) => ({ found: true, ear, pitch: rad(deg), baseline, bodyFound: true });
// 숙여서 뜬 눈(필기) 30초 → 초록, 시간 쌓임
let s = run(face(0.148, 22), 30000);
assert.equal(s.status, "focus");
assert.ok(s.studyMs >= 29000);
// 숙여서 감음 21초 → 졸음
assert.equal(run(face(0.08, 15), 20500).status, "focus");
assert.equal(run(face(0.08, 15), 21000).status, "drowsy");
// 정면 감음 21초 → 졸음, 정면 뜬 눈 → 초록
assert.equal(run(face(0.08, -5), 21000).status, "drowsy");
assert.equal(run(face(0.27, -5), 30000).status, "focus");
// 다시 뜸 기준: 감음 기준(0.1135)보다 조금 큰 0.12는 아직 감음으로 봄 (다시 뜸 0.1226)
s = run(face(0.08, 15), 5000);
s = run(face(0.12, 15), 25000, 5500, s);
assert.equal(s.status, "drowsy");
// 보정 없음 → 눈 판정 안 함
assert.equal(run({ found: true, ear: 0.05, pitch: rad(15) }, 30000).status, "focus");
// 얼굴 없음 + 몸 있음: 30초엔 초록·보류 표시 없음(Review Focus 1), 60초에 졸음
const lying = { found: false, bodyFound: true, baseline };
s = run(lying, 30000);
assert.equal(s.status, "focus");
assert.equal(holdReason(s), null);
assert.equal(run(lying, AWAY_SECONDS * 1000).status, "drowsy");
// 30초에 입력 → 60초엔 아직 초록, 90초에 졸음 (Review Focus 5)
const typed = scr({ lastInputMs: 30000 });
assert.equal(run(lying, 60000, 0, initialFocusState, (t) => (t >= 30000 ? typed : scr())).status, "focus");
assert.equal(run(lying, 90000, 0, initialFocusState, (t) => (t >= 30000 ? typed : scr())).status, "drowsy");
// 얼굴·몸 없음 60초 → 이탈, 보류 표시는 "face"
s = run({ found: false, bodyFound: false }, 30000);
assert.equal(holdReason(s), "face");
assert.equal(run({ found: false, bodyFound: false }, 60000).status, "away");
// 몸 모름(생략) → 지금처럼 이탈 (Review Focus 2)
assert.equal(run({ found: false }, 60000).status, "away");
console.log("focusLogic calibration OK");
```

- [ ] **Step 2: 실패 확인** — Expected: 첫 실패 지점에서 AssertionError (예: 숙여 감음 21초가 `focus` — 지금 규칙은 숙이면 눈 판정을 안 함)

- [ ] **Step 3: `focusLogic.ts` 고치기**

맨 위 설명 주석의 졸음 단락을 아래로 바꾼다:

```ts
// 졸음: 공부 시작 때 보정(정면·필기 자세·눈 감기)을 했을 때만, 눈 크기(EAR)가 그 자세의 뜬 눈과 감은 눈의 중간보다
// 작은 채로 DROWSY_SECONDS 넘게 이어지면 졸음입니다. 정면이든 숙였든 같습니다. 보정을 안 했으면 눈은 보지 않습니다.
// 얼굴이 안 보여도 몸(Pose)이 자리에 있으면 자리 이탈이 아니라 엎드림으로 보고, AWAY_SECONDS 넘게 이어지면 졸음입니다.
// 그동안 키보드·마우스 입력이 있으면 깨어 있는 것이므로 처음부터 다시 셉니다.
```

import 추가(맨 위): `import type { Baseline } from "./calibration";`

상수에서 `EYE_CLOSED_SCORE`, `EYE_OPEN_SCORE`, `HEAD_DOWN_DEGREES` 세 줄을 지운다.

타입 교체:

```ts
export type FocusInput = {
  found: boolean; // 얼굴이 잡혔는지
  ear?: number | null; // 눈 크기(EAR). 보정이 있을 때만 눈 감음 판정에 씀
  pitch?: number; // 고개 위아래 각도(라디안, 숙이면 +). 생략하면 정면으로 봅니다.
  framed?: boolean | null; // 머리~가슴이 화면 안인지 (null·생략 = 확인 못 함 → 무시)
  bodyFound?: boolean | null; // 몸(Pose)이 자리에 있는지 (null·생략 = 모름 → 몸 없음과 같이 처리)
  baseline?: Baseline | null; // 보정으로 잰 개인 기준 (없으면 눈 판정 안 함)
};

export type ScreenInput = {
  pageHidden: boolean; // 다른 탭으로 가서 이 페이지가 안 보임 (얼굴 인식도 멈춤)
  windowFocused: boolean; // 이 브라우저 창이 선택돼 있음 (다른 앱을 누르면 false)
  allowDevices: boolean; // "학습기기 사용함"을 골랐는지
  lastInputMs?: number | null; // 마지막 키보드·마우스 입력 시각 (엎드림 판정에서 깨어 있음의 근거)
};
```

`FocusState`에 `bodyWhileMissing: boolean; // 얼굴이 안 보이는 동안 몸은 자리에 있었는지 (엎드림)` 추가, `initialFocusState`에 `bodyWhileMissing: false`.
다른 화면 반환 객체와 얼굴이 보일 때 반환 객체에 `bodyWhileMissing: false`를 추가한다.

`holdReason`의 첫 줄 아래를 바꾼다:

```ts
  // 몸이 자리에 있으면 숙여 필기하며 얼굴이 띄엄띄엄 끊기는 경우가 많아 노란 표시를 하지 않습니다. (#119)
  if (state.awaySeconds > 0) return state.bodyWhileMissing ? null : "face";
```

눈 판정 함수를 `nextFocusState` 위에 추가:

```ts
// 보정 기준으로 눈을 감았는지. 자세(정면/숙임)는 정면 각도와 숙인 각도의 중간으로 가릅니다.
// 감음 기준 = 그 자세의 뜬 눈과 감은 눈의 중간, 다시 뜸 = 거기서 뜬 눈 쪽으로 1/4 (깜빡거림 방지)
export function eyeClosed(input: FocusInput, wasClosed: boolean): boolean {
  const b = input.baseline;
  if (!b || input.ear === null || input.ear === undefined) return false;
  const down = (input.pitch ?? b.frontPitch) > (b.frontPitch + b.downPitch) / 2;
  const open = down ? b.downEar : b.frontEar;
  const closeAt = (open + b.closedEar) / 2;
  const reopenAt = closeAt + (open - closeAt) / 4;
  return input.ear < (wasClosed ? reopenAt : closeAt);
}
```

얼굴이 안 보일 때 블록을 교체:

```ts
  // 얼굴이 안 보이면 안 보인 시간을 잽니다. 몸이 자리에 있으면 엎드림(→ 졸음), 없으면 자리 이탈입니다.
  if (!input.found) {
    const body = input.bodyFound === true;
    let missingSince = prev.missingSince ?? nowMs;
    const lastInput = screen.lastInputMs ?? null;
    if (body && lastInput !== null && lastInput > missingSince) missingSince = Math.min(lastInput, nowMs);
    const awaySeconds = (nowMs - missingSince) / 1000;
    const status: FocusStatus = awaySeconds >= AWAY_SECONDS ? (body ? "drowsy" : "away") : "focus";
    return {
      status,
      awaySeconds,
      closedSeconds: 0,
      outframeSeconds: 0,
      studyMs: prev.studyMs,
      pendingMs: status === "focus" ? prev.pendingMs + step : 0,
      missingSince,
      closedSince: null,
      outframeSince: null,
      lastMs: nowMs,
      bodyWhileMissing: body,
    };
  }
```

얼굴이 보일 때의 눈 계산(`headDown`, `wasClosed`, `closed` 세 줄과 위 주석 두 줄)을 교체:

```ts
  // 눈: 보정 기준으로 감았는지 봅니다. (보정이 없으면 감지 않은 것으로 봄)
  const wasClosed = prev.closedSince !== null;
  const closed = eyeClosed(input, wasClosed);
```

- [ ] **Step 4: 통과 확인** — Run: t3, 그리고 이전 가이드라인 시나리오(`outframe` 10초) / Expected: `focusLogic calibration OK`

- [ ] **Step 5: lint·build** — `FocusBadge`·`StudyRunner`가 지운 상수를 쓰지 않는지(`grep -rn "EYE_CLOSED_SCORE\|EYE_OPEN_SCORE\|HEAD_DOWN_DEGREES" src` 출력 없음). `useFocusState`의 `blink` 구조 분해는 Task 4에서 고치므로, 이 단계에서 build가 그 줄로 실패하면 Task 4 Step 1을 먼저 적용한다.

- [ ] **Step 6: 커밋**

```bash
git add src/focus/focusLogic.ts
git commit -m "feat: 보정 기준 EAR로 숙여서도 눈 감음을 판정하고 엎드림을 졸음으로 판정"
```

---

### Task 4: `useFocusState`에 몸·기준·입력 연결

**Files:**
- Modify: `src/focus/useFocusState.ts`

**Interfaces:**
- Consumes: `FocusInput`, `ScreenInput` (Task 3), `Baseline` (Task 2)
- Produces: `useFocusState(face, initialAllowDevices?, pose?, extras?: FocusExtras)`, `type FocusExtras = { body?: RefObject<{ found: boolean; framed: boolean | null }>; baseline?: Baseline | null }`

- [ ] **Step 1: 훅 교체**

```ts
// 얼굴 인식 결과(ref)와 가이드라인·몸·보정 기준(선택)을 0.1초마다 읽어 집중 상태를 계산하는 훅
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialFocusState, nextFocusState } from "./focusLogic";
import type { FocusInput, FocusState } from "./focusLogic";
import type { Baseline } from "./calibration";

export type FocusView = FocusState & {
  allowDevices: boolean;
  setAllowDevices: (value: boolean) => void;
};

// body: 몸(Pose) 결과 — framed가 null이면 Pose 준비 전·오류라 "모름"으로 넘깁니다.
// baseline: 보정 기준 (없으면 눈 감음 판정 안 함)
export type FocusExtras = {
  body?: RefObject<{ found: boolean; framed: boolean | null }>;
  baseline?: Baseline | null;
};

// initialAllowDevices: 공부 시작 창에서 고른 학습기기 사용 여부. 트래킹 검증 화면은 체크박스로 바꿉니다.
// pose(선택): 카메라 가이드라인 결과. 넘기지 않으면 가이드라인은 보지 않습니다.
export function useFocusState(
  face: RefObject<FocusInput>,
  initialAllowDevices = false,
  pose?: RefObject<{ framed: boolean | null }>,
  extras: FocusExtras = {}
): FocusView {
  const [state, setState] = useState<FocusState>(initialFocusState);
  const [allowDevices, setAllowDevices] = useState(initialAllowDevices);
  const lastInputMs = useRef<number | null>(null);
  const { body, baseline = null } = extras;

  // 키보드·마우스 입력 시각만 기억합니다. (무엇을 눌렀는지는 보지 않음)
  useEffect(() => {
    const mark = () => {
      lastInputMs.current = Date.now();
    };
    const events = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, mark));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const { found, ear, pitch } = face.current;
      const framed = pose?.current.framed ?? null;
      const bodyFound = body ? (body.current.framed === null ? null : body.current.found) : null;
      const screen = {
        pageHidden: document.hidden,
        windowFocused: document.hasFocus(),
        allowDevices,
        lastInputMs: lastInputMs.current,
      };
      setState((prev) =>
        nextFocusState(prev, { found, ear, pitch, framed, bodyFound, baseline }, Date.now(), screen)
      );
    }, 100);
    return () => clearInterval(id);
  }, [face, pose, body, baseline, allowDevices]);

  return { ...state, allowDevices, setAllowDevices };
}
```

- [ ] **Step 2: lint·build** — Expected: 통과 (호출부는 인자를 추가하지 않아도 그대로 동작)

- [ ] **Step 3: 시험 다시** — t3 / Expected: `focusLogic calibration OK`

- [ ] **Step 4: 커밋**

```bash
git add src/focus/useFocusState.ts
git commit -m "feat: 집중 판정에 몸 인식·보정 기준·마지막 입력 시각 전달"
```

---

### Task 5: 보정 화면과 연결

**Files:**
- Create: `src/study/CalibrationDialog.tsx`
- Modify: `src/study/SeatedStudy.tsx`, `src/study/StudyRunner.tsx`, `src/HeadTrackingTest.tsx`

**Interfaces:**
- Consumes: `CALIB_STEPS`, `summarizeStep`, `makeBaseline`, `Baseline`, `CalibSample`, `StepOk` (Task 2), `FaceState`, `PoseState` (Task 1), `FocusExtras` (Task 4)
- Produces: `CalibrationDialog({ face, pose, onDone, onSkip }: { face: RefObject<FaceState>; pose: RefObject<PoseState>; onDone: (b: Baseline) => void; onSkip: () => void })`

- [ ] **Step 1: `src/study/CalibrationDialog.tsx` 작성**

```tsx
// 공부 시작 보정: 정면 3초 → 필기 자세 3초 → 필기 자세로 눈 감기 2초를 재서 개인 기준을 만듭니다.
// 단계마다 3초 준비 시간을 주고, 눈 감기가 끝나면 소리로 알립니다. 측정이 잘못되면 그 단계만 다시 합니다.
// 기준은 메모리에만 두고 서버로 보내지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { CALIB_STEPS, makeBaseline, summarizeStep } from "../focus/calibration";
import type { Baseline, CalibSample, StepOk } from "../focus/calibration";
import type { FaceState, PoseState } from "../tracking/useTracking";

const PREP_SECONDS = 3; // 자세를 잡을 준비 시간
const SAMPLE_MS = 100;

// 짧은 "삐" 소리 (소리를 못 내도 진행)
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // 소리 없이 계속
  }
}

type Props = {
  face: RefObject<FaceState>;
  pose: RefObject<PoseState>;
  onDone: (baseline: Baseline) => void;
  onSkip: () => void;
};

export function CalibrationDialog({ face, pose, onDone, onSkip }: Props) {
  const [index, setIndex] = useState(0); // 지금 단계
  const [phase, setPhase] = useState<"prep" | "record" | "failed">("prep");
  const [left, setLeft] = useState(PREP_SECONDS); // 남은 초
  const [reason, setReason] = useState("");
  const results = useRef<StepOk[]>([]);
  const step = CALIB_STEPS[index];
  // 부모가 다시 그려질 때마다 onDone이 새 함수가 되므로, ref에 담아 측정 반복이 처음부터 다시 시작되지 않게 합니다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (phase === "failed") return;
    const samples: CalibSample[] = [];
    const total = phase === "prep" ? PREP_SECONDS : step.seconds;
    const startedAt = Date.now();
    setLeft(total);
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setLeft(Math.max(0, Math.ceil(total - elapsed)));
      if (phase === "record") {
        const f = face.current;
        const p = pose.current;
        samples.push({ found: f.found, ear: f.ear, pitch: f.found ? f.pitch : null, framed: p.framed, wristsInView: p.wristsInView });
      }
      if (elapsed < total) return;
      clearInterval(id);
      if (phase === "prep") {
        setPhase("record");
        return;
      }
      if (step.key === "closed") beep();
      const result = summarizeStep(step.key, samples);
      if (!result.ok) {
        setReason(result.reason);
        setPhase("failed");
        return;
      }
      results.current[index] = result;
      if (index < CALIB_STEPS.length - 1) {
        setIndex(index + 1);
        setPhase("prep");
        return;
      }
      const [front, down, closed] = results.current;
      const made = makeBaseline(front, down, closed);
      if (made.ok) onDoneRef.current(made.baseline);
      else {
        setReason(made.reason);
        setPhase("failed");
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [index, phase, step, face, pose]);

  return (
    <div style={styles.backdrop}>
      <div style={styles.box}>
        <div style={{ opacity: 0.7 }}>
          자세 맞추기 {index + 1} / {CALIB_STEPS.length}
        </div>
        <div style={styles.title}>{step.text}</div>
        {phase === "prep" && <div>{left}초 뒤 시작해요. 자세를 잡아 주세요.</div>}
        {phase === "record" && <div style={styles.count}>● 재는 중 {left}</div>}
        {phase === "failed" && (
          <>
            <div style={{ color: "#facc15" }}>{reason}</div>
            <button type="button" style={styles.button} onClick={() => setPhase("prep")}>
              다시 하기
            </button>
          </>
        )}
        <button type="button" style={styles.skip} onClick={onSkip}>
          건너뛰기 (눈 감음 판정 없이 공부)
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center",
    background: "rgba(0,0,0,.45)", font: "14px system-ui, sans-serif",
  },
  box: {
    display: "grid", gap: 10, padding: "20px 24px", borderRadius: 12, minWidth: 320, textAlign: "center",
    background: "rgba(32,35,42,.97)", color: "#fff",
  },
  title: { fontSize: 18, fontWeight: 600 },
  count: { fontSize: 22, fontWeight: 700, color: "#4ade80" },
  button: { padding: "6px 12px", borderRadius: 8, border: "none", background: "#22c55e", color: "#0b1a10", fontWeight: 600, cursor: "pointer" },
  skip: { padding: "4px 8px", borderRadius: 6, border: "1px solid #4b5563", background: "transparent", color: "#d1d5db", cursor: "pointer", font: "inherit" },
};
```

- [ ] **Step 2: `SeatedStudy` 연결**

import 추가:

```tsx
import { CalibrationDialog } from './CalibrationDialog'
import type { Baseline } from '../focus/calibration'
```

상태 추가(`choice` 아래):

```tsx
  // 보정: 처음 공부를 시작할 때 한 번 하고, 자리에 있는 동안 기준을 유지합니다. (과목을 바꿔도 다시 재지 않음)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrated, setCalibrated] = useState(false) // 보정을 마쳤거나 건너뛰었는지
  const [baseline, setBaseline] = useState<Baseline | null>(null) // 건너뛰면 null (눈 감음 판정 없음)
```

`onDialogChange(dialogOpen)` 효과를 `onDialogChange(dialogOpen || calibrating)`, 의존성 `[dialogOpen, calibrating, onDialogChange]`로 바꾼다.
`if (!choice) onStatus('idle')` 효과를 `if (!choice || !calibrated) onStatus('idle')`, 의존성 `[choice, calibrated, onStatus]`로 바꾼다.

`{choice && sessionId ? (` 를 `{choice && sessionId && calibrated ? (` 로 바꾸고, `StudyRunner`에 props 추가:

```tsx
          pose={pose}
          baseline={baseline}
          onRecalibrate={() => setCalibrating(true)}
```

`) : choice ? (` 줄은 `) : choice && calibrated ? (` 로 바꾼다(보정 중에는 "자리 정보를 확인하는 중"을 띄우지 않음).

`StartStudyDialog`의 `onStart`를 바꾼다:

```tsx
          onStart={(c) => {
            setChoice(c)
            setDialogOpen(false)
            if (!calibrated) setCalibrating(true)
          }}
```

`StartStudyDialog` 블록 아래에 추가:

```tsx
      {calibrating && (
        <CalibrationDialog
          face={face}
          pose={pose}
          onDone={(b) => {
            setBaseline(b)
            setCalibrated(true)
            setCalibrating(false)
          }}
          onSkip={() => {
            setCalibrated(true)
            setCalibrating(false)
          }}
        />
      )}
```

(다시 맞추기는 `calibrated`가 이미 true라 `StudyRunner`가 내려가지 않고, 창만 위에 뜬다 — Review Focus 3)

- [ ] **Step 3: `StudyRunner` 연결**

import 추가:

```tsx
import type { Baseline } from '../focus/calibration'
import type { PoseState } from '../tracking/useTracking'
```

`Props`에 추가:

```tsx
  pose: RefObject<PoseState> // 몸 인식 (얼굴을 놓쳐도 자리에 있는지)
  baseline: Baseline | null // 보정 기준 (건너뛰면 null)
  onRecalibrate: () => void
```

함수 인자에 `pose, baseline, onRecalibrate` 추가, 판정 줄을 바꾼다:

```tsx
  const focus = useFocusState(face, choice.allowDevices, undefined, { body: pose, baseline })
```

"과목 바꾸기" 버튼 앞에 추가:

```tsx
      <button type="button" style={styles.button} onClick={onRecalibrate}>
        다시 맞추기
      </button>
```

- [ ] **Step 4: `/tracking`(`HeadTrackingTest`) 연결**

import 추가:

```tsx
import { CalibrationDialog } from "./study/CalibrationDialog";
import type { Baseline } from "./focus/calibration";
```

컴포넌트 안(훅 아래):

```tsx
  const [baseline, setBaseline] = useState<Baseline | null>(null); // 보정 기준 (확인용)
  const [calibrating, setCalibrating] = useState(false);
```

판정 줄을 `const focus = useFocusState(face, false, pose, { body: pose, baseline }); // 집중 상태 판정 (src/focus)` 로 바꾼다.
`{status === "ready" && <FocusBadge ... />}` 아래에:

```tsx
        {status === "ready" && (
          <button type="button" onClick={() => setCalibrating(true)}>
            {baseline ? "다시 맞추기" : "보정하기 (눈 감음 판정 켜기)"}
          </button>
        )}
```

`<CameraGuideNotice pose={pose} />` 아래에:

```tsx
      {calibrating && (
        <CalibrationDialog
          face={face}
          pose={pose}
          onDone={(b) => {
            setBaseline(b);
            setCalibrating(false);
          }}
          onSkip={() => setCalibrating(false)}
        />
      )}
```

- [ ] **Step 5: lint·build** — Expected: 통과

- [ ] **Step 6: 사용자 브라우저 확인**

- `/tracking`: 보정하기 → 3단계 진행, 눈 감기 끝에 삐 소리, 실눈이면 "눈을 완전히 감은 채로" 안내 후 다시. 보정 뒤: 숙여 필기 2분 초록 유지, 숙여 눈 감기 21초 졸음, 정면 눈 감기 21초 졸음, 엎드리기 60초 졸음(그동안 노란 "얼굴을 찾는 중" 없음), 자리 떠나기 60초 이탈.
- 지점 좌석: 과목 선택 → 보정 → 타이머 시작. 다시 맞추기 중에도 타이머가 0으로 돌아가지 않음. 과목을 바꿔도 보정이 다시 뜨지 않음. 건너뛰기하면 바로 타이머.

- [ ] **Step 7: 커밋**

```bash
git add src/study/CalibrationDialog.tsx src/study/SeatedStudy.tsx src/study/StudyRunner.tsx src/HeadTrackingTest.tsx
git commit -m "feat: 공부 시작 때 3단계 자세 보정 화면과 다시 맞추기 추가"
```

---

### Task 6: 근거 문서와 설계 문서 반영

**Files:**
- Modify: `docs/판정-기준-근거.md`, `docs/superpowers/specs/2026-10-15-calibration-design.md`

- [ ] **Step 1: 근거 문서**

결정 요약 표에서 "고개 숙임", "눈 감음" 두 행을 아래로 바꾸고 "엎드림" 행을 추가:

```markdown
| 눈 감음 | 공부 시작 때 보정한 그 사람의 뜬 눈·감은 눈 크기(EAR)의 중간보다 작으면 감음. 정면·숙임 모두 | `calibration.ts`, `eyeClosed()` |
| 고개 숙임 | 보정한 정면 각도와 숙인 각도의 중간으로 자세를 가름. 숙여도 눈 감음은 판정함 | `eyeClosed()` |
| 엎드림 | 얼굴이 안 보이는데 몸은 자리에 있는 상태가 **60초** 이어지면 졸음 의심 (입력이 있으면 다시 셈) | `AWAY_SECONDS` |
```

`## 참고 자료` 앞에 절을 추가:

```markdown
## 6. 숙였을 때 눈 감음과 엎드림 — 자동 보정 (2026-10-15)

- 3절의 eyeBlink 판정은 쓰지 않는다. 모델 비교 실험(`docs/모델-비교-실험.md` 2단계)에서 숙여 필기(0.40~0.54)와 숙인 채 눈 감기(0.60~0.63)가 겹쳤다 **[측정]**.
- 대신 EAR(눈 점 6개로 잰 눈 크기)을 쓴다. 숙인 채 눈 감기만 확실히 작았지만, 정면 대비 비율이 구도마다 달랐다(28% / 47%) **[측정]** → 공통 비율을 정하지 않고 **사람마다 뜬 눈과 감은 눈을 직접 잰다**(2층 자동 보정).
- 보정: 정면 3초, 필기 자세 3초, 필기 자세로 눈 감기 2초. 감음 기준 = 그 자세의 뜬 눈과 감은 눈의 중간. 보정을 건너뛰면 눈 감음은 판정하지 않는다(원칙: 애매하면 공부로 인정).
- 21초(졸음)는 숙였을 때도 같게 쓴다. OSLER의 21초는 잠든 것을 보는 기준이고 자세와 무관하다.
- 엎드림 60초는 자리 이탈(1절)과 같은 "얼굴이 안 보이는 시간"이라 같은 값을 쓴다. 숙여 필기할 때는 얼굴이 띄엄띄엄 끊기므로(실험 A 구도 52%) 60초 연속은 엎드림일 가능성이 크다. 키보드·마우스 입력이 있으면 깨어 있는 것으로 보고 다시 센다.
- 몸이 자리에 있는 동안은 얼굴이 끊겨도 내 화면에 노란 보류 표시를 하지 않는다(#119에서 노란불로 보인 문제).
- 한계: 보정 품질 확인 값(얼굴 80%, 흔들림 15°, 감은 눈 80% 미만)은 측정이 제대로 됐는지 거르는 값이다. 정면 감음 기준은 숙인 자세에서 잰 감은 눈을 같이 쓴다는 가정이 있어 각본 시험으로 확인한다.
```

마지막 수정 날짜는 이미 2026-10-15.

- [ ] **Step 2: 설계 문서 5절의 보류 표시 줄 고치기**

`- 졸음 의심 문구는 그대로 쓰되, 엎드림은 내 화면에 "엎드림 확인 중"(보류) → "졸음 의심"으로 보인다.` 를 아래로 바꾼다:

```markdown
- 엎드림은 60초 전까지 내 화면에 노란 보류 표시를 하지 않고(숙여 필기하며 얼굴이 끊기는 경우와 같아 보이므로), 60초가 되면 "졸음 의심"이 된다.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/판정-기준-근거.md docs/superpowers/specs/2026-10-15-calibration-design.md
git commit -m "docs: 숙였을 때 눈 감음·엎드림 판정 근거와 보정 방식 기록"
```
