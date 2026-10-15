# 카메라 가이드라인 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트래킹(얼굴·Pose)을 한 곳으로 합치고, 좌표 기준(#80)·배경 비교로 "카메라 문제"만 골라 10초 뒤 저절로 사라지는 팝업을 띄운다.

**Architecture:** `useTracking` 하나가 웹캠·얼굴·Pose·배경 밝기를 같은 반복에서 읽어 ref(`face`, `pose`)에 담는다. 판단은 순수 함수 파일(`poseFrame.ts`: 화면 안 기준·팝업 규칙, `background.ts`: 배경 비교)에 두고 Node로 검사한다. 팝업은 `CameraGuideNotice`가 1초마다 규칙을 돌려 띄우며 `SeatedStudy`·`/tracking`에 붙인다. 실제 공부 타이머(`StudyRunner`)는 바꾸지 않는다.

**Tech Stack:** TypeScript, React 19, `@mediapipe/tasks-vision` 1.0.1, Canvas 2D(배경 밝기), Node 타입 제거 기능(순수 함수 검사)

**Spec:** `docs/superpowers/specs/2026-10-15-camera-guide-redesign-design.md`

## Global Constraints

- 웹캠 영상은 저장·전송하지 않는다. 배경은 칸별 평균 밝기 숫자로만 메모리에 두고, 화면을 나가면 버린다.
- 새 의존성 없음. 주석·화면 문구는 한국어.
- 기준값은 파일 위쪽 이름 붙인 상수. 측정 전 임시값: `EDGE_MARGIN = 0.02`, `SHOULDER_MAX_Y = 1`, `BG_COLS = 8`, `BG_ROWS = 6`, `BG_SAME_SCORE = 0.8`, `BG_FLAT_SPREAD = 8`.
- 확정값: `GUIDE_ALERT_SECONDS = 10`, `INPUT_RECENT_SECONDS = 10`, `OUTFRAME_SECONDS = 10`, Pose 초당 15회(`POSE_HZ`), 배경 확인 1초마다(`BG_INTERVAL_MS = 1000`).
- 실제 공부 화면 타이머(`StudyRunner`의 `useFocusState(face, choice.allowDevices)`)는 그대로 둔다.
- 순수 함수 파일(`poseFrame.ts`, `background.ts`)은 다른 파일을 import하지 않는다(Node가 확장자 없는 import를 못 읽음).
- 커밋 전 `npm run lint`, `npm run build` 통과. 커밋 메시지 `종류: 한국어 설명`. 커밋은 사용자가 요청할 때만(이 계획 실행 승인 = 계획 안 커밋 승인으로 보지 않고, 태스크 끝마다 사용자에게 확인).

## Review Focus

1. 사람이 자리를 떠난 뒤 → 기준 배경에서 사람이 있던 칸이 크게 바뀐다. 그 칸을 빼지 않으면 "배경 바뀜"으로 오판해 팝업이 뜬다. (Task 3 테스트: 기준의 사람 칸만 바뀐 경우 `same === true`)
2. 방 전체 밝기 변화(카메라 자동 노출, 불 켜기) → 배경 같음이어야 한다. (Task 3 테스트: 밝기 1.5배+20)
3. Pose 모델 로딩 중·실패 → `framed = null` → 팝업 없음, 얼굴 트래킹은 계속. (Task 4 테스트: `framed: null`이면 문제 없음 / Task 1 확인 항목)
4. 다른 탭에 가 있는 동안 → 반복이 멈춰 마지막 Pose 값이 남는다. 돌아왔을 때 팝업이 바로 뜨면 안 된다. (Task 7: 숨김 중엔 상태 초기화)
5. 앉자마자 카메라가 처음부터 엉뚱한 쪽 → 기준 배경이 없음 → 입력 보조 신호로 잡혀야 한다. (Task 4 테스트: `bgSame: null` + 5초 전 입력 → `noPersonActive`)

---

### Task 1: 트래킹 합치기 (`useTracking`)

동작을 바꾸지 않는 정리. 세 훅을 하나로 합치고 쓰는 곳의 import만 바꾼다.

**Files:**
- Create: `src/tracking/useTracking.ts`
- Delete: `src/tracking/useFaceTracking.ts`, `src/tracking/usePoseTracking.ts`, `src/tracking/usePoseGuide.ts`
- Modify: `src/HeadTrackingTest.tsx`, `src/study/SeatedStudy.tsx`, `src/space/SelfView.tsx`, `src/tracking/TrackedCharacter.tsx`, `src/tracking/PoseReadout.tsx`

**Interfaces:**
- Produces:
  - `useTracking(videoRef: RefObject<HTMLVideoElement | null>): { face: RefObject<FaceState>; pose: RefObject<PoseState>; status: TrackingStatus; message: string; poseStatus: TrackingStatus }`
  - `type FaceState = { found: boolean; yaw: number; pitch: number; roll: number; blink: number }`
  - `type PoseState = { found: boolean; left: ArmJoints | null; right: ArmJoints | null; framed: boolean | null; guidePoints: (PosePoint | undefined)[] | null }` (Task 5에서 `bgSame`, `bgScore`, `bgSpread` 추가)
  - `type TrackingStatus = "loading" | "ready" | "error"`

- [ ] **Step 1: `src/tracking/useTracking.ts` 작성**

