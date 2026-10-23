// 각본 시험 (트래킹 판정 정확도 기술 평가)의 순수 로직. 화면은 ScriptTestPanel.tsx
// 정답을 미리 정해 둔 행동을 하고, 그동안의 판정이 정답과 맞는지 채점합니다.
// 설계: docs/superpowers/specs/2026-10-15-script-test-design.md
// (2026-10-16 결정: 보정 필수, 행동 11~13 추가 — 숙인 채 눈 감기, 엎드리기, 학습기기 사용함 + 다른 탭에서 자리 비우기)
// (2026-10-22: 측정 행동 14~17 추가 — 정답 없이 수치만 모아 연구 근거가 없는 기준값을 팀 측정으로 정함. docs/판정-기준-근거.md 10절)
//
// 판정은 두 가지를 동시에 채점합니다.
// - plain(가이드라인 없이): 실제 공부 화면(StudyRunner)과 같은 방식. 기준 결과입니다.
// - guide(가이드라인 켬): 머리~가슴이 화면 밖인 것도 판정에 쓰면 정확도가 오르는지 보기 위한 비교입니다.
import { AWAY_SECONDS, DROWSY_DOWN_SECONDS, DROWSY_SECONDS, EYE_GAP_SECONDS, RETURN_SECONDS } from "./focusLogic";
import type { FocusStatus } from "./focusLogic";
import type { Baseline } from "./calibration";

const GRACE_SECONDS = 5; // 빨간불 마감 = 판정 기준 + 이 여유
const OFFSCREEN_DEADLINE_SECONDS = 3; // 다른 화면은 즉시 판정이라 탭·앱을 바꾸는 동작 시간만 줍니다
const MOVE_GRACE_SECONDS = 10; // 다른 탭을 열고 자리를 떠나야 하는 행동은 움직이는 시간을 더 줍니다

export type Behavior = {
  id: number;
  name: string;
  hint?: string; // 행동 중 할 일 (화면에 함께 보여 줌)
  seconds: number; // 행동 길이
  expect: FocusStatus | "measure"; // "focus" = 초록 유지가 정답, 빨간불 = 마감 안에 그 빨간불이 떠야 정답, "measure" = 정답 없음(수치만 모음)
  deadlineSeconds?: number; // 빨간불 행동의 마감 (행동 시작부터)
  repeats?: number; // 정식판 반복 횟수 (없으면 1). 오판 위험이 있는 행동만 3회 — 반복 대신 사람 수(팀원 3명 + 팀 외 2명)로 봅니다 (2026-10-22)
  allowOtherScreen?: boolean; // 이 행동 동안 "다른 탭·앱 사용함"으로 판정 (13번)
  cue?: { atSeconds: number; text: string }; // 행동 중간에 소리로 알릴 것 (예: 돌아와 앉기)
  writing?: boolean; // 필기 오판율에 들어가는 행동
};

const away = AWAY_SECONDS + GRACE_SECONDS;
const drowsy = DROWSY_SECONDS + GRACE_SECONDS;
const drowsyDown = DROWSY_DOWN_SECONDS + GRACE_SECONDS; // 숙인 채 눈 감기는 기준이 60초라 행동도 길게

