# 카메라 가이드라인 판정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MediaPipe Pose로 코·양 어깨가 화면 안에 있는지 판정해, 5초 넘게 벗어나면 집중 상태를 `outframe`(가이드라인 이탈)으로 바꾸고 집중 시간을 멈춘다.

**Architecture:** 순수 함수 `isFramed`(poseFrame.ts)가 랜드마크로 화면 안 여부를 정하고, 훅 `usePoseGuide`가 `useFaceTracking`이 연 `<video>`로 0.5초마다 Pose를 돌려 `framed`를 ref에 쓴다. `useFocusState`가 이 값을 `nextFocusState`(focusLogic.ts, 순수 함수)에 넘기고, `FocusBadge`가 결과를 보여 준다.

**Tech Stack:** TypeScript, React 19, Vite, `@mediapipe/tasks-vision` 1.0.1 (PoseLandmarker), Node 26 (타입 제거로 .ts 직접 실행해 시나리오 검사)

**Spec:** `docs/superpowers/specs/2026-10-09-camera-guide-design.md`

## Global Constraints

- 새 라이브러리를 추가하지 않는다. Pose는 설치된 `@mediapipe/tasks-vision` 1.0.1을 쓴다.
- WASM 주소: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm` (useFaceTracking과 같게)
- 모델 주소: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
- 웹캠 영상은 저장·전송하지 않는다. 판정에는 `framed`(참/거짓/null)만 쓴다.
- 기준값은 파일 맨 위 이름 붙인 상수: `OUTFRAME_SECONDS = 5`(focusLogic.ts), `VISIBLE_SCORE = 0.5`, `POSE_INTERVAL_MS = 500`(usePoseGuide/poseFrame)
- 상태 이름 `"outframe"` (현의 `src/space/status.ts`는 수정하지 않는다 — focus가 아니면 노랑)
- `framed`를 넘기지 않거나 `null`이면 지금과 똑같이 동작해야 한다(기존 사용처 호환).
- 주석·화면 문구는 한국어, 짧고 이유 중심.
- 테스트 도구는 추가하지 않는다. 순수 로직은 Node로 시나리오 검사, 전체는 `npm run build`·`npm run lint`.
- 커밋은 사용자가 요청할 때만 한다(각 Task 끝의 커밋 단계는 요청을 받은 경우에만 실행).
- `src/HeadTrackingTest.tsx`는 김현의 파일이다. 불러오고 넘기는 줄만 추가한다.

## Review Focus

- Pose 모델이 늦게 뜨거나 실패함 → `framed = null`이고 공부 시간이 멈추지 않아야 한다 (Task 2 시나리오 F, Task 1 isFramed(undefined)는 false지만 훅이 null을 유지)
- 점수·좌표가 경계값(visibility 정확히 0.5, x·y 정확히 0 또는 1) → 화면 안으로 본다 (Task 1 시나리오)
- 한쪽 어깨만 보이거나 사람이 없음 → 화면 밖 (Task 1 시나리오)
- 얼굴이 안 보이는데 framed도 false → 가이드라인 이탈이 아니라 기존 자리 이탈 판정 (Task 2 시나리오 D)
- 범위 이탈을 재는 도중 다른 화면으로 갔다 돌아옴 → 이탈 시간은 0부터 다시 (Task 2 시나리오 G)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/tracking/poseFrame.ts` (새) | 순수 함수 `isFramed(landmarks)`와 기준 상수. React·MediaPipe 실행 코드 없음 → Node로 검사 가능 |
| `src/tracking/usePoseGuide.ts` (새) | Pose 모델 로드, 0.5초마다 실행, `framed`를 ref에 기록 |
| `src/focus/focusLogic.ts` (수정) | `outframe` 판정과 보류 처리 |
| `src/focus/useFocusState.ts` (수정) | pose ref(선택)를 읽어 판정에 전달 |
| `src/focus/FocusBadge.tsx` (수정) | `outframe` 문구, 벗어난 시간, 가이드라인 확인 불가 표시 |
| `src/HeadTrackingTest.tsx` (2~3줄) | `usePoseGuide` 연결 |

설계 문서 대비 변경: `isFramed`를 Node로 검사하려고 `usePoseGuide.ts`에서 `poseFrame.ts`로 분리했다(usePoseGuide.ts는 MediaPipe 실행 코드를 불러와 Node에서 import하기 어렵다).