```ts
// 웹캠 트래킹을 한 곳에서 합니다: 얼굴(고개·눈)과 몸(Pose: 팔·카메라 가이드라인).
// 웹캠은 한 번만 켜고, 반복 하나에서 얼굴은 새 프레임마다, Pose는 초당 POSE_HZ번 인식합니다.
// 결과는 매 프레임 바뀌므로 state가 아니라 ref에 담고, 쓰는 곳(캐릭터·집중 판정·가이드라인)이 필요한 값만 가져갑니다.
// 웹캠 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { POSE_HZ } from "./armLogic";
import type { ArmJoints, Joint } from "./armLogic";
import { GUIDE_POINTS, isFramed } from "./poseFrame";
import type { PosePoint } from "./poseFrame";

// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
// 가벼운(lite) 모델. 얼굴 인식과 같이 돌리므로 정확도보다 속도를 택했습니다.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// MediaPipe Pose 관절 번호 (사용자 기준 왼쪽·오른쪽)
const LEFT = { shoulder: 11, elbow: 13, wrist: 15 };
const RIGHT = { shoulder: 12, elbow: 14, wrist: 16 };

export type FaceState = {
  found: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
};

export type PoseState = {
  found: boolean; // 사람(몸)을 찾았는지
  left: ArmJoints | null; // 사용자 왼팔
  right: ArmJoints | null; // 사용자 오른팔
  framed: boolean | null; // 머리~가슴(코·양 어깨)이 화면 안인지. null = Pose 준비 전·오류 → 판정에서 무시
  guidePoints: (PosePoint | undefined)[] | null; // 확인용: 코·양 어깨 화면 좌표 (GUIDE_POINTS 순서)
};

export type TrackingStatus = "loading" | "ready" | "error";

export function useTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const face = useRef<FaceState>({ found: false, yaw: 0, pitch: 0, roll: 0, blink: 0 });
  const pose = useRef<PoseState>({ found: false, left: null, right: null, framed: null, guidePoints: null });
  const [status, setStatus] = useState<TrackingStatus>("loading");
  const [message, setMessage] = useState("");
  const [poseStatus, setPoseStatus] = useState<TrackingStatus>("loading");

  useEffect(() => {
    const faceState = face.current;
    const poseState = pose.current;
    let cancelled = false;
    let frameId = 0;
    let stream: MediaStream | undefined;
    let faceLandmarker: FaceLandmarker | undefined;
    let poseLandmarker: PoseLandmarker | undefined;
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();

    // 얼굴: 변환 행렬 → 고개 각도, blendshape → 눈 감긴 정도
    function readFace(landmarker: FaceLandmarker, video: HTMLVideoElement, now: number) {
      const result = landmarker.detectForVideo(video, now);
      const transform = result.facialTransformationMatrixes?.[0];
      if (!transform) {
        faceState.found = false;
        return;
      }
      matrix.fromArray(transform.data);
      euler.setFromRotationMatrix(matrix, "YXZ");
      faceState.found = true;
      faceState.yaw = euler.y;
      faceState.pitch = euler.x;
      faceState.roll = euler.z;
      const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
      const left = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
      const right = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
      faceState.blink = (left + right) / 2;
    }

    // Pose: 팔 관절(3D 위치) + 가이드라인(코·양 어깨 화면 좌표)
    function readPose(landmarker: PoseLandmarker, video: HTMLVideoElement, now: number) {
      const result = landmarker.detectForVideo(video, now);
      const world = result.worldLandmarks?.[0]; // 3D 위치(미터)
      const image = result.landmarks?.[0]; // 화면 위치(0~1)
      if (world && image) {
        const joint = (i: number): Joint => toJoint(world[i], image[i]);
        const arm = (idx: typeof LEFT): ArmJoints => ({
          shoulder: joint(idx.shoulder),
          elbow: joint(idx.elbow),
          wrist: joint(idx.wrist),
        });
        poseState.found = true;
        poseState.left = arm(LEFT);
        poseState.right = arm(RIGHT);
      } else {
        poseState.found = false;
        poseState.left = null;
        poseState.right = null;
      }
      poseState.framed = isFramed(image);
      poseState.guidePoints = image ? GUIDE_POINTS.map((i) => image[i]) : null;
    }

    async function start() {
      const video = videoRef.current;
      if (!video) return;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (cancelled) return;
      video.srcObject = stream;
      await video.play();

      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) return;
      setStatus("ready");

      // Pose는 따로 준비합니다. 실패해도 얼굴 트래킹은 그대로 동작해야 하므로 기다리지 않고 알리기만 합니다.
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      })
        .then((created) => {
          if (cancelled) {
            created.close();
            return;
          }
          poseLandmarker = created;
          setPoseStatus("ready");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.warn("Pose(팔·가이드라인)를 시작하지 못했습니다:", error);
          setPoseStatus("error");
        });

      let lastVideoTime = -1;
      let lastPose = 0;
      const loop = () => {
        if (cancelled || !faceLandmarker) return;
        if (video.readyState >= 2) {
          const now = performance.now();
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            readFace(faceLandmarker, video, now);
          }
          // Pose는 초당 POSE_HZ번만 인식합니다.
          if (poseLandmarker && now - lastPose >= 1000 / POSE_HZ) {
            lastPose = now;
            readPose(poseLandmarker, video, now);
          }
        }
        frameId = requestAnimationFrame(loop);
      };
      loop();
    }

    start().catch((error: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
      faceLandmarker?.close();
      poseLandmarker?.close();
      poseState.framed = null; // 꺼진 뒤 남은 값으로 판정하지 않게
      poseState.guidePoints = null;
    };
  }, [videoRef]);

  return { face, pose, status, message, poseStatus };
}

function toJoint(world: Landmark, image: NormalizedLandmark): Joint {
  return { x: world.x, y: world.y, z: world.z, visibility: image.visibility ?? 0 };
}
```

- [ ] **Step 2: 쓰는 곳 고치기**

`src/HeadTrackingTest.tsx` — import 세 줄(`useFaceTracking`, `usePoseGuide`, `usePoseTracking`)과 `FaceState` 타입 import를 아래로 바꾸고, 훅 호출 네 줄을 바꾼다.

```tsx
import { useTracking } from "./tracking/useTracking";
import type { FaceState } from "./tracking/useTracking";
```

```tsx
  const { face, pose, status, message, poseStatus } = useTracking(videoRef); // 얼굴·팔·가이드라인 (src/tracking)
  const focus = useFocusState(face, false, pose); // 집중 상태 판정 (src/focus)
```

JSX에서 `guide={guideStatus}` → `guide={poseStatus}`, `<PoseReadout pose={guide} />` → `<PoseReadout pose={pose} />`.

`src/study/SeatedStudy.tsx`:

```tsx
import { useTracking } from '../tracking/useTracking'
```

```tsx
  const { face, pose, status, message } = useTracking(videoRef) // 얼굴·팔을 같은 웹캠 영상으로 한 번에 추적합니다.
```

