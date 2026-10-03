// 집중 상태 판정 (화면·React와 무관한 순수 로직)
// 얼굴 인식 결과를 매번 넣어 주면, 얼굴이 안 보인 시간·눈 감은 시간을 재서 상태를 돌려줍니다.

// 기준값은 아직 임시입니다. 팀에서 확정되면 여기만 고치면 됩니다.
export const AWAY_SECONDS = 30; // 얼굴이 이 시간 이상 안 보이면 자리 이탈 의심
export const DROWSY_SECONDS = 120; // 눈을 이 시간 이상 감고 있으면 졸음 의심 (잠깐 눈 감고 쉬는 건 허용)
export const EYE_CLOSED_SCORE = 0.5; // eyeBlink 평균이 이 값보다 크면 감은 것으로 봅니다.
export const EYE_OPEN_SCORE = 0.35; // 이 값보다 작아져야 다시 뜬 것으로 봅니다. (깜빡거림 방지)

export type FocusStatus = "focus" | "away" | "drowsy";

export type FocusInput = {
  found: boolean; // 얼굴이 잡혔는지
  blink: number; // eyeBlinkLeft/Right 평균 (0=뜸, 1=감음)
};

export type FocusState = {
  status: FocusStatus;
  awaySeconds: number; // 얼굴이 연속으로 안 보인 시간
  closedSeconds: number; // 눈을 연속으로 감은 시간
  // 내부 기록: 언제부터 안 보였는지 / 감았는지 (ms, 없으면 null)
  missingSince: number | null;
  closedSince: number | null;
};

export const initialFocusState: FocusState = {
  status: "focus",
  awaySeconds: 0,
  closedSeconds: 0,
  missingSince: null,
  closedSince: null,
};

export function nextFocusState(
  prev: FocusState,
  input: FocusInput,
  nowMs: number
): FocusState {
  // 얼굴이 안 보이면 이탈 시간을 재고, 눈 감김 기록은 지웁니다.
  if (!input.found) {
    const missingSince = prev.missingSince ?? nowMs;
    const awaySeconds = (nowMs - missingSince) / 1000;
    return {
      status: awaySeconds >= AWAY_SECONDS ? "away" : "focus",
      awaySeconds,
      closedSeconds: 0,
      missingSince,
      closedSince: null,
    };
  }

  // 얼굴이 보이면 눈 감김을 봅니다. 이미 감은 상태면 더 크게 떠야 뜬 것으로 칩니다.
  const wasClosed = prev.closedSince !== null;
  const closed = wasClosed
    ? input.blink > EYE_OPEN_SCORE
    : input.blink > EYE_CLOSED_SCORE;
  const closedSince = closed ? prev.closedSince ?? nowMs : null;
  const closedSeconds = closedSince === null ? 0 : (nowMs - closedSince) / 1000;
  return {
    status: closedSeconds >= DROWSY_SECONDS ? "drowsy" : "focus",
    awaySeconds: 0,
    closedSeconds,
    missingSince: null,
    closedSince,
  };
}
