# 학습기기 사용함 두 버튼 분리 설계 (Issue #172)

- 작성: 최원준, 2026-10-21
- 관련: Issue #172, #175(휴대폰 딴짓 판별 불가), #174(휴대폰 묶기 — 범위 밖), PR #158(숨긴 탭 인식), PR #163(휴대폰 감지)
- 기준 문서: `docs/판정-기준-근거.md` 7절(다른 화면), 8절(휴대폰 감지)

## 1. 왜 나누는가

지금은 공부 시작 창의 "학습기기 사용함" 체크 하나가 두 가지를 한꺼번에 허용한다.

1. 다른 탭·다른 앱에 가 있어도 멈추지 않는다 (`offscreen` 판정 끔).
2. 휴대폰이 카메라에 보여도 넘어간다 (`phone` 판정 끔, 휴대폰 모델도 안 켬).

다른 탭에서 인강을 보려고 체크를 켜면 그 김에 휴대폰까지 허용되어 버린다. 사용자는 "다른 탭 공부"만 원했는데 휴대폰을 집어도 아무 표시가 없으니 휴대폰을 하게 된다(사용자 관찰, 2026-10-21). 두 허용을 따로 고르게 해서, 필요한 것만 켜게 한다.

## 2. 목표·범위 밖·실패 조건

**목표**
- 공부 시작 창에서 "다른 탭·앱 사용함"과 "휴대폰·학습기기 사용함"을 따로 켠다. 둘 다 기본 꺼짐, 동시에 켤 수 있다.
- 각 체크는 자기 판정 하나만 끈다. 어느 쪽을 켜도 자리 이탈·졸음·가이드라인 판정은 그대로다.
- 공부 기록에 어느 쪽을 켰는지 남는다. 기존 기록도 뜻이 바뀌지 않게 읽는다.