`src/space/SelfView.tsx`:

```tsx
import type { FaceState, PoseState, TrackingStatus } from "../tracking/useTracking";
```

`src/tracking/TrackedCharacter.tsx`:

```tsx
import type { FaceState, PoseState } from "./useTracking";
```

`src/tracking/PoseReadout.tsx` — 타입과 읽는 필드만 바꾼다(표시 개편은 Task 6):

```tsx
import type { PoseState } from "./useTracking";
```

```tsx
export default function PoseReadout({ pose }: { pose: RefObject<PoseState> }) {
```

```tsx
      const { framed, guidePoints: points } = pose.current;
```

- [ ] **Step 3: 옛 훅 지우기**

```bash
git rm src/tracking/useFaceTracking.ts src/tracking/usePoseTracking.ts src/tracking/usePoseGuide.ts
```

- [ ] **Step 4: 남은 참조 없는지 확인**

Run: `grep -rn "useFaceTracking\|usePoseTracking\|usePoseGuide\|PoseGuideState" src`
Expected: 출력 없음

- [ ] **Step 5: lint·build**

Run: `npm run lint && npm run build`
Expected: 오류 없이 `✓ built`

- [ ] **Step 6: 사용자 브라우저 확인**

`npm run dev` 후 사용자에게 요청:
- `/tracking`: 고개·눈이 캐릭터에 그대로 반영, 팔이 움직임, 가이드라인 글자(들어옴/벗어남)가 나옴, 상단 집중 상태 정상.
- 지점에 앉기: 내 모습 화면에서 고개·눈·팔 반영, 집중 타이머 정상.

- [ ] **Step 7: 커밋 (사용자 확인 후)**

```bash
git add -A src/tracking src/HeadTrackingTest.tsx src/study/SeatedStudy.tsx src/space/SelfView.tsx
git commit -m "refactor: 얼굴·Pose 트래킹을 useTracking 하나로 합침"
```

---

### Task 2: "화면 안" 기준을 좌표로 (#80)

**Files:**
- Modify: `src/tracking/poseFrame.ts` (전체 교체)

**Interfaces:**
- Produces: `isFramed(landmarks: PosePoint[] | undefined): boolean`, 상수 `EDGE_MARGIN`, `SHOULDER_MAX_Y`, `GUIDE_POINTS`, 타입 `PosePoint` (`VISIBLE_SCORE`는 삭제)

- [ ] **Step 1: 실패하는 시나리오 작성**

Run:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { isFramed } from "./src/tracking/poseFrame.ts";
const mk = (n, l, r) => { const a = []; a[0] = n; a[11] = l; a[12] = r; return a; };
const p = (x, y, visibility = 0.99) => ({ x, y, visibility });
// 2026-10-13 측정 A(정상)
assert.equal(isFramed(mk(p(0.46, 0.62), p(0.69, 0.90), p(0.25, 0.93))), true);
// 측정 B(오른쪽으로 벗어남)
assert.equal(isFramed(mk(p(1.03, 0.6), p(1.13, 0.9), p(0.72, 0.9))), false);
// #80: 한쪽 어깨만 화면 밖인데 visibility는 높음
assert.equal(isFramed(mk(p(0.6, 0.6), p(1.13, 0.9, 0.99), p(0.4, 0.9))), false);
// 가장자리 여백 안쪽에 걸침
assert.equal(isFramed(mk(p(0.5, 0.6), p(0.99, 0.9), p(0.3, 0.9))), false);
// visibility가 낮아도 좌표가 안이면 안
assert.equal(isFramed(mk(p(0.5, 0.6, 0.1), p(0.7, 0.9, 0.1), p(0.3, 0.9, 0.1))), true);
// 사람 없음
assert.equal(isFramed(undefined), false);
console.log("poseFrame isFramed OK");
'
```

Expected: FAIL — `#80` 줄 또는 visibility 낮음 줄에서 AssertionError (지금은 visibility 0.5 미만이면 밖으로 봄)

- [ ] **Step 2: `src/tracking/poseFrame.ts` 교체**

```ts
// 카메라 가이드라인 판정: 코와 양 어깨가 화면 안에 있으면 "머리~가슴이 들어왔다"고 봅니다.
// 화면 안/밖은 좌표로만 판단합니다. Pose는 화면 밖 관절의 위치도 추정하고,
// 그때도 visibility(보이는 정도)를 0.98 이상으로 내서 visibility로는 가를 수 없습니다. (2026-10-13 측정, #80)
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 기준값 (임시 — 측정 후 확정, 근거: docs/판정-기준-근거.md)
export const EDGE_MARGIN = 0.02; // 화면 가장자리에서 이만큼 안쪽까지만 "안"으로 봅니다. (가장자리는 위치 추정이 흔들림)
export const SHOULDER_MAX_Y = 1; // 어깨가 이 높이(0 = 위, 1 = 아래)보다 아래면 밖. 정상 자세도 0.90~0.93이라 여유가 거의 없음
export const GUIDE_POINTS = [0, 11, 12] as const; // Pose 랜드마크 번호: 코, 왼쪽 어깨, 오른쪽 어깨
const NOSE = 0;

// Pose 랜드마크 한 점 (x, y는 화면 기준 0~1)
export type PosePoint = { x: number; y: number; visibility?: number };

const between = (v: number, min: number, max: number) => v >= min && v <= max;

export function isFramed(landmarks: PosePoint[] | undefined): boolean {
  if (!landmarks) return false; // 사람을 찾지 못함
  return GUIDE_POINTS.every((i) => {
    const point = landmarks[i];
    if (!point) return false;
    const maxY = i === NOSE ? 1 : SHOULDER_MAX_Y;
    return between(point.x, EDGE_MARGIN, 1 - EDGE_MARGIN) && between(point.y, EDGE_MARGIN, maxY);
  });
}
```

- [ ] **Step 3: 시나리오 다시 실행**

Run: Step 1과 같은 명령
Expected: `poseFrame isFramed OK`

- [ ] **Step 4: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과 (`VISIBLE_SCORE`를 쓰는 곳이 없어야 함 — `grep -rn VISIBLE_SCORE src` 출력 없음)

