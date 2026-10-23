# 실험 설문 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진행자가 참가자 번호·시점을 넣고 열면 설문지 문서의 문항이 묶음별로 나오고, 다 답하면 응답이 CSV로 내려받아지는 `/survey.html`.

**Architecture:** `task-try.html`과 같은 별도 Vite 입구. 문항은 데이터 파일(`surveyItems.ts`), 판단·CSV·저장 구조는 순수 로직(`surveyLogic.ts`, Node로 검사), 화면은 `SurveyApp.tsx`. 브라우저 저장소(localStorage)에 응답·진행 상태를 누적하고 시점이 끝나면 CSV를 만든다.

**Tech Stack:** React 19, TypeScript, Vite(다중 입구). 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-10-23-survey-screen-design.md` (문항 원본: `docs/실험-설문지.md`)

## Global Constraints

- 로그인·Supabase·웹캠을 쓰지 않는다. 응답은 참가자 번호로만.
- 역문항은 원 응답 그대로 저장. CSV 열 `participant, phase, order, code, value, answered_at, ms_since_shown`, BOM 포함.
- 참가자 화면에 조건 이름(A/B/C)·점수를 띄우지 않는다.
- 주석 한국어, 기준값은 파일 위 상수, `npm run lint`·`npm run build` 통과 후 커밋.

## Review Focus

- 묶음 중간에 새로고침 → 같은 묶음부터 이어 가고 `ms_since_shown`은 다시 보인 시각부터. (Task 1·3)
- 같은 문항에 두 번 답함 → 마지막 값만 한 행. (Task 1)
- 끝난 시점을 다시 열어 다시 함 → 덧붙여지고 `answered_at`으로 구분. (Task 1·3)
- 조건 순서가 `ABC` 순열이 아님(`AAB`, `ab`) → 시작 못 함. (Task 1)
- B 조건에서 공존감·카메라 묶음 위 안내문, A에서 "공간", C에서 "열람실". (Task 2·3)

---

### Task 1: 순수 로직 `surveyLogic.ts`

**Files:** Create `src/experiment/survey/surveyLogic.ts`

**Interfaces (Produces):**
```ts
export type Phase = "pre" | "A" | "B" | "C" | "final";
export const PHASES: Phase[]; export const PHASE_LABEL: Record<Phase, string>;
export type Scale = { kind: "likert"; min: number; max: number; labels: Record<number, string> } | { kind: "choice"; options: string[] } | { kind: "text" };
export type Item = { code: string; text: string; scale: Scale; reverse?: boolean };
export type Group = { id: string; title: string; note?: string; noteByPhase?: Partial<Record<Phase, string>>; items: Item[] };
export type Answer = { participant: string; phase: Phase; order: string; code: string; value: string; answeredAt: string; msSinceShown: number };
export type Progress = { phase: Phase; groupIndex: number; shownAt: number; done: boolean };
export const PLACE_WORD: Record<Phase, string>;           // "{장소}" 치환어
export function isParticipant(s: string): boolean;        // /^P\d{2,3}$/
export function isOrder(s: string): boolean;              // ABC 순열
export function fillPlace(text: string, phase: Phase): string;
export function upsertAnswer(list: Answer[], a: Answer): Answer[];   // 같은 participant·phase·code·회차면 마지막 값만. 회차 구분은 sessionId 대신 "끝난 뒤 다시 시작" 시 기존 행을 건드리지 않는 규칙: 진행 중(done=false)인 행만 교체
export function toCsv(rows: Answer[]): string;
export function csvName(participant: string, phase: Phase | "all", at: Date): string;
// 저장소: 브라우저 API를 주입받아 Node에서도 검사 가능
export type Store = { get(k: string): string | null; set(k: string, v: string): void };
export function loadAnswers(store: Store, participant: string): Answer[];
export function saveAnswers(store: Store, participant: string, rows: Answer[]): boolean;
export function loadProgress(store: Store, participant: string, phase: Phase): Progress | null;
export function saveProgress(store: Store, participant: string, p: Progress): boolean;
```
회차 규칙(단순화): 응답 행에 `attempt: number`를 넣는다. 진행 상태에 `attempt`가 있고, 끝난 시점을 다시 시작하면 `attempt+1`. `upsertAnswer`는 같은 participant·phase·attempt·code를 교체. CSV에는 `attempt` 열을 **넣지 않고** `answered_at`으로 구분(문서 3절 열 고정). → `Answer`에 `attempt` 추가, `Progress`에 `attempt` 추가.

- [x] Node 시나리오 파일(scratchpad)에 검사 작성: isOrder("CBA") true / "AAB"·"ab"·"ABCD" false; isParticipant("P07") true / "7"·"p07" false; fillPlace("같은 {장소}", "A") → "같은 공간", "B" → "같은 열람실"; upsertAnswer 같은 code 두 번 → 1행, attempt 다르면 2행; toCsv 헤더·BOM 없음(BOM은 화면에서)·따옴표 처리; load/save 왕복; loadProgress 없으면 null.
- [x] 구현.
- [x] 검사 통과 확인.

### Task 2: 문항 데이터 `surveyItems.ts`

**Files:** Create `src/experiment/survey/surveyItems.ts`
**Consumes:** Task 1 타입. **Produces:** `export const GROUPS_BY_PHASE: Record<Phase, Group[]>`, 척도 상수 `LIKERT5/6/7`, `PAAS9`, `ASRS5`.

- [x] `docs/실험-설문지.md`의 코드·문항·척도를 그대로 옮긴다. pre: 1-1(7)·1-2(2)·1-3(ASRS 6, note에 저작권 고지)·K-SSAS(9). A/B/C: K-SSAS(9)·FLOW(3)·ARA(2)·PAAS(1)·CAM(2, B 안내)·NM(8, `{장소}`, B 안내, 5~8 reverse). final: INT_1_RANK(choice "A>B>C" 6순열)·SUSP_1(choice)·SUSP_2(text)·WITHDRAW(choice).
- [x] Node 검사: 시점별 문항 수 pre 24, A/B/C 25, final 4; 코드 중복 없음; NM_5~8 reverse; `{장소}`가 NM에만 있음.

### Task 3: 화면 `SurveyApp.tsx` + 입구 + vite 다중 입구

**Files:** Create `survey.html`, `src/experiment/survey/survey.tsx`, `src/experiment/survey/SurveyApp.tsx`; Modify `vite.config.ts`(input: index·survey·task-try).

- [x] 시작 화면: 참가자·시점·순서(주소 쿼리로 미리 채움), 검증 실패 시 시작 버튼 비활성 + 이유. 저장된 진행 상태에 따라 안내("3번째 묶음부터 이어 합니다" / "이미 끝났습니다. 다시 하면 덧붙여집니다"). 저장 응답 있으면 "전체 CSV 내려받기".
- [x] 문항 화면: 묶음 제목·안내문(noteByPhase[phase] 우선), 문항별 라디오/선택/텍스트. 답할 때마다 upsert+save. 모두 답하면 "다음". 마지막 묶음 뒤 progress.done=true.
- [x] 끝 화면: "저장되었습니다" + 그 시점 CSV 자동 내려받기(BOM) + 다시 내려받기 + 시작 화면으로.
- [x] `npm run lint`, `npm run build`, `npm run preview`로 `/survey.html` 열림 확인(빌드 결과에 포함).
- [ ] 브라우저 확인은 사용자에게: `/survey.html?participant=P01&phase=pre`, B 안내문, 새로고침 이어 가기, CSV 열.

### Task 4: 커밋

- [ ] 커밋 2개: `feat: 실험 설문 화면 순수 로직과 문항 데이터`, `feat: 실험 설문 화면과 CSV 내려받기 (survey.html, 다중 입구)`. 설계·계획 문서는 `docs:` 커밋. 설문지 문서(`docs/실험-설문지.md`)는 팀 검토 전이라 **커밋하지 않음**.

### Task 5 (추가, 2026-10-23 저녁): 실험 진행 화면 `/experiment.html`

**Files:** Create `experiment.html`, `src/experiment/session/{session.tsx, SessionApp.tsx, sessionLogic.ts, useNow.ts}`, `src/experiment/survey/{SurveyQuestions.tsx, surveyBrowser.ts}`(문항 화면·브라우저 도움을 떼어 냄); Modify `SurveyApp.tsx`, `vite.config.ts`.

- [x] `sessionLogic.ts`: `stepsOf`, `stepLabel`, `phaseOfStep`, `eventOfStep`, 사건 CSV, 세션·사건 저장소, `secondsLeft`. Node 검사(단계 14개·순서·잘못된 순서 거부·사건 이름·저장 왕복·CSV·남은 초) 통과.
- [x] `SessionApp.tsx`: 시작(이어 하기 안내) → 단계 전환 `advance(nowMs)` → 설문 단계는 `SurveyQuestions` 재사용 → 과제 자리(타이머) → 휴식(타이머) → 끝(전체 CSV·진행 기록 CSV).
- [x] `npm run lint`·`npm run build` 통과, dist에 experiment.html 포함.
- [ ] 브라우저 확인(사용자): 사전 설문 → 조건 1 안내 → 과제(과제 끝 버튼) → 설문 → 휴식 → … → 마무리 → 끝. 새로고침 이어 하기. CSV 3종.

### Task 6 (추가, 2026-10-23 밤): 과제 자리에 실제 과제

**Files:** Create `src/experiment/task/{taskLogic.ts, TaskItems.tsx, TaskPanel.tsx}`; Modify `src/spike/{taskTryLogic.ts, TaskTryApp.tsx}`(공유 로직·문항 화면을 가져다 씀), `src/experiment/session/{sessionLogic.ts, SessionApp.tsx}`.

- [x] `taskLogic.ts`: spike 로직 중 문제 생성·지문·채점 이동 + `AnswerRow`, `TaskRow`, `taskCsv`, `correctCount`. Node 검사(CSV 열·spike 재사용·맞힌 수) 통과.
- [x] `TaskItems.tsx`: `CalcTask`·`TypoTask`에 `skip` 추가. `TaskPanel.tsx`: 타이머(useNow)·푼 수·끝 화면·진행자용 일찍 끝내기.
- [x] `sessionLogic.ts`: `taskKind`·`taskSeconds`·`taskSeed`, 조건별 과제 기록 저장소, `taskCsvName`, `TASK_SECONDS_OPTIONS`. `SessionApp.tsx`: 시작 화면 과제 종류·시간, `TaskStep`(답마다 저장, 끝나면 CSV), 끝 화면 과제 전체 CSV.
- [x] `npm run lint`·`npm run build` 통과, Node 검사 3종 통과.
- [ ] 브라우저 확인(사용자·팀원): 2분 또는 5분 모드로 전체 흐름, 새로고침 이어 하기(과제 중·설문 중), CSV 4종(조건별 과제·시점별 설문·전체 과제·전체 설문·진행 기록).

### Task 7 (추가, 2026-10-23 밤 2): 지문 60개·세트 3개

- [x] `taskLogic.ts`: 지문 34개 추가(60개), `TYPO_SET_COUNT`·`TYPO_SETS`·`setFor`, `passageOrder(rand, setIndex?)`, `TaskRow.set`·CSV `set` 열. Node 검사(60개·오타 위치·세트 20×3 겹침 없음·돌리기·세트 안 섞기) 통과.
- [x] `TaskItems.tsx` `TypoTask setIndex`, `TaskPanel.tsx`·`SessionApp.tsx` 세트 전달·기록. lint·build 통과.

### Task 8 (추가, 2026-10-23 밤 3): 실험 방식(본 실험 / 과제 비교)

- [x] `sessionLogic.ts`: `SessionMode`·`MODE_LABEL`·`compareDefaultKinds`·`kindForPosition`, `SessionProgress.mode`·`kindsByPosition`. Node 검사 통과.
- [x] `SessionApp.tsx`: 시작 화면 방식 선택(비교면 과제 종류 숨김), `ReadyStep`(3번째 조건에서 과제 고르기, 고르기 전 시작 잠김), `TaskStep`이 조건 차례별 과제 사용. `surveyItems.ts` 마무리에 `FEEDBACK` 메모. lint·build 통과.
- [ ] 브라우저 확인(사용자): `?mode=compare`로 P01(계산→오탈자→고름), P02(오탈자→계산→고름).
