// 집중 상태 판정 + 집중 시간 기록 (화면·React와 무관한 순수 로직)
// 얼굴 인식 결과를 매번 넣어 주면, 얼굴이 안 보인 시간·눈 감은 시간을 재서 상태를 돌려줍니다.
//
// 기준값의 근거는 docs/판정-기준-근거.md 에 있습니다. 원칙: 확실한 경우만 잡고, 애매하면 공부로 인정합니다.
//
// 집중 시간: 얼굴이 보이고 눈을 뜬 동안만 쌓입니다.
// 잠깐 안 보이거나 눈을 감은 시간은 "보류"해 두었다가, 기준 시간 안에 돌아오면 더해 주고
// 이탈·졸음으로 바뀌면 버립니다. (잠깐 고개 돌린 시간은 인정, 자리 비운 시간은 빼기 위해)
// 화면에는 확정 시간 + 보류 시간(shownStudyMs)을 보여 줘서 타이머가 멈췄다 튀지 않게 합니다.
//
// 졸음: 공부 시작 때 보정(정면·필기 자세·눈 감기)을 했을 때만, 눈 크기(EAR)가 그 자세의 뜬 눈과 감은 눈의 중간보다
// 작은 채로 DROWSY_SECONDS 넘게 이어지면 졸음입니다. 정면이든 숙였든 같습니다. 보정을 안 했으면 눈은 보지 않습니다.
// 얼굴이 안 보여도 몸(Pose)이 자리에 있으면 자리 이탈이 아니라 엎드림으로 보고, AWAY_SECONDS 넘게 이어지면 졸음입니다.
// 그동안 키보드·마우스 입력이 있으면 깨어 있는 것이므로 처음부터 다시 셉니다.
//
// 짧은 끊김 내성 (각본 시험 2026-10-17, 3명): 인식은 1초 안팎으로 틀리게 읽는 일이 있습니다.
// - 안 보이다 다시 잡힌 얼굴은 RETURN_SECONDS 이상 계속 보여야 돌아온 것으로 봅니다. 그 전까지는 안 보이는 중으로 계속 셉니다.
//   (자리를 비운 동안 약 1초 얼굴이 잘못 잡혀 이탈 시간이 0으로 돌아가고 보류 시간이 전부 공부로 들어간 사례)
// - 눈을 감은 중에 뜬 것으로 읽히거나 얼굴이 끊겨도 EYE_GAP_SECONDS 안이면 계속 감은 것으로 봅니다.
//   (눈 감은 13초가 1초 '뜸' 판독에 0으로 돌아가 21초에 끝내 닿지 못한 사례)
//
// 다른 화면(다른 탭·다른 앱) 사용: 시작할 때 "학습기기 사용함"을 고른 경우에만 공부로 인정합니다.
// - 사용 안 함(기본): 다른 탭으로 가거나 다른 앱을 누르면 바로 "다른 화면 사용"이 되고 시간이 멈춥니다.
// - 사용함: 다른 앱·다른 탭에 있어도 평소처럼 얼굴로 판정합니다.
//   (다른 탭이면 useTracking이 1초마다 인식을 계속하므로 자리 이탈·졸음을 그대로 봅니다)
//
// 인식 결과가 STALE_SECONDS 넘게 갱신되지 않으면(인식 오류·카메라 멈춤 등) 마지막 값을 믿지 않고
// 얼굴·몸 모두 안 보임으로 봅니다. 멈추기 직전 "얼굴 보임"이 남아 시간이 계속 쌓이는 것을 막기 위해서입니다.
//
// 카메라 가이드라인: 얼굴이 보일 때만, 머리~가슴(코·양 어깨)이 화면 밖으로 나간 시간을 잽니다.
// 기준 시간 안에 돌아오면 그동안은 보류했다가 인정하고, 넘기면 "가이드라인 이탈"이 되어 시간이 멈춥니다.
// 학습기기 사용 여부와 상관없이 적용합니다. (Pose 결과가 없으면 무시)
//
// 휴대폰: "학습기기 사용 안 함"일 때만, 휴대폰이 화면에 PHONE_SECONDS 넘게 연속으로 잡히면 "휴대폰 사용"이 되고 시간이 멈춥니다.
// 한 번 잡혔다고 바로 멈추지 않는 것은 비슷한 물건을 순간적으로 휴대폰으로 착각하는 경우를 거르기 위해서입니다.
// 화면 밖(책상 아래 등)에서 쓰는 휴대폰은 잡지 못합니다. (docs/판정-기준-근거.md 8절)