---

### Task 1: 화면 안 판정 함수 `isFramed`

**Files:**
- Create: `src/tracking/poseFrame.ts`
- Test: Node 시나리오 (저장소에 파일로 남기지 않음)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export const VISIBLE_SCORE = 0.5`
  - `export const GUIDE_POINTS = [0, 11, 12] as const`
  - `export type PosePoint = { x: number; y: number; visibility?: number }`
  - `export function isFramed(landmarks: PosePoint[] | undefined): boolean`

- [ ] **Step 1: 실패하는 시나리오 작성·실행**

Run:
```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { isFramed } from "./src/tracking/poseFrame.ts";
const p = (x, y, visibility = 0.9) => ({ x, y, visibility });
const body = (nose, l, r) => { const a = Array.from({ length: 33 }, () => p(0.5, 0.5, 0)); a[0] = nose; a[11] = l; a[12] = r; return a; };
assert.equal(isFramed(body(p(0.5,0.3), p(0.35,0.7), p(0.65,0.7))), true, "정상 자세");
assert.equal(isFramed(undefined), false, "사람 없음");
assert.equal(isFramed(body(p(0.5,0.3), p(0.35,0.7), p(0.65,0.7,0.2))), false, "오른쪽 어깨 안 보임");
assert.equal(isFramed(body(p(0.5,0.3), p(-0.05,0.7), p(0.65,0.7))), false, "왼쪽 어깨 화면 밖");
assert.equal(isFramed(body(p(0.5,0.3), p(0.35,1.2), p(0.65,1.2))), false, "어깨가 화면 아래로 잘림");
assert.equal(isFramed(body(p(0,0,0.5), p(1,1,0.5), p(0.5,1,0.5))), true, "경계값(0, 1, 점수 0.5)은 안쪽");
console.log("Task 1 OK");
'
```
Expected: FAIL — `Cannot find module .../src/tracking/poseFrame.ts`

- [ ] **Step 2: 구현**

`src/tracking/poseFrame.ts`:
```ts
// 카메라 가이드라인 판정 기준: 코와 양 어깨가 모두 화면 안에 보이면 "머리~가슴이 들어왔다"고 봅니다.
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사)

// 기준값은 아직 임시입니다. 팀에서 확정되면 여기만 고치면 됩니다.
export const VISIBLE_SCORE = 0.5; // 이 점수 이상이어야 그 점이 보인다고 봅니다.
export const GUIDE_POINTS = [0, 11, 12] as const; // Pose 랜드마크 번호: 코, 왼쪽 어깨, 오른쪽 어깨

// Pose 랜드마크 한 점 (x, y는 화면 기준 0~1)
export type PosePoint = { x: number; y: number; visibility?: number };

const inside = (v: number) => v >= 0 && v <= 1;

export function isFramed(landmarks: PosePoint[] | undefined): boolean {
  if (!landmarks) return false; // 사람을 찾지 못함
  return GUIDE_POINTS.every((i) => {
    const point = landmarks[i];
    return (
      point !== undefined &&
      (point.visibility ?? 0) >= VISIBLE_SCORE &&
      inside(point.x) &&
      inside(point.y)
    );
  });
}
```

- [ ] **Step 3: 시나리오 다시 실행**

Run: Step 1과 같은 명령
Expected: `Task 1 OK`

- [ ] **Step 4: 빌드·린트**

Run: `npm run build && npm run lint`
Expected: 오류 없음 (청크 500kB 경고는 기존과 같음)

- [ ] **Step 5: 커밋 (사용자가 요청한 경우에만)**

```bash
git add src/tracking/poseFrame.ts
git commit -m "feat: 카메라 가이드라인 화면 안 판정 함수 추가"
```

---

### Task 2: `outframe` 판정과 배지 문구

**Files:**
- Modify: `src/focus/focusLogic.ts` (상수·타입·초기값·`nextFocusState` 세 갈래 모두)
- Modify: `src/focus/FocusBadge.tsx` (LABEL, detail)
- Test: Node 시나리오

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces:
  - `export const OUTFRAME_SECONDS = 5`
  - `export type FocusStatus = "focus" | "away" | "drowsy" | "offscreen" | "outframe"`
  - `FocusInput` = `{ found: boolean; blink: number; framed?: boolean | null }`
  - `FocusState`에 `outframeSeconds: number`, `outframeSince: number | null` 추가

- [ ] **Step 1: 실패하는 시나리오 작성·실행**

Run:
```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { nextFocusState as next, initialFocusState as init, OUTFRAME_SECONDS } from "./src/focus/focusLogic.ts";
assert.equal(OUTFRAME_SECONDS, 5);
const run = (inputs, screen) => inputs.reduce((s, [t, i]) => next(s, i, t, screen), init);
const ok = { found: true, blink: 0, framed: true };
const out = { found: true, blink: 0, framed: false };
// 0.1초 간격 입력 만들기: [시작ms, 끝ms) 동안 같은 입력
const span = (a, b, i) => Array.from({ length: (b - a) / 100 }, (_, k) => [a + k * 100, i]);