// 행동 표는 여기 한 곳에만 있습니다. 행동을 추가할 때는 한 줄만 넣으면 됩니다.
export const BEHAVIORS: Behavior[] = [
  // 정답 = 초록 유지
  { id: 1, name: "정면 공부", hint: "화면을 읽거나 타자를 칩니다", seconds: 60, expect: "focus" },
  { id: 2, name: "숙여서 종이 읽기", seconds: 60, expect: "focus", writing: true, repeats: 3 },
  { id: 3, name: "숙여서 필기", seconds: 60, expect: "focus", writing: true, repeats: 3 },
  { id: 4, name: "턱 괴기·자세 바꾸기", seconds: 60, expect: "focus", repeats: 3 },
  { id: 5, name: "잠깐 고개 돌리기·물 마시기", hint: "10초 정도 옆을 봅니다", seconds: 60, expect: "focus" },
  {
    id: 6, name: "잠깐 자리 비우기", hint: "카메라 밖으로 나갔다가 소리가 나면 돌아와 앉습니다",
    seconds: 60, expect: "focus", cue: { atSeconds: 30, text: "돌아와 앉으세요" },
  },
  // 정답 = 빨간불
  { id: 7, name: "자리 비우기", hint: "카메라 밖으로 나갑니다 (누워 있기 포함)", seconds: 90, expect: "away", deadlineSeconds: away },
  { id: 8, name: "정면을 보고 눈 감기", seconds: 30, expect: "drowsy", deadlineSeconds: drowsy, repeats: 3 },
  { id: 9, name: "다른 탭 열기", hint: "같은 창에서 다른 탭으로 갑니다", seconds: 30, expect: "offscreen", deadlineSeconds: OFFSCREEN_DEADLINE_SECONDS },
  { id: 10, name: "다른 앱 누르기", hint: "다른 앱 창을 누릅니다", seconds: 30, expect: "offscreen", deadlineSeconds: OFFSCREEN_DEADLINE_SECONDS },
  { id: 11, name: "숙인 채 눈 감기", hint: "필기 자세로 숙여 눈을 감습니다", seconds: 75, expect: "drowsy", deadlineSeconds: drowsyDown, repeats: 3 },
  { id: 12, name: "엎드리기", hint: "책상에 엎드립니다. 키보드·마우스는 만지지 않습니다", seconds: 90, expect: "drowsy", deadlineSeconds: away },
  {
    id: 13, name: "다른 탭·앱 사용함 + 다른 탭에서 자리 비우기", hint: "다른 탭으로 간 뒤 카메라 밖으로 나갑니다",
    seconds: 90, expect: "away", deadlineSeconds: AWAY_SECONDS + MOVE_GRACE_SECONDS, allowOtherScreen: true,
  },
  // 정답 없음 = 측정. 기준값을 정하는 값이라 정확도에는 넣지 않습니다 (판정-기준-근거 10절)
  {
    id: 14, name: "일상 동작", hint: "평소처럼 하나씩: 옆 책 보기 → 물 마시기 → 기지개 → 뒤돌아 물건 집기. 사이에는 공부합니다 (얼굴이 사라지는 최장 길이)",
    seconds: 90, expect: "measure", repeats: 2,
  },
  { id: 15, name: "눈 감고 쉬기", hint: "피곤할 때 쉬듯 하고 싶은 만큼 감았다 뜹니다. 그 뒤엔 공부합니다 (감은 최장 길이)", seconds: 60, expect: "measure", repeats: 2 },
  { id: 16, name: "휴대폰 없이 평소 책상", hint: "휴대폰을 치우고 평소 책상 그대로 공부합니다 (휴대폰 오인식 최장 길이)", seconds: 180, expect: "measure" },
  { id: 17, name: "휴대폰 확인 1회", hint: "알림을 확인하듯 휴대폰을 집어 보고 내려놓습니다. 평소처럼 (잡히는 길이)", seconds: 30, expect: "measure", repeats: 3 },
];

export const behaviorOf = (id: number) => BEHAVIORS.find((b) => b.id === id)!;
export const expectedStudyMs = (b: Behavior) => (b.expect === "focus" ? b.seconds * 1000 : 0);

export type TestMode = "quick" | "full";