import type { Baseline } from "./calibration";

// 기준값 (근거: docs/판정-기준-근거.md)
export const AWAY_SECONDS = 60; // 얼굴이 이 시간 이상 안 보이면 자리 이탈 의심 (Dell 자리 비움 잠금 60초)
export const DROWSY_SECONDS = 21; // 눈을 이 시간 이상 계속 감으면 졸음 의심 (OSLER 검사의 잠든 판정 21초)
export const OUTFRAME_SECONDS = 10; // 머리~가슴이 이 시간 이상 화면 밖이면 가이드라인 이탈 (카메라 팝업 기준 GUIDE_ALERT_SECONDS와 같게)
// 짧은 끊김 내성. 각본 시험(2026-10-17)에서 잘못 읽힌 구간은 0.9~1.0초였고, 그 두 배로 잡았습니다. (임시값, 정식판 뒤 조정)
export const RETURN_SECONDS = 2; // 안 보이다 다시 잡힌 얼굴이 이 시간 이상 계속 보여야 돌아온 것
export const EYE_GAP_SECONDS = 2; // 눈 감은 중 '뜸'·얼굴 끊김이 이 시간 안이면 계속 감은 것
// 인식 결과가 이 시간 넘게 갱신되지 않으면 안 보임으로 봅니다. 숨긴 탭의 인식 주기(1초)를 세 번 놓친 정도입니다.
export const STALE_SECONDS = 3;
const MAX_STEP_MS = 1000; // 한 번에 더하는 시간의 최대값 (컴퓨터가 잠들었다 깨도 시간이 튀지 않게)

// 휴대폰이 이 시간 이상 연속으로 잡히면 휴대폰 사용. 휴대폰이 없을 때 잘못 잡힌 것은 가장 길어도 1초였습니다(측정 2026-10-16, 1명).
export const PHONE_SECONDS = 3;

export type FocusStatus = "focus" | "away" | "drowsy" | "offscreen" | "outframe" | "phone";

export type FocusInput = {
  found: boolean; // 얼굴이 잡혔는지
  ear?: number | null; // 눈 크기(EAR). 보정이 있을 때만 눈 감음 판정에 씀
  pitch?: number; // 고개 위아래 각도(라디안, 숙이면 +). 생략하면 정면으로 봅니다.
  framed?: boolean | null; // 머리~가슴이 화면 안인지 (null·생략 = 확인 못 함 → 무시)
  bodyFound?: boolean | null; // 몸(Pose)이 자리에 있는지 (null·생략 = 모름 → 몸 없음과 같이 처리)
  phone?: boolean | null; // 휴대폰이 화면에 잡혔는지 (null·생략 = 확인 못 함 → 무시)
  baseline?: Baseline | null; // 보정으로 잰 개인 기준 (없으면 눈 판정 안 함)
  updatedAt?: number | null; // 인식 결과의 시각(ms). 오래되면 안 보임으로 처리 (null·생략 = 확인 안 함)
};

export type ScreenInput = {
  pageHidden: boolean; // 다른 탭으로 가서 이 페이지가 안 보임 (얼굴 인식은 1초마다 계속)
  windowFocused: boolean; // 이 브라우저 창이 선택돼 있음 (다른 앱을 누르면 false)
  allowDevices: boolean; // "학습기기 사용함"을 골랐는지
  lastInputMs?: number | null; // 마지막 키보드·마우스 입력 시각 (엎드림 판정에서 깨어 있음의 근거)
};