// A: 4.9초 벗어남 → 집중, 5초 → outframe
let s = run([...span(0, 1000, ok), ...span(1000, 5900, out), [5900, out]]);
assert.equal(s.status, "focus", "A 4.9초는 집중");
s = next(s, out, 6000);
assert.equal(s.status, "outframe", "A 5초는 가이드라인 이탈");

// B: 3초 벗어났다 돌아오면 보류 시간이 더해짐 (0~6초 전부 인정)
s = run([...span(0, 1000, ok), ...span(1000, 4000, out), ...span(4000, 6100, ok)]);
assert.equal(s.status, "focus");
assert.equal(s.studyMs, 6000, "B 보류 3초까지 확정");

// C: outframe이 되면 보류를 버리고, 돌아온 뒤부터 다시 쌓임
s = run([...span(0, 1000, ok), ...span(1000, 8000, out), ...span(8000, 10100, ok)]);
assert.equal(s.studyMs, 1000 + 2000, "C 이탈 구간은 버림");

// D: 얼굴이 없으면 framed=false여도 기존 자리 이탈 판정
s = run(span(0, 10100, { found: false, blink: 0, framed: false }));
assert.equal(s.status, "focus", "D 10초 얼굴 없음은 아직 집중(보류)");
assert.equal(s.outframeSeconds, 0, "D 가이드라인 시간은 재지 않음");

// E: 졸음과 범위 이탈이 겹치면 졸음
s = run(span(0, 121000, { found: true, blink: 0.9, framed: false }));
assert.equal(s.status, "drowsy", "E 졸음 우선");

// F: framed가 null이거나 없으면 기존과 같음
s = run(span(0, 10100, { found: true, blink: 0, framed: null }));
assert.equal(s.status, "focus"); assert.equal(s.studyMs, 10000, "F null은 무시");
s = run(span(0, 10100, { found: true, blink: 0 }));
assert.equal(s.status, "focus"); assert.equal(s.studyMs, 10000, "F 생략은 무시");

// G: 이탈을 재다가 다른 화면에 갔다 오면 0부터 다시
s = run(span(0, 4000, out));
s = next(s, out, 4000, { pageHidden: false, windowFocused: false, allowDevices: false });
assert.equal(s.outframeSeconds, 0, "G 다른 화면에서 초기화");
s = next(s, out, 4100); s = next(s, out, 8000);
assert.equal(s.status, "focus", "G 돌아온 뒤 3.9초는 아직 집중");

// H: 학습기기 사용함이어도 가이드라인은 적용
const dev = { pageHidden: false, windowFocused: true, allowDevices: true };
s = run(span(0, 6100, out), dev);
assert.equal(s.status, "outframe", "H 학습기기 모드에도 적용");
console.log("Task 2 OK");
'
```
Expected: FAIL — `OUTFRAME_SECONDS`가 undefined라 첫 assert 실패

- [ ] **Step 2: focusLogic.ts 수정**

맨 위 주석 블록의 "다른 화면" 설명 아래에 한 단락 추가:
```ts
// 카메라 가이드라인: 얼굴이 보일 때만, 머리~가슴(코·양 어깨)이 화면 밖으로 나간 시간을 잽니다.
// 기준 시간 안에 돌아오면 그동안은 보류했다가 인정하고, 넘기면 "가이드라인 이탈"이 되어 시간이 멈춥니다.
// 학습기기 사용 여부와 상관없이 적용합니다. (Pose 결과가 없으면 무시)
```

`DROWSY_SECONDS` 줄 아래에 상수 추가:
```ts
export const OUTFRAME_SECONDS = 5; // 머리~가슴이 이 시간 이상 화면 밖이면 가이드라인 이탈
```

타입 변경:
```ts
export type FocusStatus = "focus" | "away" | "drowsy" | "offscreen" | "outframe";

