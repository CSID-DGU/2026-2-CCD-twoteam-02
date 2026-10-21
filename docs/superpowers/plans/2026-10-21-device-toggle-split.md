# 학습기기 사용함 두 버튼 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공부 시작 창의 "학습기기 사용함" 하나를 "다른 탭·앱 사용함"(ⓐ)과 "휴대폰·학습기기 사용함"(ⓑ) 두 체크로 나눠, 각각 `offscreen`·`phone` 판정만 끄게 한다.

**Architecture:** 순수 로직(`focusLogic.ts`의 `ScreenInput`, `studyLogic.ts`의 기록 값)을 먼저 두 값으로 나누고, 그 위의 훅·화면·각본 시험·판정 기록이 두 값을 넘기게 바꾼다. DB 스키마는 그대로이고 `study_logs.devices`(text[])에 켠 것만 담는다. 예전 기록 `{learning_device}`는 "둘 다 켬"으로 읽는다.

**Tech Stack:** TypeScript, React 19, Vite. 테스트 도구가 없으므로 순수 로직은 Node의 타입 제거 실행(`node --input-type=module -e 'import … from "./src/…ts"'`)으로 시나리오를 검사한다. 시나리오 스크립트는 스크래치패드에 두고 커밋하지 않는다.

**Spec:** `docs/superpowers/specs/2026-10-21-device-toggle-split-design.md`

## Global Constraints

- 브랜치 `feat/wonjun/device-toggle`(표시등 재정의 커밋 위). 푸시·PR은 사용자가 요청할 때만. 로컬 커밋은 태스크마다 한다.
- 커밋 메시지 `종류: 한국어 설명`. 주석은 한국어, 짧고 이유 중심.
- 기존 함수 구성·변수명·상수 위치를 유지하고 필요한 부분만 고친다. 리팩터링 금지.
- 둘 다 끈 상태의 판정 결과는 지금과 완전히 같아야 한다. 판정 우선순위(다른 화면 > 휴대폰 > 얼굴)는 유지.
- 기록 값: ⓐ `other_screen`, ⓑ `learning_device`(기존 상수 유지). 둘 다 켬 `{other_screen, learning_device}`.
- 화면 문구(스펙 4-3): ⓐ "다른 탭·앱 사용함" / "켜면 다른 탭·다른 앱을 써도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다." ⓑ "휴대폰·학습기기 사용함" / "켜면 휴대폰·패드 등이 카메라에 보여도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다."
- 각 태스크 끝에 `npm run lint`와 `npm run build`가 통과해야 한다.

## Review Focus

1. 둘 다 끔일 때 기존 시나리오 결과가 그대로인가 (회귀). → Task 1 시나리오 S1.
2. ⓐ만 켜고 다른 탭에 있는 동안 휴대폰이 3초 넘게 잡히면 `phone`이 되는가 (숨긴 탭에서도 휴대폰 감지는 돈다). → Task 1 시나리오 S3.
3. 예전 localStorage 판정 기록 줄(`allowOtherScreen` 없음)을 읽어도 깨지지 않고 ⓐ=예전 값으로 채워지는가. → Task 6 시나리오.
4. 예전 공부 기록 `{learning_device}`를 읽으면 둘 다 참인가. → Task 2 시나리오.
5. 공부 중 "과목 바꾸기"로 체크 하나만 바꿔도 타이머가 새로 시작되는가 (`StudyRunner`의 `key`에 두 값 모두). → Task 4 코드 확인 + 브라우저 확인 항목.

---

### Task 1: 판정 로직 입력 나누기

**Files:**
- Modify: `src/focus/focusLogic.ts:66-73` (`ScreenInput`), `:150` (기본값), `:157` (`phoneSince`), `:159` (`offScreenStop`), `:199` (`offScreen && !screen.allowDevices`)
- Test: 스크래치패드 `device-toggle-scenarios.mjs` (커밋 안 함)

**Interfaces:**
- Produces: `ScreenInput = { pageHidden; windowFocused; allowOtherScreen: boolean; allowDevices: boolean; lastInputMs? }`. `allowOtherScreen`은 `offscreen` 판정만, `allowDevices`는 `phone` 판정만 끈다.

- [ ] **Step 1: 시나리오 스크립트 작성**