**범위 밖**
- 휴대폰 묶기(#174, QR로 `/phone` 연결)는 이번에 만들지 않는다. 다만 "휴대폰·학습기기 사용함"을 켠 사람에게 나중에 묶기를 권할 수 있게, 체크 아래 안내 문구 자리만 남긴다(지금은 비움).
- 휴대폰으로 실제로 공부하는지 확인하는 것(#175)은 웹에서 불가능하다. "휴대폰·학습기기 사용함"은 자가 보고다. 이 한계는 판정 근거 8절에 이미 적혀 있다.
- 공부 중에 체크를 바꾸는 기능은 추가하지 않는다. 지금처럼 "과목 바꾸기"로 시작 창을 다시 열어 고른다.
- DB 스키마는 바꾸지 않는다.
- 내 기록·프로필 화면은 바꾸지 않는다. 지금 `study_logs.devices`를 읽어 보여 주는 화면이 없다(2026-10-21 확인).

**실패 조건**
- 둘 중 하나만 켰는데 다른 쪽까지 풀리는 것.
- 예전 기록(`learning_device` 하나)이 "휴대폰만 허용"처럼 뜻이 좁아져 읽히는 것.

## 3. 두 체크의 동작

| | ⓐ 다른 탭·앱 사용함 | ⓑ 휴대폰·학습기기 사용함 |
|---|---|---|
| 사용 장면 | 같은 컴퓨터의 다른 탭·앱에서 인강·문서를 본다 | 폰·패드·노트북 등 다른 기기로 인강·전자책을 본다 |
| 끄는 판정 | `offscreen` (다른 화면 사용) | `phone` (휴대폰 감지) |
| 켰을 때 | 다른 탭·앱에 가도 멈추지 않는다. 숨긴 탭에서도 얼굴 인식이 이어져(PR #158) 자리 이탈·졸음은 계속 본다 | 휴대폰이 카메라에 보여도 넘어간다. 휴대폰 감지 모델을 켜지 않는다(연산 절약) |
| 껐을 때 | 다른 탭·앱으로 가는 즉시 `offscreen`(빨간불), 타이머 멈춤 | 휴대폰이 3초 넘게 보이면 `phone`(빨간불), 타이머 멈춤. 시작 창에 "휴대폰은 치워 두세요" 안내 |
| 그대로인 것 | 자리 이탈·졸음·가이드라인 판정 | 자리 이탈·졸음·가이드라인 판정 |

둘 다 켜면 두 판정이 모두 꺼지고, 지금의 "학습기기 사용함"과 같은 동작이 된다.

## 4. 바꾸는 곳

### 4-1. 판정 로직 (`src/focus/focusLogic.ts`, 순수)

`ScreenInput.allowDevices: boolean` 하나를 두 값으로 나눈다.

```ts
export type ScreenInput = {
  pageHidden: boolean;
  windowFocused: boolean;
  allowOtherScreen: boolean; // ⓐ 다른 탭·앱 사용함 → offscreen 판정 안 함
  allowDevices: boolean;     // ⓑ 휴대폰·학습기기 사용함 → phone 판정 안 함
};
```

- `offScreenStop`·`offScreen && !allow…` 분기(다른 화면)는 `allowOtherScreen`만 본다.
- `phoneSince` 분기(휴대폰)는 `allowDevices`만 본다.
- 기본값 `{ pageHidden: false, windowFocused: true, allowOtherScreen: false, allowDevices: false }`.
- 판정 우선순위(다른 화면 > 휴대폰 > 얼굴 판정)는 그대로 둔다.
- 이름은 `allowDevices`를 휴대폰 쪽에 그대로 두고 새 이름을 다른 화면 쪽에 붙인다. "학습기기"라는 말이 기기(ⓑ) 쪽에 맞기 때문이다.

### 4-2. 판정 훅 (`src/focus/useFocusState.ts`)

- 상태를 `allowOtherScreen`·`allowDevices` 둘로 들고, 둘 다 `ScreenInput`에 넣는다.
- 반환값에 `setAllowOtherScreen`·`setAllowDevices`를 둘 다 둔다(트래킹 검증 화면·각본 시험이 쓴다).
- 초기값은 `StudyChoice`에서 둘 다 받는다.

### 4-3. 공부 시작 창 (`src/study/StartStudyDialog.tsx`)

- `StudyChoice = { subject; allowOtherScreen: boolean; allowDevices: boolean }`.
- 체크박스 두 개, 각각 아래 한 줄 설명.
  - ⓐ "다른 탭·앱 사용함" — "켜면 다른 탭·다른 앱을 써도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다."
  - ⓑ "휴대폰·학습기기 사용함" — "켜면 휴대폰·패드 등이 카메라에 보여도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다."
- ⓑ가 꺼져 있을 때만 지금의 "📱 휴대폰은 카메라에 보이지 않게 치워 두세요 …" 안내를 ⓑ 아래에 보인다.
- 배치는 지금 체크박스 자리에 두 개를 세로로 둔다. 디자인 변경 없음.

### 4-4. 공부 화면 (`src/study/SeatedStudy.tsx`, `src/study/StudyRunner.tsx`)

- 휴대폰 모델 켜기: `useTracking(videoRef, { phone: choice !== null && !choice.allowDevices })` — ⓑ만 본다(지금 식 그대로, 뜻만 ⓑ로 좁아짐).
- `StudyRunner`가 받는 `key`와 `useFocusState` 초기값에 두 값을 모두 넘긴다.
- 기록 저장의 `devices`는 4-5의 함수로 만든다.

### 4-5. 기록 값 (`src/study/studyLogic.ts`, 순수)

`study_logs.devices`(text[])에 켠 것만 담는다. 스키마·제약(0015: 10개·300자 이하) 안이다.

| 켠 것 | 저장 값 |
|---|---|
| 없음 | `{}` |
| ⓐ만 | `{other_screen}` |
| ⓑ만 | `{learning_device}` |
| 둘 다 | `{other_screen, learning_device}` |

- `devicesOf(choice)`가 위 표대로 만든다. 상수 `OTHER_SCREEN = 'other_screen'`, `LEARNING_DEVICE = 'learning_device'`(기존).
- **기존 기록 읽기**: 2026-10-21 이전 기록의 `{learning_device}`는 예전 체크 하나가 둘 다 허용한 것이므로 "둘 다 켬"으로 읽는다. 읽는 쪽 함수(예: `allowedOf(devices: string[]): { otherScreen, devices }`)를 `studyLogic.ts`에 두고, `other_screen`이 없고 `learning_device`만 있으면 둘 다 참으로 돌려준다. 이 규칙은 함수 주석에 날짜와 함께 적는다.
  - 2026-10-21 이후 ⓑ만 켠 기록도 `{learning_device}`라 겉모습이 같다. 구분이 필요해지면 그때 `started_at`으로 가른다. 지금 기록을 읽어 쓰는 화면(내 기록·프로필)은 `devices`를 보지 않으므로 당장은 영향이 없다.

### 4-6. 트래킹 검증 화면 (`src/focus/FocusBadge.tsx`)

- 임시 체크박스를 두 개로 나눈다. 문구는 4-3과 같다.

### 4-7. 각본 시험 (`src/focus/scriptTest.ts`, `src/focus/ScriptTestPanel.tsx`)

- 행동 13 "학습기기 사용함 + 다른 탭에서 자리 비우기"는 ⓐ만 켠다. `Behavior.allowDevices` → `allowOtherScreen`으로 이름을 바꾸고, 패널의 켜기·끄기도 `setAllowOtherScreen`을 부른다.
- 로그 CSV의 `allowDevices` 열을 `allowOtherScreen,allowDevices` 두 열로 늘린다. 행동 이름은 "다른 탭·앱 사용함 + 다른 탭에서 자리 비우기"로 고친다.
- 설계 문서 `2026-10-15-script-test-design.md`의 13번 설명도 같이 고친다.

### 4-8. 판정 자동 기록 (`src/focus/focusLog.ts`, `src/focus/FocusLogRecorder.tsx`)

- `FocusLogRow.allowDevices` → `allowOtherScreen`·`allowDevices` 두 칸. 구간 나누기(`segmentsOf`)는 둘 중 하나라도 바뀌면 새 구간. CSV·표에 두 칸 모두 보인다(값은 "켬"/"끔").
- localStorage `focusLog:v1`에 남은 예전 줄은 `allowDevices`만 있다. 읽을 때 `allowOtherScreen`이 없으면 `allowDevices` 값으로 채운다(예전 체크 = 둘 다).

### 4-9. 문서

- 팀 `CLAUDE.md` 용어 "학습기기 사용함" 항목을 두 체크로 고쳐 쓴다(팀 PR).
- `docs/판정-기준-근거.md` 7절(다른 화면)은 ⓐ, 8절(휴대폰)은 ⓑ 기준으로 문장을 고치고, 7절 앞에 두 체크를 나눈 이유(1절)를 짧게 적는다.

## 5. 확인 방법

- 순수 로직(`node --input-type=module`로 `focusLogic.ts` 시나리오): ⓐ만 켜고 탭 숨김 → `offscreen` 아님, 휴대폰 3초 → `phone`. ⓑ만 켜고 휴대폰 3초 → `phone` 아님, 탭 숨김 → 즉시 `offscreen`. 둘 다 켬 → 둘 다 아님. 둘 다 끔 → 지금과 같음. `devicesOf`·`allowedOf` 네 조합과 예전 값 `{learning_device}` → 둘 다 참.
- 브라우저(`npm run dev`, 사용자): 시작 창에 체크 두 개가 보이고, ⓐ만 켜고 다른 탭에 가도 초록이 유지되는지, 그 상태에서 휴대폰을 보이면 3초 뒤 빨강이 되는지. ⓑ만 켜고 휴대폰을 보여도 초록인지, 다른 탭에 가면 바로 빨강인지. 저장된 기록의 `devices` 값이 표대로인지(Supabase 테이블).
- `npm run lint`, `npm run build` 통과.

## 6. 작업 순서 (검토 질문에 대한 결정, 2026-10-21)

- 브랜치 `feat/wonjun/device-toggle`은 표시등 재정의 커밋(`feat/wonjun/light-redefine`, 로컬) 위에서 땄다. 이 문서의 "빨간불" 표현은 그 재정의 기준이다. PR은 표시등 재정의 → 이 작업 순서로 올린다.
- 팀 `CLAUDE.md` 용어 수정은 이 작업의 PR에 같이 넣는다(따로 올리면 설명과 코드가 어긋나는 기간이 생긴다).
- 푸시·PR은 사용자가 요청할 때만 한다.

## 7. 만드는 사람이 정할 것

- 체크박스·설명 문구의 세부 간격, 상태 변수 이름(위 이름은 제안).
- `allowedOf` 함수 이름과 반환 모양.
- 각본 시험 CSV 열 순서.