- [ ] **Step 5: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/poseFrame.ts
git commit -m "fix: 가이드라인 화면 안 판정을 visibility 대신 좌표로"
```

---

### Task 3: 배경 비교 순수 로직

**Files:**
- Create: `src/tracking/background.ts`

**Interfaces:**
- Produces:
  - 상수 `BG_COLS`, `BG_ROWS`, `BG_SAMPLE_WIDTH`(64), `BG_SAMPLE_HEIGHT`(48), `BG_SAME_SCORE`, `BG_FLAT_SPREAD`, `PERSON_PAD`
  - `cellMeans(rgba: ArrayLike<number>, width: number, height: number, cols?: number, rows?: number): number[]`
  - `personCells(points: ({ x: number; y: number } | undefined)[] | null, cols?: number, rows?: number): boolean[]`
  - `compareBackground(ref: number[] | null, refSkip: boolean[] | null, cur: number[], curSkip: boolean[]): { same: boolean | null; score: number | null; spread: number | null }`

- [ ] **Step 1: 실패하는 시나리오 작성**

Run:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { cellMeans, personCells, compareBackground, BG_COLS, BG_ROWS } from "./src/tracking/background.ts";
const N = BG_COLS * BG_ROWS;
const none = Array(N).fill(false);
// 칸별 밝기: 왼쪽 절반 0, 오른쪽 절반 255 (4x2 그림을 2x1 칸으로)
const px = []; for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) { const v = x < 2 ? 0 : 255; px.push(v, v, v, 255); }
assert.deepEqual(cellMeans(px, 4, 2, 2, 1), [0, 255]);
// 무늬 있는 배경 (칸마다 들쭉날쭉)
const ref = Array.from({ length: N }, (_, i) => 40 + ((i * 37) % 101) * 1.5);
// 방 전체가 밝아짐 → 같음
assert.equal(compareBackground(ref, none, ref.map((v) => v * 1.5 + 20), none).same, true);
// 카메라가 돌아감 (칸이 3칸 밀림) → 바뀜
const shifted = ref.map((_, i) => ref[(i + 3) % N]);
assert.equal(compareBackground(ref, none, shifted, none).same, false);
// 사람이 떠남: 기준에서 사람이 있던 칸만 크게 바뀜 → 같음 (Review Focus 1)
const person = personCells([{ x: 0.5, y: 0.5 }, { x: 0.65, y: 0.85 }, { x: 0.35, y: 0.85 }]);
assert.ok(person.some(Boolean) && !person.every(Boolean));
const left = ref.map((v, i) => (person[i] ? 255 - v : v));
assert.equal(compareBackground(ref, person, left, none).same, true);
// 흰 벽 (무늬 없음) → 믿을 수 없음
const flat = Array.from({ length: N }, (_, i) => 200 + (i % 2));
assert.equal(compareBackground(flat, none, shifted, none).same, null);
// 기준 없음 → 믿을 수 없음
assert.equal(compareBackground(null, null, ref, none).same, null);
// 사람 칸: 코 근처 칸은 사람, 왼쪽 위 구석은 아님
assert.equal(person[0], false);
console.log("background OK");
'
```

Expected: FAIL — `Cannot find module` (파일 없음)

- [ ] **Step 2: `src/tracking/background.ts` 작성**

```ts
// 배경 비교: 카메라가 돌아갔는지(배경이 바뀜), 사람만 자리를 떠났는지(배경 그대로) 가립니다.
// 영상은 작게 줄여 칸(BG_COLS × BG_ROWS)별 평균 밝기 숫자로만 읽고, 그림은 남기지 않습니다.
// 비교는 상관계수(무늬가 닮은 정도)로 해서, 방 전체 밝기가 바뀌는 것(불 켜기, 카메라 자동 노출)은 무시합니다.
// 화면·브라우저와 무관한 순수 함수입니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 기준값 (임시 — 측정 후 확정, 근거: docs/판정-기준-근거.md)
export const BG_COLS = 8; // 가로 칸 수
export const BG_ROWS = 6; // 세로 칸 수
export const BG_SAMPLE_WIDTH = 64; // 영상을 이 크기로 줄여 읽은 뒤 칸별로 평균 냅니다.
export const BG_SAMPLE_HEIGHT = 48;
export const BG_SAME_SCORE = 0.8; // 상관계수가 이 값 이상이면 "배경 같음"
export const BG_FLAT_SPREAD = 8; // 기준 배경의 밝기 표준편차(0~255)가 이보다 작으면 무늬가 없어 비교를 믿지 않음
export const PERSON_PAD = 0.15; // 코·어깨 둘레로 이만큼 더 넓게 사람 칸으로 봅니다. (머리·팔)
const MIN_CELLS = 8; // 비교할 칸이 이보다 적으면 믿지 않음

type Point = { x: number; y: number };

// RGBA 픽셀(width × height) → 칸별 평균 밝기(0~255), 왼쪽 위부터 가로 순서
export function cellMeans(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  cols = BG_COLS,
  rows = BG_ROWS
): number[] {
  const sums = new Array<number>(cols * rows).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y * rows) / height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const light = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const cell = row * cols + Math.floor((x * cols) / width);
      sums[cell] += light;
      counts[cell] += 1;
    }
  }
  return sums.map((sum, i) => sum / (counts[i] || 1));
}

// 사람이 차지한 칸: 코·어깨를 감싸는 상자를 넓히고, 어깨 아래(몸)는 화면 끝까지 사람으로 봅니다.
export function personCells(
  points: (Point | undefined)[] | null,
  cols = BG_COLS,
  rows = BG_ROWS
): boolean[] {
  const mask = new Array<boolean>(cols * rows).fill(false);
  const found = (points ?? []).filter((p): p is Point => p !== undefined);
  if (found.length === 0) return mask;
  const left = Math.min(...found.map((p) => p.x)) - PERSON_PAD;
  const right = Math.max(...found.map((p) => p.x)) + PERSON_PAD;
  const top = Math.min(...found.map((p) => p.y)) - 2 * PERSON_PAD; // 코 위로 머리
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const overlaps = (c + 1) / cols > left && c / cols < right && (r + 1) / rows > top;
      mask[r * cols + c] = overlaps;
    }
  }
  return mask;
}

const pick = (values: number[], skip: boolean[]) => values.filter((_, i) => !skip[i]);

function std(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function correlation(a: number[], b: number[]): number | null {
  const sa = std(a);
  const sb = std(b);
  if (sa === 0 || sb === 0) return null;
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  const cov = a.reduce((sum, v, i) => sum + (v - ma) * (b[i] - mb), 0) / a.length;
  return cov / (sa * sb);
}

// 기준 배경과 지금 배경 비교. 사람이 있던 칸(기준·지금 둘 다)은 뺍니다.
// same: true 같음 / false 바뀜 / null 믿을 수 없음(기준 없음, 무늬 없음, 비교할 칸 부족)
export function compareBackground(
  ref: number[] | null,
  refSkip: boolean[] | null,
  cur: number[],
  curSkip: boolean[]
): { same: boolean | null; score: number | null; spread: number | null } {
  if (!ref || !refSkip) return { same: null, score: null, spread: null };
  const skip = ref.map((_, i) => refSkip[i] || curSkip[i]);
  const a = pick(ref, skip);
  const b = pick(cur, skip);
  if (a.length < MIN_CELLS) return { same: null, score: null, spread: null };
  const spread = std(a);
  const score = correlation(a, b);
  if (spread < BG_FLAT_SPREAD || score === null) return { same: null, score, spread };
  return { same: score >= BG_SAME_SCORE, score, spread };
}
```