`nextFocusState(prev, input, nowMs, screen)`를 0.1초 간격으로 돌리는 헬퍼를 쓰고, 네 시나리오를 둔다. `input`은 `{ found: true, ear: null, pitch: 0, framed: null, bodyFound: null, baseline: null, updatedAt: nowMs, phone }` 꼴.

```js
// S1 둘 다 끔: pageHidden=true 1틱 → status "offscreen". phone=true 3.1초 → "phone".
// S2 ⓐ만: pageHidden=true 5초 → "focus" 유지(studyMs 증가). phone=true 3.1초 → "phone".
// S3 ⓐ만 + 다른 탭: pageHidden=true 이고 phone=true 3.1초 → "phone" (숨긴 탭에서도 휴대폰 판정).
// S4 ⓑ만: phone=true 10초 → "focus" 유지, phoneSeconds 0. pageHidden=true 1틱 → "offscreen".
// S5 둘 다 켬: pageHidden=true + phone=true 10초 → "focus" 유지.
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `node --input-type=module /…/scratchpad/device-toggle-scenarios.mjs` (스크립트는 `./src/focus/focusLogic.ts`를 상대 경로로 import, 작업 폴더에서 실행)
Expected: S2·S3·S4·S5 중 최소 하나 FAIL (지금은 `allowDevices` 하나가 둘 다 끔)

- [ ] **Step 3: `ScreenInput`에 `allowOtherScreen: boolean` 추가, 분기 수정**

- `allowDevices` 주석을 `// ⓑ "휴대폰·학습기기 사용함" → 휴대폰 판정 안 함`, 새 칸 주석 `// ⓐ "다른 탭·앱 사용함" → 다른 화면 판정 안 함`.
- 기본값(150행) `allowOtherScreen: false` 추가.
- `offScreenStop`(159행)과 `offScreen && !screen.allowDevices`(199행)는 `allowOtherScreen`으로. 그 위 주석 "학습기기 사용 안 함이면"은 "다른 탭·앱 사용함이 아니면"으로.
- `phoneSince`(157행) 주석 "학습기기 사용 안 함일 때만"은 "휴대폰·학습기기 사용함이 아닐 때만"으로.

- [ ] **Step 4: 시나리오 통과 확인**

Run: 위 명령. Expected: S1~S5 모두 PASS.

- [ ] **Step 5: lint·build (훅·화면이 아직 옛 모양이라 build 실패 가능 — 이 태스크에서는 타입 오류가 `useFocusState.ts`·`ScriptTestPanel.tsx`에서만 나는지 확인하고 Task 3·5에서 고친다)**

Run: `npm run lint && npm run build`
Expected: lint 통과. build는 `allowOtherScreen` 누락 오류만.

- [ ] **Step 6: 커밋** — `fix: 판정 입력에서 다른 화면 허용과 휴대폰 허용을 나눔`

---

### Task 2: 기록 값 만들기·읽기

**Files:**
- Modify: `src/study/studyLogic.ts:10-13`
- Test: 스크래치패드 `devices-scenarios.mjs`

**Interfaces:**
- Produces:
  - `OTHER_SCREEN = 'other_screen'`, `LEARNING_DEVICE = 'learning_device'`(기존)
  - `devicesOf(choice: { allowOtherScreen: boolean; allowDevices: boolean }): string[]` — ⓐ면 `OTHER_SCREEN`, ⓑ면 `LEARNING_DEVICE`, 순서 ⓐ→ⓑ.
  - `allowedOf(devices: string[]): { allowOtherScreen: boolean; allowDevices: boolean }` — `other_screen` 포함이면 ⓐ 참, `learning_device` 포함이면 ⓑ 참. **`other_screen`이 없고 `learning_device`만 있으면 둘 다 참**(2026-10-21 이전 기록은 체크 하나가 둘 다 허용했음 — 주석에 날짜와 함께 적는다).