export type FocusState = {
  status: FocusStatus;
  awaySeconds: number; // 얼굴이 연속으로 안 보인 시간
  closedSeconds: number; // 눈을 연속으로 감은 시간
  outframeSeconds: number; // 머리~가슴이 연속으로 화면 밖에 있던 시간
  studyMs: number; // 확정된 집중 시간
  pendingMs: number; // 보류 중인 시간 (돌아오면 더하고, 이탈·졸음이면 버림)
  // 내부 기록: 언제부터 안 보였는지 / 감았는지 / 마지막 계산 시각 (ms, 없으면 null)
  missingSince: number | null;
  closedSince: number | null;
  outframeSince: number | null;
  foundSince: number | null; // 얼굴이 연속으로 보이기 시작한 시각 (돌아옴 확인용)
  eyeGapSince: number | null; // 눈 감은 중 '뜸'·얼굴 끊김이 시작된 시각 (EYE_GAP_SECONDS 안이면 감은 기록 유지)
  lastMs: number | null;
  bodyWhileMissing: boolean; // 얼굴이 안 보이는 동안 몸은 자리에 있었는지 (엎드림)
  phoneSince: number | null; // 휴대폰이 연속으로 잡히기 시작한 시각
  phoneSeconds: number; // 휴대폰이 연속으로 잡힌 시간
};

export const initialFocusState: FocusState = {
  status: "focus",
  awaySeconds: 0,
  closedSeconds: 0,
  outframeSeconds: 0,
  studyMs: 0,
  pendingMs: 0,
  missingSince: null,
  closedSince: null,
  outframeSince: null,
  foundSince: null,
  eyeGapSince: null,
  lastMs: null,
  bodyWhileMissing: false,
  phoneSince: null,
  phoneSeconds: 0,
};

// 화면에 보여 줄 집중 시간: 확정 시간 + 보류 시간. 기준을 넘겨 보류가 버려지면 그만큼 줄어듭니다.
// 저장은 확정 시간(studyMs)만 합니다.
export const shownStudyMs = (state: FocusState) => state.studyMs + state.pendingMs;

// 보류 중인 이유. 내 화면의 노란 표시와 다른 참여자에게 보내는 노란불(hold)에 씁니다. status 자체는 focus 입니다.
export function holdReason(state: FocusState): "face" | "eyes" | "frame" | "phone" | null {
  if (state.status !== "focus") return null;
  // 몸이 자리에 있으면 숙여 필기하며 얼굴이 띄엄띄엄 끊기는 경우가 많아 노란 표시를 하지 않습니다. (#119)
  if (state.awaySeconds > 0) return state.bodyWhileMissing ? null : "face";
  if (state.closedSeconds > 0 && state.eyeGapSince === null) return "eyes"; // 잠깐 뜬 틈에는 표시하지 않음
  if (state.outframeSeconds > 0) return "frame";
  if (state.phoneSeconds > 0) return "phone";
  return null;
}

// 보류 중일 때 내 화면에 보여 줄 노란 표시. 시간은 계속 올라갑니다. (기준을 넘기면 빨간 표시로 바뀜)
export const HOLD_LABEL = {
  face: "🟡 얼굴을 찾는 중",
  eyes: "🟡 눈 감음 확인 중",
  frame: "🟡 자세 확인 중",
  phone: "🟡 휴대폰 확인 중",
};

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