- [ ] **Step 3: 시나리오 다시 실행**

Run: Step 1과 같은 명령
Expected: `background OK`

- [ ] **Step 4: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과

- [ ] **Step 5: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/background.ts
git commit -m "feat: 배경 밝기 비교로 카메라가 돌아갔는지 확인하는 순수 로직 추가"
```

---

### Task 4: 팝업 규칙 순수 로직

**Files:**
- Modify: `src/tracking/poseFrame.ts` (아래쪽에 추가)

**Interfaces:**
- Produces:
  - 상수 `GUIDE_ALERT_SECONDS = 10`, `INPUT_RECENT_SECONDS = 10`
  - `type GuideReason = "cropped" | "moved" | "noPersonActive"`
  - `type CameraCheck = { found: boolean; framed: boolean | null; bgSame: boolean | null; lastInputMs: number | null }`
  - `type GuideAlert = { problemSince: number | null; reason: GuideReason | null; show: boolean }`
  - `initialGuideAlert: GuideAlert`
  - `cameraProblem(check: CameraCheck, nowMs: number): GuideReason | null`
  - `nextGuideAlert(prev: GuideAlert, check: CameraCheck, nowMs: number): GuideAlert`

- [ ] **Step 1: 실패하는 시나리오 작성**

Run:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { cameraProblem, nextGuideAlert, initialGuideAlert } from "./src/tracking/poseFrame.ts";
const base = { found: true, framed: true, bgSame: true, lastInputMs: null };
// 정상
assert.equal(cameraProblem(base, 0), null);
// Pose 모름 → 문제 없음 (Review Focus 3)
assert.equal(cameraProblem({ ...base, framed: null, found: false, bgSame: false }, 0), null);
// 사람 있는데 구도 잘림
assert.equal(cameraProblem({ ...base, framed: false }, 0), "cropped");
// 사람 없음 + 배경 바뀜
assert.equal(cameraProblem({ found: false, framed: false, bgSame: false, lastInputMs: null }, 0), "moved");
// 사람 없음 + 배경 같음 → 자리 이탈
assert.equal(cameraProblem({ found: false, framed: false, bgSame: true, lastInputMs: 0 }, 1000), null);
// 사람 없음 + 배경 비교 못 믿음 + 5초 전 입력 → 카메라 문제 (Review Focus 5)
assert.equal(cameraProblem({ found: false, framed: false, bgSame: null, lastInputMs: 0 }, 5000), "noPersonActive");
// 입력이 15초 전 → 자리 이탈로 봄
assert.equal(cameraProblem({ found: false, framed: false, bgSame: null, lastInputMs: 0 }, 15000), null);
// 10초 규칙: 9.9초엔 안 뜨고 10초에 뜸, 돌아오면 바로 내림
const cropped = { ...base, framed: false };
let s = nextGuideAlert(initialGuideAlert, cropped, 0);
s = nextGuideAlert(s, cropped, 9900);
assert.equal(s.show, false);
s = nextGuideAlert(s, cropped, 10000);
assert.equal(s.show, true);
assert.equal(s.reason, "cropped");
s = nextGuideAlert(s, base, 10100);
assert.deepEqual(s, initialGuideAlert);
console.log("guide alert OK");
'
```

Expected: FAIL — `cameraProblem` 등이 export되지 않음 (SyntaxError: does not provide an export)

- [ ] **Step 2: `src/tracking/poseFrame.ts` 아래쪽에 추가**