// 시험 순서 (행동 번호 목록). 빠른 점검판 = 표 순서대로 1번씩, 정식판 = 행동마다 repeats번씩 섞어서.
export function makePlan(mode: TestMode, random: () => number = Math.random): number[] {
  const ids = BEHAVIORS.map((b) => b.id);
  if (mode === "quick") return ids;
  const plan = BEHAVIORS.flatMap((b) => Array<number>(b.repeats ?? 1).fill(b.id));
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

// ---- 채점 ----

export type Judgement = { status: FocusStatus; studyMs: number }; // studyMs = 확정된 집중 시간
// 측정값(found·closed·phone·pitch)은 2026-10-22부터 넣습니다. 모르면 null, 옛 기록이면 없음.
export type TrialSample = {
  elapsedMs: number;
  plain: Judgement;
  guide: Judgement;
  found?: boolean; // 얼굴 인식
  closed?: boolean | null; // 눈 감음 판정 (보정 전·얼굴 없음이면 null)
  phone?: boolean | null; // 휴대폰 잡힘 (감지 안 하면 null)
  pitch?: number; // 고개 위아래(라디안)
};

export type VariantScore = {
  correct: boolean;
  firstYellow: FocusStatus | null; // 처음 나온 빨간불 종류 (없으면 null)
  firstYellowMs: number | null; // 행동 시작부터 그 빨간불까지 걸린 시간
  gainedMs: number; // 행동 동안 실제로 늘어난 집중 시간
};

export type TrialResult = { trial: number; behaviorId: number; plain: VariantScore; guide: VariantScore; measure?: Measure | null }; // measure는 옛 저장 결과에 없음

// 행동 하나 채점.
// - 초록 행동: 행동 동안 한 번이라도 focus가 아니면 오답.
// - 빨간불 행동: 처음 나온 빨간불이 기대한 종류이고 마감 안이면 정답. 다른 빨간불이 먼저 나오거나 마감을 넘기면 오답.
// - 시간: 시작과 끝의 확정 집중 시간 차이.
export function scoreVariant(behavior: Behavior, samples: TrialSample[], variant: "plain" | "guide"): VariantScore {
  const first = samples[0]?.[variant];
  const last = samples[samples.length - 1]?.[variant];
  const yellow = samples.find((s) => s[variant].status !== "focus");
  const firstYellow = yellow ? yellow[variant].status : null;
  const firstYellowMs = yellow ? yellow.elapsedMs : null;
  const correct =
    samples.length > 0 &&
    (behavior.expect === "measure"
      ? true // 정답이 없는 측정 행동. 요약·행동별 표에는 들어가지 않습니다
      : behavior.expect === "focus"
        ? firstYellow === null
        : firstYellow === behavior.expect && firstYellowMs! <= (behavior.deadlineSeconds ?? 0) * 1000);
  return { correct, firstYellow, firstYellowMs, gainedMs: first && last ? last.studyMs - first.studyMs : 0 };
}

export const scoreTrial = (trial: number, behavior: Behavior, samples: TrialSample[]): TrialResult => ({
  trial,
  behaviorId: behavior.id,
  plain: scoreVariant(behavior, samples, "plain"),
  guide: scoreVariant(behavior, samples, "guide"),
  measure: measureOf(samples), // 모든 행동에서 계산합니다 (기존 행동의 끊김·고개 움직임도 봄)
});

// ---- 측정 (정답 없이 수치만) ----
// 연구 근거가 없는 기준값(자리 이탈 60초, 엎드림 60초, 휴대폰 3초, 끊김 내성 2초)을 팀 측정으로 정하기 위한 집계입니다.
export const MEASURE_WINDOW_SECONDS = 10; // 고개 변동 폭을 재는 창. 온라인 학습 연구(Li & Liu 2024)가 10초 창을 썼습니다
export const MEASURE_IDS = [3, 7, 8, 11, 12, 14, 15, 16, 17]; // 측정표에 보여 줄 행동: 끊김·고개 움직임을 볼 기존 행동 + 측정 행동

export type Measure = {
  longestMissingMs: number; // 얼굴 안 보임 최장 연속 (자리 이탈 기준과 비교)
  longestClosedMs: number | null; // 눈 감음 최장 연속 (졸음 기준과 비교). 감음 기록이 없으면 null
  longestPhoneMs: number | null; // 휴대폰 잡힘 최장 연속 (휴대폰 기준과 비교). 감지를 안 했으면 null
  shortFoundMaxMs: number; // 안 보임 사이에 잠깐(RETURN_SECONDS 이하) 보인 구간의 최장 — 인식 끊김
  shortFoundCount: number;
  shortOpenMaxMs: number | null; // 감음 사이에 잠깐(EYE_GAP_SECONDS 이하) 뜬 구간의 최장 — 인식 끊김
  shortOpenCount: number | null;
  pitchRangeDeg: number | null; // 10초 창 안 고개 각도(최대−최소)의 최대, 도. 얼굴이 보인 표본만. 숙여 필기 vs 엎드림 비교용
};

type Run = { value: boolean; ms: number };

// 같은 값이 이어진 구간 목록. 구간 길이는 다음 구간이 시작할 때까지, 마지막은 표본 간격 하나를 더합니다.
// null(모름)은 구간을 끊고 어느 쪽에도 들어가지 않습니다.
function runsOf(samples: TrialSample[], pick: (s: TrialSample) => boolean | null | undefined): Run[] {
  const runs: Run[] = [];
  const step = samples.length > 1 ? samples[1].elapsedMs - samples[0].elapsedMs : 0;
  let current: { value: boolean; startMs: number } | null = null;
  const close = (endMs: number) => {
    if (current) runs.push({ value: current.value, ms: endMs - current.startMs });
    current = null;
  };
  for (const s of samples) {
    const v = pick(s) ?? null;
    if (current && (v === null || v !== current.value)) close(s.elapsedMs);
    if (v !== null && !current) current = { value: v, startMs: s.elapsedMs };
  }
  if (samples.length > 0) close(samples[samples.length - 1].elapsedMs + step);
  return runs;
}

const longest = (runs: Run[], value: boolean) => runs.filter((r) => r.value === value).reduce((max, r) => Math.max(max, r.ms), 0);

// 앞뒤가 모두 반대 값인 짧은(maxMs 이하) 구간 — 인식이 잠깐 틀리게 읽은 것
function shortRuns(runs: Run[], value: boolean, maxMs: number): Run[] {
  return runs.filter((r, i) => r.value === value && r.ms <= maxMs && i > 0 && i < runs.length - 1);
}

export function measureOf(samples: TrialSample[]): Measure {
  const found = runsOf(samples, (s) => s.found);
  const closed = runsOf(samples, (s) => s.closed);
  const phone = runsOf(samples, (s) => s.phone);
  const shortFound = shortRuns(found, true, RETURN_SECONDS * 1000);
  const shortOpen = shortRuns(closed, false, EYE_GAP_SECONDS * 1000);

  // 고개 변동 폭: 얼굴이 보인 표본만, 10초 창을 밀며 (최대−최소)의 최대
  const facing = samples.filter((s) => s.found === true && s.pitch !== undefined);
  let range: number | null = null;
  const windowMs = MEASURE_WINDOW_SECONDS * 1000;
  for (let i = 0, j = 0; i < facing.length; i++) {
    let min = facing[i].pitch!, max = min;
    for (j = Math.max(j, i); j < facing.length && facing[j].elapsedMs - facing[i].elapsedMs < windowMs; j++) {
      min = Math.min(min, facing[j].pitch!);
      max = Math.max(max, facing[j].pitch!);
    }
    range = Math.max(range ?? 0, max - min);
  }

  return {
    longestMissingMs: longest(found, false),
    longestClosedMs: closed.length ? longest(closed, true) : null,
    longestPhoneMs: phone.length ? longest(phone, true) : null,
    shortFoundMaxMs: shortFound.reduce((max, r) => Math.max(max, r.ms), 0),
    shortFoundCount: shortFound.length,
    shortOpenMaxMs: closed.length ? shortOpen.reduce((max, r) => Math.max(max, r.ms), 0) : null,
    shortOpenCount: closed.length ? shortOpen.length : null,
    pitchRangeDeg: range === null ? null : (range * 180) / Math.PI,
  };
}

// 측정표 한 줄: 행동별로 최장은 최대, 횟수는 합, 고개 변동 폭은 평균
export type MeasureRow = {
  behavior: Behavior;
  n: number;
  longestMissingMs: number;
  longestClosedMs: number | null;
  longestPhoneMs: number | null;
  shortFoundMaxMs: number;
  shortFoundCount: number;
  shortOpenMaxMs: number | null;
  shortOpenCount: number | null;
  pitchRangeDeg: number | null;
};

export function measureRows(results: TrialResult[]): MeasureRow[] {
  const maxOf = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const sumOf = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const avgOf = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return MEASURE_IDS.map((id) => {
    const ms = results.filter((r) => r.behaviorId === id && r.measure).map((r) => r.measure!);
    return {
      behavior: behaviorOf(id),
      n: ms.length,
      longestMissingMs: maxOf(ms.map((m) => m.longestMissingMs)) ?? 0,
      longestClosedMs: maxOf(ms.map((m) => m.longestClosedMs)),
      longestPhoneMs: maxOf(ms.map((m) => m.longestPhoneMs)),
      shortFoundMaxMs: maxOf(ms.map((m) => m.shortFoundMaxMs)) ?? 0,
      shortFoundCount: sumOf(ms.map((m) => m.shortFoundCount)) ?? 0,
      shortOpenMaxMs: maxOf(ms.map((m) => m.shortOpenMaxMs)),
      shortOpenCount: sumOf(ms.map((m) => m.shortOpenCount)),
      pitchRangeDeg: avgOf(ms.map((m) => m.pitchRangeDeg)),
    };
  }).filter((row) => row.n > 0);
}

export type Summary = {
  trials: number;
  correct: number;
  accuracy: number; // 판정 정확도 (제안서 목표 80% 이상)
  writingTrials: number;
  writingWrong: number;
  writingWrongRate: number | null; // 필기 오판율: 숙여 읽기·필기 중 빨간불이 뜬 비율 (목표 10% 이하)
  gainedMs: number;
  expectedMs: number;
  timeError: number | null; // 공부 시간 오차 = (들어간 합 − 들어가야 할 합) ÷ 들어가야 할 합 (목표 ±10%)
};

export function summarize(allResults: TrialResult[], variant: "plain" | "guide"): Summary {
  const results = allResults.filter((r) => behaviorOf(r.behaviorId).expect !== "measure"); // 측정 행동은 정확도에 넣지 않음
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
  plainFirstYellow: (FocusStatus | null)[]; // 회차별 처음 나온 빨간불 (원인 확인용)
  plainYellowMs: number | null; // 정답 회차에서 빨간불까지 걸린 평균 시간
  guideYellowMs: number | null;
  plainGainedMs: number; // 평균
  guideGainedMs: number;
};

export function byBehavior(results: TrialResult[]): BehaviorRow[] {
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return BEHAVIORS.filter((b) => b.expect !== "measure").map((behavior) => {
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
  closed: boolean | null; // 눈 감음 판정 (보정 전·얼굴 없음이면 null)
  phone: boolean | null; // 휴대폰 잡힘 (감지 안 하면 null)
  framed: boolean | null; // 머리~가슴이 화면 안 (모르면 null)
  body: boolean | null; // 몸(Pose) 있음 (모르면 null)
  hidden: boolean; // 다른 탭
  focused: boolean; // 창 선택
  allowOtherScreen: boolean; // 다른 탭·앱 사용함으로 판정 중
  allowDevices: boolean; // 휴대폰·학습기기 사용함으로 판정 중
  baseline: Baseline | null; // 보정값. 눈 판정 임계값을 나중에 계산하려면 필요 (10-17 시험 때 없어서 못 함)
};

const cell = (v: number | boolean | string | null) => (v === null ? "" : typeof v === "boolean" ? (v ? 1 : 0) : v);

export function logCsv(rows: LogRow[]): string {
  const header =
    "t,trial,behavior,elapsed,status,studyMs,statusGuide,studyMsGuide,found,ear,pitch,closed,phone,framed,body,hidden,focused,allowOtherScreen,allowDevices," +
    "frontEar,downEar,closedEar,frontPitch,downPitch";
  const lines = rows.map((r) =>
    [
      r.t, r.trial, r.behaviorId, r.elapsedMs, r.plain.status, Math.round(r.plain.studyMs), r.guide.status,
      Math.round(r.guide.studyMs), r.found, r.ear === null ? null : r.ear.toFixed(4), r.pitch.toFixed(4),
      r.closed, r.phone, r.framed, r.body, r.hidden, r.focused, r.allowOtherScreen, r.allowDevices,
      ...(r.baseline
        ? [r.baseline.frontEar, r.baseline.downEar, r.baseline.closedEar, r.baseline.frontPitch, r.baseline.downPitch].map((v) => v.toFixed(4))
        : [null, null, null, null, null]),
    ].map(cell).join(",")
  );
  return [header, ...lines].join("\n");
}

export function resultsCsv(results: TrialResult[]): string {
  const header =
    "회차,행동,행동 이름,기대,정답(없이),빨간불(없이),빨간불까지ms(없이),들어간ms(없이),정답(가이드),빨간불(가이드),빨간불까지ms(가이드),들어간ms(가이드),들어가야 할ms," +
    "안 보임 최장ms,감음 최장ms,휴대폰 최장ms,끊김(보임)최장ms,끊김(보임)횟수,끊김(뜸)최장ms,끊김(뜸)횟수,고개 변동 폭°";
  const lines = results.map((r) => {
    const b = behaviorOf(r.behaviorId);
    const v = (s: VariantScore) => [s.correct, s.firstYellow, s.firstYellowMs, Math.round(s.gainedMs)];
    const m = r.measure;
    const measure = m
      ? [m.longestMissingMs, m.longestClosedMs, m.longestPhoneMs, m.shortFoundMaxMs, m.shortFoundCount, m.shortOpenMaxMs, m.shortOpenCount,
         m.pitchRangeDeg === null ? null : m.pitchRangeDeg.toFixed(1)]
      : Array<null>(8).fill(null);
    return [r.trial, b.id, `"${b.name}"`, b.expect, ...v(r.plain), ...v(r.guide), expectedStudyMs(b), ...measure].map(cell).join(",");
  });
  return [header, ...lines].join("\n");
}