export function nextFocusState(
  prev: FocusState,
  given: FocusInput,
  nowMs: number,
  screen: ScreenInput = { pageHidden: false, windowFocused: true, allowDevices: false }
): FocusState {
  // 인식이 멈춰 값이 오래됐으면 얼굴·몸 모두 안 보임으로 보고, 휴대폰 값도 믿지 않습니다. (몸 null = 모름 → 자리 이탈 쪽)
  const stale = given.updatedAt != null && nowMs - given.updatedAt > STALE_SECONDS * 1000;
  const input: FocusInput = stale ? { ...given, found: false, bodyFound: null, phone: null } : given;

  // 휴대폰: 학습기기 사용 안 함일 때만 연속으로 잡힌 시간을 잽니다. 한 번이라도 안 잡히면 0부터 다시.
  const phoneSince = !screen.allowDevices && input.phone === true ? prev.phoneSince ?? nowMs : null;
  const phoneSeconds = phoneSince === null ? 0 : (nowMs - phoneSince) / 1000;
  const offScreenStop = (screen.pageHidden || !screen.windowFocused) && !screen.allowDevices;

  // 다른 화면 다음으로 우선합니다. 휴대폰을 보느라 얼굴이 안 보여도 자리 이탈보다 휴대폰이 맞는 설명이라서입니다.
  if (!offScreenStop && phoneSeconds >= PHONE_SECONDS) {
    return {
      status: "phone",
      awaySeconds: 0,
      closedSeconds: 0,
      outframeSeconds: 0,
      studyMs: prev.studyMs,
      pendingMs: 0, // 다른 노란불처럼 보류해 둔 시간은 버립니다.
      missingSince: null,
      closedSince: null,
      outframeSince: null,
      foundSince: null,
      eyeGapSince: null,
      lastMs: nowMs,
      bodyWhileMissing: false,
      phoneSince,
      phoneSeconds,
    };
  }
  // 휴대폰이 잡히는 동안은 다른 보류처럼 시간을 보류합니다. 기준 전에 치우면 인정, 넘기면 버림.
  return { ...judgeFace(prev, input, nowMs, screen, phoneSince !== null), phoneSince, phoneSeconds };
}