```ts
// ---- 카메라 문제 팝업 규칙 ----
// 정상일 때는 아무 알림도 없고, "카메라 문제"가 GUIDE_ALERT_SECONDS 넘게 이어질 때만 팝업을 띄웁니다.
// 사람이 자리를 떠난 것(배경 그대로)은 카메라 문제가 아니므로 팝업을 띄우지 않습니다.
export const GUIDE_ALERT_SECONDS = 10; // 카메라 문제가 이 시간 넘게 이어지면 팝업
export const INPUT_RECENT_SECONDS = 10; // 이 시간 안에 키보드·마우스 입력이 있었으면 사람이 자리에 있는 것으로 봄

// cropped: 사람은 보이는데 머리~가슴이 잘림 / moved: 사람이 없고 배경이 바뀜(카메라 돌아감)
// noPersonActive: 사람이 없고 배경 비교를 못 믿지만(흰 벽 등) 최근 입력이 있음 → 사람은 있는데 카메라가 못 봄
export type GuideReason = "cropped" | "moved" | "noPersonActive";

export type CameraCheck = {
  found: boolean; // Pose가 사람을 찾았는지
  framed: boolean | null; // null = Pose 준비 전·오류
  bgSame: boolean | null; // 배경이 기준과 같은지, null = 믿을 수 없음
  lastInputMs: number | null; // 마지막 키보드·마우스 입력 시각 (없으면 null)
};

export type GuideAlert = {
  problemSince: number | null; // 카메라 문제가 시작된 시각
  reason: GuideReason | null;
  show: boolean; // 팝업을 띄울지
};

export const initialGuideAlert: GuideAlert = { problemSince: null, reason: null, show: false };

export function cameraProblem(check: CameraCheck, nowMs: number): GuideReason | null {
  if (check.framed === null || check.framed) return null; // 모르거나 정상
  if (check.found) return "cropped";
  if (check.bgSame === false) return "moved";
  const recentInput =
    check.lastInputMs !== null && nowMs - check.lastInputMs <= INPUT_RECENT_SECONDS * 1000;
  if (check.bgSame === null && recentInput) return "noPersonActive";
  return null; // 배경 그대로 → 자리 이탈 (자리 이탈 판정이 따로 처리)
}

export function nextGuideAlert(prev: GuideAlert, check: CameraCheck, nowMs: number): GuideAlert {
  const reason = cameraProblem(check, nowMs);
  if (!reason) return initialGuideAlert; // 돌아오면 바로 내림
  const problemSince = prev.problemSince ?? nowMs;
  return { problemSince, reason, show: nowMs - problemSince >= GUIDE_ALERT_SECONDS * 1000 };
}
```

- [ ] **Step 3: 시나리오 다시 실행 (Task 2 시나리오도 함께)**

Run: Step 1 명령, Task 2 Step 1 명령
Expected: `guide alert OK`, `poseFrame isFramed OK`

- [ ] **Step 4: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과

- [ ] **Step 5: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/poseFrame.ts
git commit -m "feat: 카메라 문제일 때만 팝업을 띄우는 판정 규칙 추가"
```

---

### Task 5: `useTracking`에 배경 확인 붙이기

**Files:**
- Modify: `src/tracking/useTracking.ts`

**Interfaces:**
- Consumes: `cellMeans`, `personCells`, `compareBackground`, `BG_SAMPLE_WIDTH`, `BG_SAMPLE_HEIGHT` (Task 3)
- Produces: `PoseState`에 `bgSame: boolean | null`, `bgScore: number | null`, `bgSpread: number | null` 추가 (확인용 화면·팝업이 읽음)

- [ ] **Step 1: 맨 위 설명 주석에 한 줄 추가**

```ts
// 배경 확인(카메라가 돌아갔는지)은 1초마다 영상을 작게 줄여 칸별 평균 밝기 숫자로만 읽고, 그림은 남기지 않습니다.
```

- [ ] **Step 2: import·상수·타입 추가**

```ts
import { BG_SAMPLE_HEIGHT, BG_SAMPLE_WIDTH, cellMeans, compareBackground, personCells } from "./background";
```

```ts
const BG_INTERVAL_MS = 1000; // 배경 확인 간격 (제안서: 가이드라인 확인은 초당 1~2회)
```

`PoseState`에 추가:

```ts
  bgSame: boolean | null; // 배경이 기준과 같은지. null = 믿을 수 없음(기준 없음·무늬 없음)
  bgScore: number | null; // 확인용: 기준 배경과 닮은 정도(상관계수)
  bgSpread: number | null; // 확인용: 기준 배경 무늬의 퍼짐(밝기 표준편차)
```

`pose` 초기값:

```ts
  const pose = useRef<PoseState>({
    found: false, left: null, right: null, framed: null, guidePoints: null,
    bgSame: null, bgScore: null, bgSpread: null,
  });