- [ ] **Step 1: 시나리오** — `devicesOf` 네 조합이 `[]`, `['other_screen']`, `['learning_device']`, `['other_screen','learning_device']`. `allowedOf([])`→둘 다 거짓, `allowedOf(['learning_device'])`→둘 다 참, `allowedOf(['other_screen'])`→ⓐ만, `allowedOf(['other_screen','learning_device'])`→둘 다 참, 모르는 값 `['tablet']`→둘 다 거짓.
- [ ] **Step 2: 실행해 실패 확인** (`devicesOf`가 boolean을 받아 TypeError 또는 결과 불일치)
- [ ] **Step 3: 구현** — 기존 주석 "지금은 켜기·끄기뿐이라 하나만 쓰고…"를 두 값 설명으로 교체.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 공부 기록의 기기 값을 다른 화면·학습기기 두 갈래로 저장`

---

### Task 3: 판정 훅과 트래킹 검증 화면

**Files:**
- Modify: `src/focus/useFocusState.ts` (전체 — `FocusView`, 시그니처, `screen`, 반환), `src/HeadTrackingTest.tsx:52`, `src/focus/FocusBadge.tsx:63-71`(체크박스)

**Interfaces:**
- Consumes: Task 1 `ScreenInput`.
- Produces:
  - `useFocusState(face, initial: { allowOtherScreen: boolean; allowDevices: boolean } = { allowOtherScreen: false, allowDevices: false }, pose?, extras?)` — 두 번째 인자가 boolean에서 객체로 바뀐다.
  - `FocusView = FocusState & { allowOtherScreen; allowDevices; setAllowOtherScreen(v); setAllowDevices(v) }`.

- [ ] **Step 1: `useFocusState` 수정** — 상태 둘, `screen`에 둘 다, 의존성 배열에 둘 다, 반환에 넷. 주석 "initialAllowDevices: …"를 두 값 설명으로.
- [ ] **Step 2: `HeadTrackingTest.tsx:52`** — `useFocusState(face, undefined, pose, {...})`로 기본값 사용.
- [ ] **Step 3: `FocusBadge.tsx`** — 임시 체크박스를 두 개로. 문구는 Global Constraints. 기존 "임시: 모드 선택 창이 생기면…" 주석 유지.
- [ ] **Step 4: `ScriptTestPanel.tsx:69-70`의 `useFocusState(face, false, …)` 두 곳은 build가 깨지므로 여기서 `undefined`로 바꿔 둔다**(동작 변경은 Task 5).
- [ ] **Step 5: `npm run lint && npm run build`** — Expected: 남은 오류가 `StartStudyDialog`/`SeatedStudy`/`StudyRunner`(`StudyChoice.allowDevices` → 훅 인자)·`ScriptTestPanel`(`setAllowDevices` 호출)·`FocusLogRecorder`(없음)뿐인지 확인. 없으면 통과.
- [ ] **Step 6: 커밋** — `feat: 판정 훅과 트래킹 검증 화면이 두 허용 값을 따로 다룸`

---

### Task 4: 공부 시작 창과 공부 화면

**Files:**
- Modify: `src/study/StartStudyDialog.tsx:8`(`StudyChoice`), `:22`(상태), `:81-89`(체크박스), `:100`(`onStart`); `src/study/SeatedStudy.tsx:42`(주석), `:75`(`key`); `src/study/StudyRunner.tsx:37`(`useFocusState` 호출), `:63`(`devicesOf`)

**Interfaces:**
- Consumes: Task 2 `devicesOf(choice)`, Task 3 `useFocusState(face, { allowOtherScreen, allowDevices }, …)`.
- Produces: `StudyChoice = { subject: Subject; allowOtherScreen: boolean; allowDevices: boolean }`.

- [ ] **Step 1: `StartStudyDialog`** — 상태 `allowOtherScreen`·`allowDevices` 둘(기본 false), 체크박스 두 개를 세로로(각각 `styles.check` + 아래 `styles.hint` 설명). ⓑ 아래에 `!allowDevices`일 때만 기존 "📱 휴대폰은 …" 안내. 파일 머리 주석 "과목과 학습기기 사용 여부를" → "과목과 두 가지 허용(다른 탭·앱, 휴대폰·학습기기)을". `onStart({ subject: picked, allowOtherScreen, allowDevices })`.
- [ ] **Step 2: `SeatedStudy`** — `useTracking(videoRef, { phone: choice !== null && !choice.allowDevices })`는 그대로, 주석을 "휴대폰 감지는 휴대폰·학습기기 사용함이 아닐 때만 켭니다"로. `key`를 `` `${choice.subject.id}-${choice.allowOtherScreen}-${choice.allowDevices}` ``.
- [ ] **Step 3: `StudyRunner`** — `useFocusState(face, { allowOtherScreen: choice.allowOtherScreen, allowDevices: choice.allowDevices }, undefined, {...})`, `devices: devicesOf(choice)`.
- [ ] **Step 4: `npm run lint && npm run build`** — Expected: `ScriptTestPanel`·`FocusLogRecorder`의 `allowDevices` 관련 오류만 남거나 통과.
- [ ] **Step 5: 커밋** — `feat: 공부 시작 창의 학습기기 사용함을 다른 탭·앱 사용과 휴대폰·학습기기 사용으로 나눔`

---

### Task 5: 각본 시험 13번

**Files:**
- Modify: `src/focus/scriptTest.ts:25`(`Behavior.allowDevices` → `allowOtherScreen`), `:52-55`(13번 이름·값), `:202`·`:210`·`:216`(LogRow·CSV); `src/focus/ScriptTestPanel.tsx:109-112`, `:136`, `:162-165`; `docs/superpowers/specs/2026-10-15-script-test-design.md:58`, `:61`, `:105`
- Test: 기존 `scriptTest` 시나리오(설계 문서 139행의 11개)가 그대로 통과하는지 — 스크래치패드에 `.ts` 복사본으로 실행(런타임 import 때문, 10-16 방식)

**Interfaces:**
- Consumes: Task 3 `setAllowOtherScreen`, `FocusView.allowOtherScreen/allowDevices`.
- Produces: `Behavior.allowOtherScreen?: boolean`; `LogRow.allowOtherScreen: boolean; allowDevices: boolean`; CSV 열 `…,hidden,focused,allowOtherScreen,allowDevices,frontEar,…`.

- [ ] **Step 1: `scriptTest.ts`** — 13번 이름 "다른 탭·앱 사용함 + 다른 탭에서 자리 비우기", `allowOtherScreen: true`. 주석 "이 행동 동안 '다른 탭·앱 사용함'으로 판정". `LogRow`에 두 칸, `logCsv` 헤더·행에 두 열.
- [ ] **Step 2: `ScriptTestPanel.tsx`** — 109·162행 `behavior.allowOtherScreen`이면 `plain.setAllowOtherScreen(…)`·`guide.setAllowOtherScreen(…)`. 136행 `allowOtherScreen: plain.allowOtherScreen, allowDevices: plain.allowDevices`.
- [ ] **Step 3: 시나리오 실행** — 13번 채점(마감 70초) 포함 기존 시나리오 통과. Expected: 모두 PASS.
- [ ] **Step 4: 설계 문서 13번 설명 3곳 고치기** — 58행 행동 이름, 61행 "13번 동안에만 판정을 '다른 탭·앱 사용함'으로", 105행 `allowDevices` 행을 `allowOtherScreen`(13번)·`allowDevices` 두 줄로.
- [ ] **Step 5: `npm run lint && npm run build`** — Expected: `FocusLogRecorder`만 남거나 통과.
- [ ] **Step 6: 커밋** — `feat: 각본 시험 13번이 다른 탭·앱 사용함만 켜고 로그에 두 허용 값을 기록`

---

### Task 6: 판정 자동 기록

**Files:**
- Modify: `src/focus/focusLog.ts`(`FocusLogRow`, `LogSegment`, `segmentsOf` 분할 조건, `CSV_HEADER`, `toCsv`), `src/focus/FocusLogRecorder.tsx:23-32`(`loadRows`), `:91`(push), `:144`(표 칸), 표 머리글
- Test: 스크래치패드 `focusLog-scenarios.mjs`

**Interfaces:**
- Produces: `FocusLogRow.allowOtherScreen: boolean; allowDevices: boolean`; `LogSegment` 같은 두 칸; CSV 헤더 "학습기기" → "다른 탭·앱", "휴대폰·기기" 두 칸(값 "켬"/"끔").

- [ ] **Step 1: 시나리오** — ① 줄 3개(ⓐ 끔→켬→켬)에서 `segmentsOf`가 구간 2개. ② ⓑ만 바뀌어도 구간이 갈린다. ③ `toCsv` 헤더에 두 칸, 값 "켬"/"끔". ④ 예전 모양 줄 `{ …, allowDevices: true }`(ⓐ 칸 없음)을 `loadRows`의 보정 함수에 넣으면 `allowOtherScreen === true`.
  - ④를 위해 `focusLog.ts`에 `export function withBothFlags(row: FocusLogRow & { allowOtherScreen?: boolean }): FocusLogRow` — `allowOtherScreen`이 없으면 `allowDevices`로 채운다(예전 체크 = 둘 다). `loadRows`가 각 줄에 적용.
- [ ] **Step 2: 실행해 실패 확인**
- [ ] **Step 3: 구현** — `segmentsOf` 분할 조건에 `row.allowDevices !== current.allowDevices || row.allowOtherScreen !== current.allowOtherScreen`. 표(`FocusLogRecorder`)는 "학습기기" 칸을 두 칸으로.
- [ ] **Step 4: 통과 확인**, `npm run lint && npm run build` 통과(이 시점에 전체 build가 통과해야 한다).
- [ ] **Step 5: 커밋** — `feat: 판정 자동 기록에 다른 탭·앱 허용과 휴대폰·학습기기 허용을 따로 남김`

---

### Task 7: 문서

**Files:**
- Modify: `CLAUDE.md:59`(폴더 설명 "과목·학습기기 선택"), `:113`(용어 "학습기기 사용함"); `docs/판정-기준-근거.md` 7절(209·215행 안팎)·8절(7·8행 안팎의 "학습기기 사용함/사용 안 함"), 결정 요약 표의 휴대폰 행(38행)

- [ ] **Step 1: `CLAUDE.md:113`** — "학습기기 사용함" 항목을 두 항목으로:
  - "다른 탭·앱 사용함: 공부를 시작할 때 고르는 설정. 끄면(기본) 다른 탭이나 다른 앱으로 가는 즉시 `offscreen`이 된다. 켜면 다른 탭에 가 있어도 공부로 인정하되 얼굴 인식은 계속해 자리 이탈·졸음은 그대로 판정한다. 코드의 `allowOtherScreen`."
  - "휴대폰·학습기기 사용함: 끄면(기본) 휴대폰이 3초 넘게 보이면 `phone`이 된다. 켜면 휴대폰·패드 등이 보여도 공부로 인정한다(휴대폰 감지를 켜지 않음). 자리 이탈·졸음 판정은 그대로다. 코드의 `allowDevices`. 두 설정은 따로 켤 수 있다(#172)."
  - 59행 "과목·학습기기 선택" → "과목·허용 설정 선택".
- [ ] **Step 2: `docs/판정-기준-근거.md`** — 7절 제목 "학습기기 사용함이면" → "다른 탭·앱 사용함이면", 본문의 "학습기기 사용 안 함(기본)"→"다른 탭·앱 사용함이 아니면(기본)", "학습기기 사용함"→"다른 탭·앱 사용함". 7절 첫 줄 앞에 한 문단: 2026-10-21에 두 체크로 나눈 이유(스펙 1절 요약, #172). 8절의 "학습기기 사용함/사용 안 함"은 "휴대폰·학습기기 사용함/아님"으로. 38행 표도 같게.
- [ ] **Step 3: 커밋** — `docs: 학습기기 사용함 분리를 팀 안내서와 판정 근거 문서에 반영`

---

### 마무리 확인 (사용자, 브라우저)

`npm run dev` 후:
1. 자리에 앉아 공부 시작 창에 체크 두 개가 보이고 둘 다 꺼져 있다. ⓑ 아래에만 📱 안내가 보인다.
2. ⓐ만 켜고 시작 → 다른 탭에 가도 초록 유지. 그 상태에서 휴대폰을 카메라에 보이면 3초 뒤 빨강 "휴대폰 사용".
3. ⓑ만 켜고 시작 → 휴대폰을 보여도 초록. 다른 탭에 가면 바로 빨강 "다른 화면 사용 중".
4. 둘 다 켜고 시작 → 둘 다 초록 유지.
5. 과목 바꾸기로 체크 하나만 바꾸면 타이머가 0부터 다시 시작한다.
6. Supabase `study_logs.devices`에 표대로 값이 들어간다.
7. `/tracking`에 체크 두 개가 보이고, 판정 기록 표에 두 칸이 보인다. 새로고침해도 예전 줄이 남아 있고 오류가 없다.
