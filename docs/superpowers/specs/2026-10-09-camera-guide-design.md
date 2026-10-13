# 카메라 가이드라인 판정 설계

- 작성: 2026-10-09, 최원준 (Claude와 브레인스토밍)
- 브랜치: `feat/wonjun/camera-guide`
- 범위: **판정 로직만**. 착석 전 확인 화면, 지점 공간(내 모습 화면) 연결은 이번 범위가 아니다.

## 1. 목적

제안서 기준: 촬영 범위는 머리부터 가슴(양 어깨)까지이며, 공부 중 이 범위를 벗어나면 경고하고 타이머를 멈춘다(노란불 사유 "가이드라인 이탈"). 판정 정확도 목표는 80% 이상이다.

이번 작업은 MediaPipe Pose로 "머리~가슴이 화면 안에 있는지"를 판정해 집중 상태와 집중 시간에 반영하는 것까지 한다. 확인은 `/tracking`(트래킹 검증) 화면의 배지로 한다.

제외:
- 책상이 화면에 들어오는지 — Pose로 판단할 수 없다. 책상 위 물건은 이후 전자기기 감지(Object Detector)가 맡는다.
- 착석 전 안내 화면·가이드 틀 — 내 모습 화면은 웹캠 영상이 아니라 캐릭터를 보여 주므로, 틀을 그리려면 별도 화면이 필요하다. 다음 단계에서 김현과 정한다.
- 지점 공간 연결 — 판정(`useFocusState`)은 아직 `/tracking`에만 연결돼 있다. 실시간 동기화와 함께 다음 단계에서 한다.

## 2. 구성과 데이터 흐름

```
<video> (웹캠, useFaceTracking이 엶)
   ├─ useFaceTracking  → face.found, blink      (기존, 변경 없음)
   └─ usePoseGuide     → pose.framed            (새 파일, 0.5초마다)
                ↓
        useFocusState (0.1초마다) → nextFocusState(...) → 상태 + 집중 시간
                ↓
        FocusBadge (화면 표시)
```

| 파일 | 변경 | 내용 |
|---|---|---|
| `src/tracking/usePoseGuide.ts` | 새 파일 | `usePoseGuide(videoRef)` → `{ pose, status }`. `pose`는 `RefObject<{ framed: boolean \| null }>`. Pose Landmarker(lite, float16)를 불러와 `POSE_INTERVAL_MS`마다 `detectForVideo` 실행. 웹캠은 열지 않고 `useFaceTracking`이 연 `<video>`를 같이 쓴다. |
| `src/tracking/poseFrame.ts` | 새 파일 | 순수 함수 `isFramed(landmarks)`와 `VISIBLE_SCORE`·`GUIDE_POINTS`. Node로 검사하려고 usePoseGuide에서 분리(구현 계획 작성 중 추가) |
| `src/focus/focusLogic.ts` | 수정 | `FocusInput.framed?: boolean \| null` 추가, `FocusStatus`에 `"outframe"` 추가, 상태에 `outframeSeconds`·`outframeSince` 추가, 상수 `OUTFRAME_SECONDS` 추가 |
| `src/focus/useFocusState.ts` | 수정 | 두 번째 인자로 `pose` ref(선택)를 받아 `framed`를 함께 넘긴다. 안 넘기면 기존과 같다. |
| `src/focus/FocusBadge.tsx` | 수정 | `🟡 가이드라인 이탈 의심` 표시와 벗어난 시간, 선택 prop `guide`로 모델 로딩·오류 표시 |
| `src/HeadTrackingTest.tsx` | 2~3줄 | `usePoseGuide(videoRef)` 호출, `useFocusState(face, pose)`로 전달 (김현 파일 — 불러오는 줄만 추가) |

- 새 라이브러리 없음: Pose Landmarker는 설치된 `@mediapipe/tasks-vision` 1.0.1에 포함. WASM은 `useFaceTracking`과 같은 jsdelivr 주소, 모델은 Google Storage `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` (2026-10-09 응답 200 확인). `vision.d.ts`에 `PoseLandmarker` 포함 확인.
- 개인정보: 영상은 기기 안에서만 처리하고, 판정에는 `framed` 참/거짓만 쓴다.
- 현의 `src/space/status.ts`는 `focus`가 아니면 노랑으로 처리하므로 `outframe`도 수정 없이 노란불이 된다. 상태 이름이 하나 늘어난다는 것은 김현에게 알린다.