```

- [ ] **Step 3: effect 안에 배경 읽기 함수 추가 (`readPose` 아래)**

```ts
    // 배경: 영상을 작게 줄여 칸별 밝기만 읽고, 머리~가슴이 화면 안인 동안은 그 배경을 기준으로 삼습니다.
    // (사용자가 카메라를 옮긴 뒤 다시 제대로 앉으면 새 배경이 기준이 됨)
    const canvas = document.createElement("canvas");
    canvas.width = BG_SAMPLE_WIDTH;
    canvas.height = BG_SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let bgRef: number[] | null = null;
    let bgRefSkip: boolean[] | null = null;

    function readBackground(video: HTMLVideoElement) {
      if (!context) return;
      context.drawImage(video, 0, 0, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const { data } = context.getImageData(0, 0, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const cells = cellMeans(data, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const skip = personCells(poseState.found ? poseState.guidePoints : null);
      const result = compareBackground(bgRef, bgRefSkip, cells, skip);
      poseState.bgSame = result.same;
      poseState.bgScore = result.score;
      poseState.bgSpread = result.spread;
      if (poseState.framed) {
        bgRef = cells;
        bgRefSkip = skip;
      }
    }
```

- [ ] **Step 4: 반복에 배경 확인 넣기**

`let lastPose = 0;` 아래:

```ts
      let lastBackground = 0;
```

Pose 인식 블록 바로 아래(`if (poseLandmarker && ...) {...}` 다음):

```ts
          // 배경은 Pose 결과(사람 위치)가 있어야 비교할 수 있어 Pose가 준비된 뒤에만 봅니다.
          if (poseLandmarker && now - lastBackground >= BG_INTERVAL_MS) {
            lastBackground = now;
            readBackground(video);
          }
```

정리 함수에 추가:

```ts
      poseState.bgSame = null;
```

- [ ] **Step 5: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과

- [ ] **Step 6: 커밋 (사용자 확인 후, Task 6 확인 뒤 함께 해도 됨)**

```bash
git add src/tracking/useTracking.ts
git commit -m "feat: 트래킹에 1초마다 배경 밝기 비교 추가"
```

---

### Task 6: 확인용 표시(`PoseReadout`) 개편

측정(Task 8)에 쓸 값을 보여 준다: 사람 인식, 화면 안/밖, 코·어깨 좌표, 배경 닮음·퍼짐, 팝업 이유.

**Files:**
- Modify: `src/tracking/PoseReadout.tsx` (전체 교체)

**Interfaces:**
- Consumes: `PoseState` (Task 1·5)

- [ ] **Step 1: `src/tracking/PoseReadout.tsx` 교체**

```tsx
// 확인용: 가이드라인(Pose)과 배경 비교가 지금 어떻게 판단하는지 글자로 보여 줍니다. (/tracking 전용)
// 기준값(여백·배경 닮음 기준)을 측정할 때 이 숫자들을 상황별로 적습니다.
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PoseState } from "./useTracking";
import type { PosePoint } from "./poseFrame";

const NAMES = ["코", "왼어깨", "오른어깨"]; // GUIDE_POINTS 순서와 같아야 합니다.
const f = (v: number | null) => (v === null ? "-" : v.toFixed(2));

// 점 하나 → "코(x 0.50, y 0.42)"  (visibility는 화면 밖에서도 높게 나와 표시하지 않음)
function describe(name: string, point: PosePoint | undefined) {
  return point ? `${name}(x ${f(point.x)}, y ${f(point.y)})` : `${name}(없음)`;
}

export default function PoseReadout({ pose }: { pose: RefObject<PoseState> }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      const { found, framed, guidePoints, bgSame, bgScore, bgSpread } = pose.current;
      const frame = framed === null ? "확인 못 함" : framed ? "들어옴" : "벗어남";
      const points = guidePoints
        ? guidePoints.map((p, i) => describe(NAMES[i], p)).join(" ")
        : "사람을 찾지 못함";
      const bg = bgSame === null ? "모름" : bgSame ? "같음" : "바뀜";
      setText(
        `가이드라인: ${frame} · 사람 ${found ? "있음" : "없음"} · ${points} · ` +
          `배경 ${bg} (닮음 ${f(bgScore)}, 무늬 ${f(bgSpread)})`
      );
    }, 100);
    return () => clearInterval(id);
  }, [pose]);

  return <div style={{ opacity: 0.7, fontSize: 12 }}>{text}</div>;
}
```

- [ ] **Step 2: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과

- [ ] **Step 3: 사용자 브라우저 확인**

`/tracking`에서: 정상으로 앉으면 "들어옴 · 사람 있음 · 배경 같음(닮음 0.9 이상 예상)", 한쪽 어깨를 화면 밖으로 빼면 "벗어남", 일어나 화면 밖으로 가면 "사람 없음 · 배경 같음", 웹캠을 옆으로 돌리면 "배경 바뀜".

- [ ] **Step 4: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/PoseReadout.tsx
git commit -m "feat: 가이드라인 확인 표시에 사람 인식·배경 비교 값 추가"
```

---

### Task 7: 팝업 화면 붙이기 + `OUTFRAME_SECONDS` 10초

**Files:**
- Create: `src/tracking/CameraGuideNotice.tsx`
- Modify: `src/study/SeatedStudy.tsx`, `src/HeadTrackingTest.tsx`, `src/focus/focusLogic.ts:26`

**Interfaces:**
- Consumes: `PoseState` (Task 5), `nextGuideAlert`, `initialGuideAlert`, `GuideAlert` (Task 4)
- Produces: `CameraGuideNotice({ pose }: { pose: RefObject<PoseState> }): JSX.Element | null`

- [ ] **Step 1: `src/tracking/CameraGuideNotice.tsx` 작성**

```tsx
// 카메라 문제 안내: 머리~가슴이 잘리거나 카메라가 돌아간 상태가 10초 넘게 이어지면 화면 위쪽에 안내를 띄웁니다.
// 버튼 없이, 다시 제대로 보이면 저절로 사라집니다. 자리를 떠난 경우(배경 그대로)에는 띄우지 않습니다.
// 판정 규칙은 poseFrame.ts(nextGuideAlert)에 있습니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { initialGuideAlert, nextGuideAlert } from "./poseFrame";
import type { GuideAlert } from "./poseFrame";
import type { PoseState } from "./useTracking";

const CHECK_MS = 1000; // 1초마다 확인 (배경 확인 주기와 같음)

export function CameraGuideNotice({ pose }: { pose: RefObject<PoseState> }) {
  const [alert, setAlert] = useState<GuideAlert>(initialGuideAlert);
  const lastInputMs = useRef<number | null>(null);

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
      // 다른 탭에 있으면 트래킹이 멈춰 마지막 값이 남아 있으므로 처음부터 다시 잽니다.
      if (document.hidden) {
        setAlert(initialGuideAlert);
        return;
      }
      const { found, framed, bgSame } = pose.current;
      setAlert((prev) =>
        nextGuideAlert(prev, { found, framed, bgSame, lastInputMs: lastInputMs.current }, Date.now())
      );
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [pose]);

  if (!alert.show) return null;
  return <div style={style}>📷 카메라에 머리와 어깨가 보이도록 맞춰 주세요</div>;
}

// 공부 막대(top 16) 바로 아래, 공부 시작 창(zIndex 20)보다 위
const style: CSSProperties = {
  position: "fixed", top: 56, left: "50%", transform: "translateX(-50%)", zIndex: 30,
  padding: "8px 16px", borderRadius: 8, background: "rgba(250,204,21,.95)", color: "#1f1a05",
  font: "14px system-ui, sans-serif", fontWeight: 600, pointerEvents: "none",
};
```

- [ ] **Step 2: `SeatedStudy`에 붙이기**

import 추가:

```tsx
import { CameraGuideNotice } from '../tracking/CameraGuideNotice'
```

JSX에서 `<SelfView ... />` 바로 아래:

```tsx
      {/* 앉는 순간부터 카메라 구도를 확인합니다. (공부 시작 전·공부 중 모두) */}
      <CameraGuideNotice pose={pose} />
```

- [ ] **Step 3: `/tracking`(`HeadTrackingTest`)에 붙이기**

import 추가:

```tsx
import { CameraGuideNotice } from "./tracking/CameraGuideNotice";
```

`<video ... />` 바로 위:

```tsx
      <CameraGuideNotice pose={pose} />
```

- [ ] **Step 4: `focusLogic.ts`의 `OUTFRAME_SECONDS` 10초로**