// 다른 화면·얼굴·눈·가이드라인으로 판정합니다. (휴대폰은 위 nextFocusState에서 먼저 봄)
function judgeFace(
  prev: FocusState,
  input: FocusInput,
  nowMs: number,
  screen: ScreenInput,
  holdPhone = false // 휴대폰이 잡히는 중이라 시간을 보류할지
): Omit<FocusState, "phoneSince" | "phoneSeconds"> {
  const elapsed = prev.lastMs === null ? 0 : Math.max(nowMs - prev.lastMs, 0);
  const step = Math.min(elapsed, MAX_STEP_MS);

  // 다른 화면 사용: 학습기기 사용 안 함이면 얼굴 기록은 지우고 바로 멈춥니다.
  // 사용함이면 다른 탭·다른 앱이어도 아래에서 평소처럼 얼굴로 판정합니다.
  const offScreen = screen.pageHidden || !screen.windowFocused;
  if (offScreen && !screen.allowDevices) {
    return {
      status: "offscreen",
      awaySeconds: 0,
      closedSeconds: 0,
      outframeSeconds: 0,
      studyMs: prev.studyMs,
      pendingMs: 0,
      missingSince: null,
      closedSince: null,
      outframeSince: null,
      foundSince: null,
      eyeGapSince: null,
      lastMs: nowMs,
      bodyWhileMissing: false,
    };
  }

  // 안 보이다 다시 잡힌 얼굴은 RETURN_SECONDS 이상 계속 보여야 돌아온 것입니다. 그 전에는 아래 "안 보임"으로 계속 셉니다.
  const foundSince = input.found ? prev.foundSince ?? nowMs : null;
  const back =
    input.found && (prev.missingSince === null || (foundSince !== null && (nowMs - foundSince) / 1000 >= RETURN_SECONDS));

  // 눈: 보정 기준으로 감았는지 봅니다. (보정이 없으면 감지 않은 것으로 봄) 얼굴이 안 보이면 읽을 수 없음(null).
  const wasClosed = prev.closedSince !== null;
  const closedNow = input.found ? eyeClosed(input, wasClosed) : null;
  const eyes = nextEyes(prev, closedNow, nowMs);
  const closedSeconds = eyes.closedSince === null ? 0 : (nowMs - eyes.closedSince) / 1000;

  // 얼굴이 안 보이면 안 보인 시간을 잽니다. 몸이 자리에 있으면 엎드림(→ 졸음), 없으면 자리 이탈입니다.
  if (!back) {
    // 돌아옴을 확인하는 동안(얼굴은 보임)은 안 보이던 때의 몸 판정을 이어 써서 이탈·졸음 표시가 흔들리지 않게 합니다.
    const body = input.found ? prev.bodyWhileMissing : input.bodyFound === true;
    let missingSince = prev.missingSince ?? nowMs;
    const lastInput = screen.lastInputMs ?? null;
    // 입력이 있어 깨어 있음이 확인되면 처음부터 다시 세고, 그동안 보류해 둔 시간도 확정합니다.
    const typed = body && lastInput !== null && lastInput > missingSince;
    if (typed) missingSince = Math.min(lastInput, nowMs);
    const awaySeconds = (nowMs - missingSince) / 1000;
    const status: FocusStatus = awaySeconds >= AWAY_SECONDS ? (body ? "drowsy" : "away") : "focus";
    return {
      status,
      awaySeconds,
      closedSeconds,
      outframeSeconds: 0,
      studyMs: typed ? prev.studyMs + prev.pendingMs + step : prev.studyMs,
      pendingMs: typed ? 0 : status === "focus" ? prev.pendingMs + step : 0,
      missingSince,
      closedSince: eyes.closedSince,
      outframeSince: null,
      foundSince,
      eyeGapSince: eyes.eyeGapSince,
      lastMs: nowMs,
      bodyWhileMissing: body,
    };
  }

  // 머리~가슴이 화면 밖이면 시간을 잽니다. 한 번이라도 들어오거나 확인할 수 없으면(null) 0부터 다시.
  const out = input.framed === false;
  const outframeSince = out ? prev.outframeSince ?? nowMs : null;
  const outframeSeconds = outframeSince === null ? 0 : (nowMs - outframeSince) / 1000;

  // 졸음은 지금도 감은 것으로 읽힐 때만 보여 줍니다(잠깐 뜬 틈에는 아님). 가이드라인 이탈과 겹치면 졸음이 우선입니다. (졸음은 아이콘이 따로 있음)
  const status: FocusStatus =
    closedNow === true && closedSeconds >= DROWSY_SECONDS
      ? "drowsy"
      : outframeSeconds >= OUTFRAME_SECONDS
        ? "outframe"
        : "focus";

  // 눈을 뜨고 화면 안이면 보류 시간까지 확정하고, 감았거나(잠깐 뜬 틈 포함) 벗어났으면 보류에 쌓습니다.
  let studyMs = prev.studyMs;
  let pendingMs = prev.pendingMs;
  if (status !== "focus") {
    pendingMs = 0;
  } else if (eyes.closedSince !== null || out || holdPhone) {
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
    closedSince: eyes.closedSince,
    outframeSince,
    foundSince,
    eyeGapSince: eyes.eyeGapSince,
    lastMs: nowMs,
    bodyWhileMissing: false,
  };
}

// 눈 감은 기록 갱신. closedNow: 지금 감은 것으로 읽힘(true) / 뜸(false) / 얼굴이 없어 못 읽음(null).
// 감은 중에 뜸·못 읽음이 EYE_GAP_SECONDS 안이면 감은 기록(closedSince)을 유지하고, 넘기면 지웁니다.
function nextEyes(
  prev: FocusState,
  closedNow: boolean | null,
  nowMs: number
): { closedSince: number | null; eyeGapSince: number | null } {
  if (closedNow === true) return { closedSince: prev.closedSince ?? nowMs, eyeGapSince: null };
  if (prev.closedSince === null) return { closedSince: null, eyeGapSince: null };
  const eyeGapSince = prev.eyeGapSince ?? nowMs;
  if ((nowMs - eyeGapSince) / 1000 < EYE_GAP_SECONDS) return { closedSince: prev.closedSince, eyeGapSince };
  return { closedSince: null, eyeGapSince: null };
}