## 3. "화면 안" 기준 (usePoseGuide)

Pose 결과의 첫 번째 사람에서 코(0번), 왼쪽 어깨(11번), 오른쪽 어깨(12번)가 모두:
- `visibility >= VISIBLE_SCORE` 이고
- 정규화 좌표 `x`, `y`가 0~1 안이면 `framed = true`.

사람이 없거나 하나라도 조건을 못 채우면 `framed = false`.
모델을 불러오는 중이거나 불러오기에 실패했으면 `framed = null`.

## 4. 판정 규칙 (focusLogic)

기존 순서에 ④를 더한다.

1. 다른 화면 사용 — 기존과 같음. 가이드라인 기록(`outframeSince`)은 지운다.
2. 얼굴 없음(`found = false`) — 기존과 같음(30초 뒤 `away`). 가이드라인은 보지 않고 기록을 지운다. 자리를 비우면 어깨도 사라지므로 같은 상황을 두 번 세지 않기 위해서다.
3. 얼굴 있음 — 눈 감김 판정은 기존과 같음(2분 뒤 `drowsy`).
4. 얼굴 있음 — **범위 이탈 판정**
   - `framed === false`면 `outframeSince`부터 시간을 잰다. `framed`가 `true`나 `null`이면 기록을 지운다(한 번이라도 들어오면 0부터 다시).
   - `OUTFRAME_SECONDS` 이상이면 `outframe`.

상태 우선순위: `offscreen` > `away` > `drowsy` > `outframe` > `focus`. 졸음과 범위 이탈이 겹치면 아이콘이 따로 있는 졸음을 보여 준다.

집중 시간:
- `drowsy` 또는 `outframe`이면 보류 시간을 버리고 쌓지 않는다.
- 눈을 감았거나 범위를 벗어났지만 아직 기준 시간 전이면 보류에 쌓는다.
- 눈을 뜨고 범위 안(또는 `null`)이면 보류 시간까지 확정한다.

학습기기 사용함 모드에서도 가이드라인 판정은 그대로 적용한다(제안서 기준).

## 5. 기준값 (임시, 파일 맨 위 상수)

| 상수 | 값 | 위치 | 의미 |
|---|---|---|---|
| `OUTFRAME_SECONDS` | 5 | `focusLogic.ts` | 벗어난 뒤 이탈로 판정하기까지 |
| `VISIBLE_SCORE` | 0.5 | `poseFrame.ts` | 코·어깨가 보인다고 보는 최소 점수 |
| `POSE_INTERVAL_MS` | 500 | `usePoseGuide.ts` | Pose 실행 간격 (제안서: 초당 1~2회) |

필기 자세 실험 후 팀에서 확정한다.

## 6. 오류 처리

- Pose 모델 불러오기 실패: `status = "error"`, `framed = null` → 가이드라인을 무시하고 나머지 판정은 계속한다. 배지에 "가이드라인 확인 불가"를 작게 표시한다.
- 영상이 아직 준비되지 않음(`readyState < 2`): 그 회차는 건너뛴다.
- 화면을 떠날 때: 타이머 정리, `landmarker.close()`. 웹캠 스트림은 `useFaceTracking`이 닫는다.

## 7. 확인 방법

1. `focusLogic.ts` Node 시나리오 검사
   - 범위 밖 4.9초 → `focus`, 5초 → `outframe`
   - 5초 전에 돌아오면 보류 시간이 집중 시간에 더해짐
   - `outframe`이 되면 보류 시간을 버리고, 돌아온 뒤부터 다시 쌓임
   - 얼굴 없음이면 `framed = false`여도 `outframe`이 아니라 기존 이탈 판정
   - `framed = null` 또는 생략이면 기존과 똑같이 동작 (기존 시나리오 그대로 통과)
   - 졸음과 범위 이탈이 겹치면 `drowsy`
2. `npm run build`, `npm run lint` 통과
3. 브라우저(사용자): `/tracking`에서 어깨를 화면 밖으로 빼고 5초 뒤 노란 배지, 돌아오면 초록. 로그인이 필요하므로 `.env.local`과 회원가입이 먼저 필요하다.