```ts
export const OUTFRAME_SECONDS = 10; // 머리~가슴이 이 시간 이상 화면 밖이면 가이드라인 이탈 (카메라 팝업 기준 GUIDE_ALERT_SECONDS와 같게)
```

- [ ] **Step 5: 기존 focusLogic 시나리오 확인**

Run:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { nextFocusState as next, initialFocusState as init, OUTFRAME_SECONDS } from "./src/focus/focusLogic.ts";
assert.equal(OUTFRAME_SECONDS, 10);
const on = { found: true, blink: 0, framed: false };
let s = next(init, on, 0);
s = next(s, on, 9900);
assert.equal(s.status, "focus");
s = next(s, on, 10000);
assert.equal(s.status, "outframe");
console.log("outframe 10s OK");
'
```

Expected: `outframe 10s OK`

- [ ] **Step 6: lint·build**

Run: `npm run lint && npm run build`
Expected: 통과

- [ ] **Step 7: 사용자 브라우저 확인**

- `/tracking`: 한쪽 어깨를 화면 밖으로 10초 → 노란 안내가 뜨고, 돌아오면 바로 사라짐. 자리를 떠나 10초 넘게 있어도 안내가 안 뜸. 웹캠을 옆으로 돌리고 10초 → 뜸.
- 지점에 앉기: 공부 시작 창이 떠 있는 상태에서 웹캠을 돌리면 창 위로 안내가 보임. 공부 중에도 같음. 공부 타이머는 안내와 상관없이 지금처럼 동작.

- [ ] **Step 8: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/CameraGuideNotice.tsx src/study/SeatedStudy.tsx src/HeadTrackingTest.tsx src/focus/focusLogic.ts
git commit -m "feat: 카메라 구도가 이상할 때 안내 팝업 띄우기"
```

---

### Task 8: 기준값 측정·반영과 문서

사용자가 측정하고, 결과로 임시값을 확정한다.

**Files:**
- Modify: `src/tracking/poseFrame.ts` (상수), `src/tracking/background.ts` (상수), `docs/판정-기준-근거.md`, `docs/superpowers/specs/2026-10-09-camera-guide-design.md` (맨 위 한 줄)

- [ ] **Step 1: 사용자 측정**

`/tracking`의 확인 표시를 상황마다 약 5초 보고 대표값을 적는다.

| 상황 | 가이드라인 | 사람 | 코 x,y | 왼어깨 x,y | 오른어깨 x,y | 배경 | 닮음 | 무늬 |
|---|---|---|---|---|---|---|---|---|
| 정상 착석 | | | | | | | | |
| 숙여서 필기 | | | | | | | | |
| 기지개 | | | | | | | | |
| 카메라 왼쪽으로 조금 / 크게 | | | | | | | | |
| 카메라 오른쪽으로 조금 / 크게 | | | | | | | | |
| 카메라 위로 | | | | | | | | |
| 카메라에 바짝 붙음 | | | | | | | | |
| 한쪽 어깨만 화면 밖 (#80) | | | | | | | | |
| 자리 떠나기 | | | | | | | | |
| 스탠드 켜기·끄기 | | | | | | | | |
| 뒤로 사람 지나가기 | | | | | | | | |
| 흰 벽 앞 | | | | | | | | |

- [ ] **Step 2: 값 고르기 (사용자와 함께)**

- `EDGE_MARGIN`: 정상·숙임·기지개의 코·어깨 x가 모두 안쪽, #80·카메라 돌림은 밖이 되는 값
- `SHOULDER_MAX_Y`: 정상·숙임 어깨 y 최댓값보다 크고, 카메라 위로·바짝 붙음은 넘는 값 (불가능하면 1 유지)
- `BG_SAME_SCORE`: 자리 떠나기·스탠드·사람 지나가기의 닮음 최솟값과 카메라 돌림의 닮음 최댓값 사이
- `BG_FLAT_SPREAD`: 흰 벽의 무늬 값보다 크고 평소 배경 무늬보다 작은 값
- 정상 상황 중 하나라도 걸리거나 비정상 상황 중 하나라도 놓치면 그 사실을 문서에 그대로 적는다.

- [ ] **Step 3: 상수 반영 후 시나리오·lint·build**

Run: Task 2·3·4 Step 1 명령, `npm run lint && npm run build`
Expected: 모두 통과 (값을 바꿔 시나리오가 깨지면 시나리오의 예시 값이 새 기준과 맞는지 확인하고, 시나리오 의도가 유지되게 고침)

- [ ] **Step 4: `docs/판정-기준-근거.md`에 절 추가**

"## 5. 카메라 가이드라인 — 화면 안 기준과 배경 비교" 절을 `## 참고 자료` 앞에 추가하고, 결정 요약 표에 행 두 개(화면 안 기준, 카메라 문제 팝업 10초)를 추가한다. 내용: 왜 좌표만 쓰는지(visibility 측정 0.98~1.00 [측정]), Step 1 측정표 [측정], 고른 값과 이유, 배경 비교 원리(상관계수로 밝기 변화 무시), 한계(1명·1환경, 흰 벽·조명 일부 변화). 마지막 수정 날짜를 바꾼다.

- [ ] **Step 5: 이전 설계 문서에 안내**

`docs/superpowers/specs/2026-10-09-camera-guide-design.md` 제목 바로 아래:

```markdown
> 2026-10-15 개편: `2026-10-15-camera-guide-redesign-design.md`가 이 문서를 대체한다.
```

- [ ] **Step 6: 커밋 (사용자 확인 후)**

```bash
git add src/tracking/poseFrame.ts src/tracking/background.ts docs/판정-기준-근거.md docs/superpowers/specs/2026-10-09-camera-guide-design.md
git commit -m "feat: 가이드라인·배경 비교 기준값을 측정으로 확정"
```

- [ ] **Step 7: PR (사용자 요청 시)**

제목 `feat: 카메라 가이드라인 개편 — 트래킹 통합, 좌표 기준, 카메라 문제 팝업`, 본문에 `Closes #80`, 김현에게: `useFaceTracking`·`usePoseTracking`이 `useTracking`으로 합쳐짐(결과 형태 같음).