export type FocusInput = {
  found: boolean; // 얼굴이 잡혔는지
  blink: number; // eyeBlinkLeft/Right 평균 (0=뜸, 1=감음)
  framed?: boolean | null; // 머리~가슴이 화면 안인지 (null·생략 = 확인 못 함 → 무시)
};
```

`FocusState`에 필드 추가(`closedSeconds` 아래, `closedSince` 아래):
```ts
  outframeSeconds: number; // 머리~가슴이 연속으로 화면 밖에 있던 시간
```
```ts
  outframeSince: number | null;
```

`initialFocusState`에 `outframeSeconds: 0,`(closedSeconds 아래), `outframeSince: null,`(closedSince 아래) 추가.

다른 화면 갈래와 얼굴 없음 갈래의 return에 각각 추가:
```ts
      outframeSeconds: 0,
```
```ts
      outframeSince: null,
```

얼굴 있음 갈래를 다음으로 바꾼다 (`// 얼굴이 보이면 눈 감김을 봅니다.`부터 함수 끝까지):
```ts
  // 얼굴이 보이면 눈 감김을 봅니다. 이미 감은 상태면 더 크게 떠야 뜬 것으로 칩니다.
  const wasClosed = prev.closedSince !== null;
  const closed = wasClosed
    ? input.blink > EYE_OPEN_SCORE
    : input.blink > EYE_CLOSED_SCORE;
  const closedSince = closed ? prev.closedSince ?? nowMs : null;
  const closedSeconds = closedSince === null ? 0 : (nowMs - closedSince) / 1000;

  // 머리~가슴이 화면 밖이면 시간을 잽니다. 한 번이라도 들어오거나 확인할 수 없으면(null) 0부터 다시.
  const out = input.framed === false;
  const outframeSince = out ? prev.outframeSince ?? nowMs : null;
  const outframeSeconds = outframeSince === null ? 0 : (nowMs - outframeSince) / 1000;

  // 졸음과 가이드라인 이탈이 겹치면 졸음을 보여 줍니다. (졸음은 아이콘이 따로 있음)
  const status: FocusStatus =
    closedSeconds >= DROWSY_SECONDS
      ? "drowsy"
      : outframeSeconds >= OUTFRAME_SECONDS
        ? "outframe"
        : "focus";

  // 눈을 뜨고 화면 안이면 보류 시간까지 확정하고, 감았거나 벗어났으면 보류에 쌓습니다.
  let studyMs = prev.studyMs;
  let pendingMs = prev.pendingMs;
  if (status !== "focus") {
    pendingMs = 0;
  } else if (closed || out) {
    pendingMs += step;
  } else {
    studyMs += pendingMs + step;
    pendingMs = 0;
  }
  return {
    status,
    awaySeconds: 0,
    closedSeconds,
    outframeSeconds,
    studyMs,
    pendingMs,
    missingSince: null,
    closedSince,
    outframeSince,
    lastMs: nowMs,
  };
}
```

- [ ] **Step 3: FocusBadge.tsx 수정**

import에 `OUTFRAME_SECONDS` 추가:
```ts
import { AWAY_SECONDS, DROWSY_SECONDS, OUTFRAME_SECONDS } from "./focusLogic";
```
`LABEL`에 한 줄 추가:
```ts
  outframe: { color: "#facc15", text: "🟡 가이드라인 이탈 의심" },
```
`detail`을 다음으로 바꾼다:
```ts
  const detail =
    state.awaySeconds > 0
      ? `얼굴 안 보임 ${Math.floor(state.awaySeconds)}초 / ${AWAY_SECONDS}초`
      : state.closedSeconds > 0
        ? `눈 감음 ${Math.floor(state.closedSeconds)}초 / ${DROWSY_SECONDS}초`
        : state.outframeSeconds > 0
          ? `머리~가슴 화면 밖 ${Math.floor(state.outframeSeconds)}초 / ${OUTFRAME_SECONDS}초`
          : "";
```

- [ ] **Step 4: 시나리오 다시 실행 + 기존 동작 확인**

Run: Step 1과 같은 명령 → Expected: `Task 2 OK`

