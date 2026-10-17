// 각본 시험 (트래킹 판정 정확도 기술 평가)의 순수 로직. 화면은 ScriptTestPanel.tsx
// 정답을 미리 정해 둔 행동을 하고, 그동안의 판정이 정답과 맞는지 채점합니다.
// 설계: docs/superpowers/specs/2026-10-15-script-test-design.md
// (2026-10-16 결정: 보정 필수, 행동 11~13 추가 — 숙인 채 눈 감기, 엎드리기, 학습기기 사용함 + 다른 탭에서 자리 비우기)
//
// 판정은 두 가지를 동시에 채점합니다.
// - plain(가이드라인 없이): 실제 공부 화면(StudyRunner)과 같은 방식. 기준 결과입니다.
// - guide(가이드라인 켬): 머리~가슴이 화면 밖인 것도 판정에 쓰면 정확도가 오르는지 보기 위한 비교입니다.
import { AWAY_SECONDS, DROWSY_SECONDS } from "./focusLogic";
import type { FocusStatus } from "./focusLogic";

export const FULL_REPEATS = 5; // 정식판에서 행동마다 반복하는 횟수
const GRACE_SECONDS = 5; // 노란불 마감 = 판정 기준 + 이 여유
const OFFSCREEN_DEADLINE_SECONDS = 3; // 다른 화면은 즉시 판정이라 탭·앱을 바꾸는 동작 시간만 줍니다
const MOVE_GRACE_SECONDS = 10; // 다른 탭을 열고 자리를 떠나야 하는 행동은 움직이는 시간을 더 줍니다

export type Behavior = {
  id: number;
  name: string;
  hint?: string; // 행동 중 할 일 (화면에 함께 보여 줌)
  seconds: number; // 행동 길이
  expect: FocusStatus; // "focus" = 초록 유지가 정답, 나머지 = 마감 안에 그 노란불이 떠야 정답
  deadlineSeconds?: number; // 노란불 행동의 마감 (행동 시작부터)
  allowDevices?: boolean; // 이 행동 동안 "학습기기 사용함"으로 판정
  cue?: { atSeconds: number; text: string }; // 행동 중간에 소리로 알릴 것 (예: 돌아와 앉기)
  writing?: boolean; // 필기 오판율에 들어가는 행동
};

const away = AWAY_SECONDS + GRACE_SECONDS;
const drowsy = DROWSY_SECONDS + GRACE_SECONDS;

// 행동 표는 여기 한 곳에만 있습니다. 행동을 추가할 때는 한 줄만 넣으면 됩니다.
export const BEHAVIORS: Behavior[] = [
  // 정답 = 초록 유지
  { id: 1, name: "정면 공부", hint: "화면을 읽거나 타자를 칩니다", seconds: 60, expect: "focus" },
  { id: 2, name: "숙여서 종이 읽기", seconds: 60, expect: "focus", writing: true },
  { id: 3, name: "숙여서 필기", seconds: 60, expect: "focus", writing: true },
  { id: 4, name: "턱 괴기·자세 바꾸기", seconds: 60, expect: "focus" },
  { id: 5, name: "잠깐 고개 돌리기·물 마시기", hint: "10초 정도 옆을 봅니다", seconds: 60, expect: "focus" },
  {
    id: 6, name: "잠깐 자리 비우기", hint: "카메라 밖으로 나갔다가 소리가 나면 돌아와 앉습니다",
    seconds: 60, expect: "focus", cue: { atSeconds: 30, text: "돌아와 앉으세요" },
  },
  // 정답 = 노란불
  { id: 7, name: "자리 비우기", hint: "카메라 밖으로 나갑니다 (누워 있기 포함)", seconds: 90, expect: "away", deadlineSeconds: away },
  { id: 8, name: "정면을 보고 눈 감기", seconds: 30, expect: "drowsy", deadlineSeconds: drowsy },
  { id: 9, name: "다른 탭 열기", hint: "같은 창에서 다른 탭으로 갑니다", seconds: 30, expect: "offscreen", deadlineSeconds: OFFSCREEN_DEADLINE_SECONDS },
  { id: 10, name: "다른 앱 누르기", hint: "다른 앱 창을 누릅니다", seconds: 30, expect: "offscreen", deadlineSeconds: OFFSCREEN_DEADLINE_SECONDS },
  { id: 11, name: "숙인 채 눈 감기", hint: "필기 자세로 숙여 눈을 감습니다", seconds: 30, expect: "drowsy", deadlineSeconds: drowsy },
  { id: 12, name: "엎드리기", hint: "책상에 엎드립니다. 키보드·마우스는 만지지 않습니다", seconds: 90, expect: "drowsy", deadlineSeconds: away },
  {
    id: 13, name: "학습기기 사용함 + 다른 탭에서 자리 비우기", hint: "다른 탭으로 간 뒤 카메라 밖으로 나갑니다",
    seconds: 90, expect: "away", deadlineSeconds: AWAY_SECONDS + MOVE_GRACE_SECONDS, allowDevices: true,
  },
];

