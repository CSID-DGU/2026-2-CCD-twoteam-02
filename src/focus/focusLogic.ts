// 집중 상태 판정 + 집중 시간 기록 (화면·React와 무관한 순수 로직)
// 얼굴 인식 결과를 매번 넣어 주면, 얼굴이 안 보인 시간·눈 감은 시간을 재서 상태를 돌려줍니다.
//
// 집중 시간: 얼굴이 보이고 눈을 뜬 동안만 쌓입니다.
// 잠깐 안 보이거나 눈을 감은 시간은 "보류"해 두었다가, 기준 시간 안에 돌아오면 더해 주고
// 이탈·졸음으로 바뀌면 버립니다. (잠깐 고개 돌린 시간은 인정, 자리 비운 시간은 빼기 위해)
//
// 다른 화면(다른 탭·다른 앱) 사용: 시작할 때 "학습기기 사용함"을 고른 경우에만 공부로 인정합니다.
// - 사용 안 함(기본): 다른 탭으로 가거나 다른 앱을 누르면 바로 "다른 화면 사용"이 되고 시간이 멈춥니다.
// - 사용함: 다른 앱을 눌러도 이 페이지가 보이면 평소처럼 얼굴로 판정하고,
//   다른 탭으로 가서 얼굴 인식이 멈추면 그동안은 공부한 것으로 칩니다.

// 기준값은 아직 임시입니다. 팀에서 확정되면 여기만 고치면 됩니다.
export const AWAY_SECONDS = 30; // 얼굴이 이 시간 이상 안 보이면 자리 이탈 의심
export const DROWSY_SECONDS = 120; // 눈을 이 시간 이상 감고 있으면 졸음 의심 (잠깐 눈 감고 쉬는 건 허용)
export const EYE_CLOSED_SCORE = 0.5; // eyeBlink 평균이 이 값보다 크면 감은 것으로 봅니다.
export const EYE_OPEN_SCORE = 0.35; // 이 값보다 작아져야 다시 뜬 것으로 봅니다. (깜빡거림 방지)
const MAX_STEP_MS = 1000; // 한 번에 더하는 시간의 최대값 (컴퓨터가 잠들었다 깨도 시간이 튀지 않게)
// 다른 탭에 있으면 브라우저가 계산 주기를 최대 1분까지 늦추므로, 그때는 더 길게 허용합니다.
const HIDDEN_MAX_STEP_MS = 90_000;

export type FocusStatus = "focus" | "away" | "drowsy" | "offscreen";

export type FocusInput = {
  found: boolean; // 얼굴이 잡혔는지
  blink: number; // eyeBlinkLeft/Right 평균 (0=뜸, 1=감음)
};

export type ScreenInput = {
  pageHidden: boolean; // 다른 탭으로 가서 이 페이지가 안 보임 (얼굴 인식도 멈춤)
  windowFocused: boolean; // 이 브라우저 창이 선택돼 있음 (다른 앱을 누르면 false)
  allowDevices: boolean; // "학습기기 사용함"을 골랐는지
};

export type FocusState = {
  status: FocusStatus;
  awaySeconds: number; // 얼굴이 연속으로 안 보인 시간
  closedSeconds: number; // 눈을 연속으로 감은 시간
  studyMs: number; // 확정된 집중 시간
  pendingMs: number; // 보류 중인 시간 (돌아오면 더하고, 이탈·졸음이면 버림)
  // 내부 기록: 언제부터 안 보였는지 / 감았는지 / 마지막 계산 시각 (ms, 없으면 null)
  missingSince: number | null;
  closedSince: number | null;
  lastMs: number | null;
};

export const initialFocusState: FocusState = {
  status: "focus",
  awaySeconds: 0,
  closedSeconds: 0,
  studyMs: 0,
  pendingMs: 0,
  missingSince: null,
  closedSince: null,
  lastMs: null,
};

export function nextFocusState(
  prev: FocusState,
  input: FocusInput,
  nowMs: number,
  screen: ScreenInput = { pageHidden: false, windowFocused: true, allowDevices: false }
): FocusState {
  const elapsed = prev.lastMs === null ? 0 : Math.max(nowMs - prev.lastMs, 0);
  const step = Math.min(elapsed, MAX_STEP_MS);

  // 다른 화면 사용: 얼굴 기록은 지우고, 학습기기 허용 여부에 따라 멈추거나 인정합니다.
  const offScreen = screen.pageHidden || !screen.windowFocused;
  if (offScreen && (!screen.allowDevices || screen.pageHidden)) {
    const counted = screen.allowDevices; // 여기 왔다면 허용 시엔 다른 탭에 있는 경우
    return {
      status: counted ? "focus" : "offscreen",
      awaySeconds: 0,
      closedSeconds: 0,
      studyMs:
        prev.studyMs + (counted ? prev.pendingMs + Math.min(elapsed, HIDDEN_MAX_STEP_MS) : 0),
      pendingMs: 0,
      missingSince: null,
      closedSince: null,
      lastMs: nowMs,
    };
  }

  // 얼굴이 안 보이면 이탈 시간을 재고, 눈 감김 기록은 지웁니다.
  if (!input.found) {
    const missingSince = prev.missingSince ?? nowMs;
    const awaySeconds = (nowMs - missingSince) / 1000;
    const status = awaySeconds >= AWAY_SECONDS ? "away" : "focus";
    return {
      status,
      awaySeconds,
      closedSeconds: 0,
      studyMs: prev.studyMs,
      pendingMs: status === "focus" ? prev.pendingMs + step : 0,
      missingSince,
      closedSince: null,
      lastMs: nowMs,
    };
  }

  // 얼굴이 보이면 눈 감김을 봅니다. 이미 감은 상태면 더 크게 떠야 뜬 것으로 칩니다.
  const wasClosed = prev.closedSince !== null;
  const closed = wasClosed
    ? input.blink > EYE_OPEN_SCORE
    : input.blink > EYE_CLOSED_SCORE;
  const closedSince = closed ? prev.closedSince ?? nowMs : null;
  const closedSeconds = closedSince === null ? 0 : (nowMs - closedSince) / 1000;
  const status = closedSeconds >= DROWSY_SECONDS ? "drowsy" : "focus";

  // 눈을 뜨고 있으면 보류 시간까지 확정하고, 감고 있으면 보류에 쌓습니다.
  let studyMs = prev.studyMs;
  let pendingMs = prev.pendingMs;
  if (status === "drowsy") {
    pendingMs = 0;
  } else if (closed) {
    pendingMs += step;
  } else {
    studyMs += pendingMs + step;
    pendingMs = 0;
  }
  return {
    status,
    awaySeconds: 0,
    closedSeconds,
    studyMs,
    pendingMs,
    missingSince: null,
    closedSince,
    lastMs: nowMs,
  };
}