Run (기존 판정 회귀 확인):
```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { nextFocusState as next, initialFocusState as init } from "./src/focus/focusLogic.ts";
let s = init;
for (let t = 0; t <= 30000; t += 100) s = next(s, { found: false, blink: 0 }, t);
assert.equal(s.status, "away", "30초 얼굴 없음 → 이탈");
s = init;
for (let t = 0; t <= 120000; t += 100) s = next(s, { found: true, blink: 0.9 }, t);
assert.equal(s.status, "drowsy", "2분 눈 감음 → 졸음");
s = next(init, { found: true, blink: 0 }, 0, { pageHidden: true, windowFocused: false, allowDevices: false });
assert.equal(s.status, "offscreen", "다른 탭 → 다른 화면");
console.log("기존 판정 OK");
'
```
Expected: `기존 판정 OK`

- [ ] **Step 5: 빌드·린트**

Run: `npm run build && npm run lint`
Expected: 오류 없음. (LABEL에 outframe이 빠지면 여기서 타입 오류가 난다)

- [ ] **Step 6: 커밋 (사용자가 요청한 경우에만)**

```bash
git add src/focus/focusLogic.ts src/focus/FocusBadge.tsx
git commit -m "feat: 가이드라인 이탈(outframe) 판정과 배지 문구 추가"
```

---

### Task 3: Pose 훅 연결 (`usePoseGuide`)

**Files:**
- Create: `src/tracking/usePoseGuide.ts`
- Modify: `src/focus/useFocusState.ts`
- Modify: `src/focus/FocusBadge.tsx` (guide prop)
- Modify: `src/HeadTrackingTest.tsx` (불러오는 줄만)

**Interfaces:**
- Consumes: Task 1 `isFramed`, Task 2 `FocusInput.framed`
- Produces:
  - `export type PoseGuideState = { framed: boolean | null }`
  - `export type PoseGuideStatus = "loading" | "ready" | "error"`
  - `export function usePoseGuide(videoRef: RefObject<HTMLVideoElement | null>): { pose: RefObject<PoseGuideState>; status: PoseGuideStatus }`
  - `useFocusState(face: RefObject<FocusInput>, pose?: RefObject<{ framed: boolean | null }>)`
  - `FocusBadge` props: `{ state: FocusView; guide?: "loading" | "ready" | "error" }`

- [ ] **Step 1: usePoseGuide.ts 작성**

```ts
// 카메라 가이드라인: 머리~가슴(코·양 어깨)이 화면 안에 있는지 MediaPipe Pose로 확인합니다.
// 웹캠은 useFaceTracking이 연 <video>를 같이 쓰고, 영상은 이 브라우저 밖으로 나가지 않습니다.
// 자세는 자주 바뀌지 않으므로 0.5초마다만 확인해 연산 부담을 줄입니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { isFramed } from "./poseFrame";

// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const POSE_INTERVAL_MS = 500; // Pose 확인 간격 (제안서: 초당 1~2회)

export type PoseGuideState = {
  framed: boolean | null; // null = 아직 확인 못 함(모델 로딩 중·오류) → 판정에서 무시
};

export type PoseGuideStatus = "loading" | "ready" | "error";

export function usePoseGuide(videoRef: RefObject<HTMLVideoElement | null>) {
  const pose = useRef<PoseGuideState>({ framed: null });
  const [status, setStatus] = useState<PoseGuideStatus>("loading");

  useEffect(() => {
    const state = pose.current;
    let cancelled = false;
    let timer = 0;
    let landmarker: PoseLandmarker | undefined;

    async function start() {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const created = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      if (cancelled) {
        created.close();
        return;
      }
      landmarker = created;
      setStatus("ready");

      timer = window.setInterval(() => {
        const video = videoRef.current;
        if (!landmarker || !video || video.readyState < 2) return; // 영상 준비 전엔 건너뜀
        const result = landmarker.detectForVideo(video, performance.now());
        state.framed = isFramed(result.landmarks[0]);
      }, POSE_INTERVAL_MS);
    }

    start().catch(() => {
      if (cancelled) return;
      state.framed = null; // 모델 문제로 공부 시간이 멈추지 않게 판정에서 빼기
      setStatus("error");
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      landmarker?.close();
      state.framed = null;
    };
  }, [videoRef]);

  return { pose, status };
}
```

- [ ] **Step 2: useFocusState.ts 수정**