export const behaviorOf = (id: number) => BEHAVIORS.find((b) => b.id === id)!;
export const expectedStudyMs = (b: Behavior) => (b.expect === "focus" ? b.seconds * 1000 : 0);

export type TestMode = "quick" | "full";

// 시험 순서 (행동 번호 목록). 빠른 점검판 = 표 순서대로 1번씩, 정식판 = 5번씩 섞어서.
export function makePlan(mode: TestMode, random: () => number = Math.random): number[] {
  const ids = BEHAVIORS.map((b) => b.id);
  if (mode === "quick") return ids;
  const plan = ids.flatMap((id) => Array<number>(FULL_REPEATS).fill(id));
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

// ---- 채점 ----

export type Judgement = { status: FocusStatus; studyMs: number }; // studyMs = 확정된 집중 시간
export type TrialSample = { elapsedMs: number; plain: Judgement; guide: Judgement };

export type VariantScore = {
  correct: boolean;
  firstYellow: FocusStatus | null; // 처음 나온 노란불 종류 (없으면 null)
  firstYellowMs: number | null; // 행동 시작부터 그 노란불까지 걸린 시간
  gainedMs: number; // 행동 동안 실제로 늘어난 집중 시간
};

export type TrialResult = { trial: number; behaviorId: number; plain: VariantScore; guide: VariantScore };

// 행동 하나 채점.
// - 초록 행동: 행동 동안 한 번이라도 focus가 아니면 오답.
// - 노란불 행동: 처음 나온 노란불이 기대한 종류이고 마감 안이면 정답. 다른 노란불이 먼저 나오거나 마감을 넘기면 오답.
// - 시간: 시작과 끝의 확정 집중 시간 차이.
export function scoreVariant(behavior: Behavior, samples: TrialSample[], variant: "plain" | "guide"): VariantScore {
  const first = samples[0]?.[variant];
  const last = samples[samples.length - 1]?.[variant];
  const yellow = samples.find((s) => s[variant].status !== "focus");
  const firstYellow = yellow ? yellow[variant].status : null;
  const firstYellowMs = yellow ? yellow.elapsedMs : null;
  const correct =
    samples.length > 0 &&
    (behavior.expect === "focus"
      ? firstYellow === null
      : firstYellow === behavior.expect && firstYellowMs! <= (behavior.deadlineSeconds ?? 0) * 1000);
  return { correct, firstYellow, firstYellowMs, gainedMs: first && last ? last.studyMs - first.studyMs : 0 };
}

export const scoreTrial = (trial: number, behavior: Behavior, samples: TrialSample[]): TrialResult => ({
  trial,
  behaviorId: behavior.id,
  plain: scoreVariant(behavior, samples, "plain"),
  guide: scoreVariant(behavior, samples, "guide"),
});

export type Summary = {
  trials: number;
  correct: number;
  accuracy: number; // 판정 정확도 (제안서 목표 80% 이상)
  writingTrials: number;
  writingWrong: number;
  writingWrongRate: number | null; // 필기 오판율: 숙여 읽기·필기 중 노란불이 뜬 비율 (목표 10% 이하)
  gainedMs: number;
  expectedMs: number;
  timeError: number | null; // 공부 시간 오차 = (들어간 합 − 들어가야 할 합) ÷ 들어가야 할 합 (목표 ±10%)
};

export function summarize(results: TrialResult[], variant: "plain" | "guide"): Summary {
  let correct = 0, writingTrials = 0, writingWrong = 0, gainedMs = 0, expectedMs = 0;
  for (const r of results) {
    const b = behaviorOf(r.behaviorId);
    const s = r[variant];
    if (s.correct) correct++;
    if (b.writing) {
      writingTrials++;
      if (s.firstYellow !== null) writingWrong++;
    }
    gainedMs += s.gainedMs;
    expectedMs += expectedStudyMs(b);
  }
  return {
    trials: results.length,
    correct,
    accuracy: results.length ? correct / results.length : 0,
    writingTrials,
    writingWrong,
    writingWrongRate: writingTrials ? writingWrong / writingTrials : null,
    gainedMs,
    expectedMs,
    timeError: expectedMs ? (gainedMs - expectedMs) / expectedMs : null,
  };
}

// 행동별 묶음 (정식판은 행동마다 5번이라 맞은 횟수/전체로 봅니다)
export type BehaviorRow = {
  behavior: Behavior;
  n: number;
  plainCorrect: number;
  guideCorrect: number;
  plainFirstYellow: (FocusStatus | null)[]; // 회차별 처음 나온 노란불 (원인 확인용)
  plainYellowMs: number | null; // 정답 회차에서 노란불까지 걸린 평균 시간
  guideYellowMs: number | null;
  plainGainedMs: number; // 평균
  guideGainedMs: number;
};

export function byBehavior(results: TrialResult[]): BehaviorRow[] {
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return BEHAVIORS.map((behavior) => {
    const rs = results.filter((r) => r.behaviorId === behavior.id);
    const yellowMs = (v: "plain" | "guide") =>
      avg(rs.filter((r) => r[v].correct && r[v].firstYellowMs !== null).map((r) => r[v].firstYellowMs!));
    return {
      behavior,
      n: rs.length,
      plainCorrect: rs.filter((r) => r.plain.correct).length,
      guideCorrect: rs.filter((r) => r.guide.correct).length,
      plainFirstYellow: rs.map((r) => r.plain.firstYellow),
      plainYellowMs: behavior.expect === "focus" ? null : yellowMs("plain"),
      guideYellowMs: behavior.expect === "focus" ? null : yellowMs("guide"),
      plainGainedMs: avg(rs.map((r) => r.plain.gainedMs)) ?? 0,
      guideGainedMs: avg(rs.map((r) => r.guide.gainedMs)) ?? 0,
    };
  }).filter((row) => row.n > 0);
}

// ---- CSV ----

// 0.1초마다 남기는 기록 한 줄. 영상은 남기지 않고 숫자만 남깁니다.
export type LogRow = {
  t: number; // 시험 시작 후 경과(ms)
  trial: number | null; // 행동 순번 (쉬는 중이면 null)
  behaviorId: number | null;
  elapsedMs: number | null; // 행동 시작 후 경과
  plain: Judgement;
  guide: Judgement;
  found: boolean; // 얼굴 인식
  ear: number | null; // 눈 크기
  pitch: number; // 고개 위아래(라디안)
  framed: boolean | null; // 머리~가슴이 화면 안 (모르면 null)
  body: boolean | null; // 몸(Pose) 있음 (모르면 null)
  hidden: boolean; // 다른 탭
  focused: boolean; // 창 선택
  allowDevices: boolean;
};

const cell = (v: number | boolean | string | null) => (v === null ? "" : typeof v === "boolean" ? (v ? 1 : 0) : v);

export function logCsv(rows: LogRow[]): string {
  const header = "t,trial,behavior,elapsed,status,studyMs,statusGuide,studyMsGuide,found,ear,pitch,framed,body,hidden,focused,allowDevices";
  const lines = rows.map((r) =>
    [
      r.t, r.trial, r.behaviorId, r.elapsedMs, r.plain.status, Math.round(r.plain.studyMs), r.guide.status,
      Math.round(r.guide.studyMs), r.found, r.ear === null ? null : r.ear.toFixed(4), r.pitch.toFixed(4),
      r.framed, r.body, r.hidden, r.focused, r.allowDevices,
    ].map(cell).join(",")
  );
  return [header, ...lines].join("\n");
}

export function resultsCsv(results: TrialResult[]): string {
  const header = "회차,행동,행동 이름,기대,정답(없이),노란불(없이),노란불까지ms(없이),들어간ms(없이),정답(가이드),노란불(가이드),노란불까지ms(가이드),들어간ms(가이드),들어가야 할ms";
  const lines = results.map((r) => {
    const b = behaviorOf(r.behaviorId);
    const v = (s: VariantScore) => [s.correct, s.firstYellow, s.firstYellowMs, Math.round(s.gainedMs)];
    return [r.trial, b.id, `"${b.name}"`, b.expect, ...v(r.plain), ...v(r.guide), expectedStudyMs(b)].map(cell).join(",");
  });
  return [header, ...lines].join("\n");
}