함수 선언과 interval 안을 다음으로 바꾼다:
```ts
// pose(선택): 카메라 가이드라인 결과. 넘기지 않으면 가이드라인은 보지 않습니다.
export function useFocusState(
  face: RefObject<FocusInput>,
  pose?: RefObject<{ framed: boolean | null }>
): FocusView {
```
```ts
    const id = setInterval(() => {
      const { found, blink } = face.current;
      const framed = pose?.current.framed ?? null;
      const screen = {
        pageHidden: document.hidden,
        windowFocused: document.hasFocus(),
        allowDevices,
      };
      setState((prev) => nextFocusState(prev, { found, blink, framed }, Date.now(), screen));
    }, 100);
    return () => clearInterval(id);
  }, [face, pose, allowDevices]);
```
맨 위 주석을 `// 얼굴 인식 결과(ref)와 가이드라인 결과(선택)를 0.1초마다 읽어 집중 상태를 계산하는 훅`으로 바꾼다.

- [ ] **Step 3: FocusBadge.tsx에 guide 표시**

함수 선언을 바꾸고, 집중 시간 줄 아래에 한 줄 추가:
```tsx
export default function FocusBadge({
  state,
  guide,
}: {
  state: FocusView;
  guide?: "loading" | "ready" | "error"; // 가이드라인(Pose) 상태. 안 넘기면 표시 안 함
}) {
```
```tsx
      <div>집중 시간 {formatTime(state.studyMs)}</div>
      {guide === "loading" && <div style={{ opacity: 0.7 }}>가이드라인 모델 불러오는 중…</div>}
      {guide === "error" && <div style={{ opacity: 0.7 }}>가이드라인 확인 불가 (다른 판정은 계속)</div>}
```

- [ ] **Step 4: HeadTrackingTest.tsx 연결 (김현 파일 — 이 줄들만)**

import 추가 (`useFaceTracking` import 아래):
```ts
import { usePoseGuide } from "./tracking/usePoseGuide";
```
`useFocusState` 줄을 다음 두 줄로:
```ts
  const { pose, status: poseStatus } = usePoseGuide(videoRef); // 카메라 가이드라인 (src/tracking)
  const focus = useFocusState(face, pose); // 집중 상태 판정 (src/focus)
```
배지 줄:
```tsx
        {status === "ready" && <FocusBadge state={focus} guide={poseStatus} />}
```

- [ ] **Step 5: Task 1·2 시나리오 재실행 + 빌드·린트**

Run: Task 1 Step 1 명령 → `Task 1 OK`, Task 2 Step 1 명령 → `Task 2 OK`
Run: `npm run build && npm run lint` → 오류 없음

- [ ] **Step 6: 브라우저 확인 (사용자)**

준비: `.env.local`(육심호에게 Supabase 값 받기) → `npm run dev` → 회원가입·로그인 → `http://localhost:5173/tracking`
확인:
1. 처음에 "가이드라인 모델 불러오는 중…"이 잠깐 보였다가 사라짐
2. 정면에 바르게 앉으면 🟢 집중, 집중 시간 증가
3. 의자를 옆으로 밀어 한쪽 어깨를 화면 밖으로 → `머리~가슴 화면 밖 n초 / 5초`가 보이고, 5초 뒤 🟡 가이드라인 이탈 의심, 집중 시간 멈춤
4. 3초만 벗어났다 돌아오면 집중 시간에 그 3초가 한꺼번에 더해짐
5. 카메라를 가려 얼굴이 안 보이게 하면 가이드라인이 아니라 `얼굴 안 보임` 문구
6. 개발자 도구 콘솔에 오류 없음, 오른쪽 위 FPS·캐릭터 움직임이 전과 비슷함

- [ ] **Step 7: 커밋 (사용자가 요청한 경우에만)**

```bash
git add src/tracking/usePoseGuide.ts src/focus/useFocusState.ts src/focus/FocusBadge.tsx src/HeadTrackingTest.tsx
git commit -m "feat: Pose로 카메라 가이드라인 확인하고 집중 판정에 연결"
```

---

## 끝난 뒤

- `CLAUDE.local.md` 2·5절(구조·구현 기능), `PRIVATE_CONTEXT.md`(진행) 갱신
- 김현에게 알림: 상태 이름 `outframe` 추가(표시등은 노랑으로 자동 처리), HeadTrackingTest에 3줄 추가
- PR은 사용자가 요청할 때 `feat/wonjun/camera-guide` → `develop`
