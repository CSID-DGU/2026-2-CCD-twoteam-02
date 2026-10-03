// 집중 상태 표시 (초록/노랑). 기준 시간이 되기 전에도 재는 중인 시간을 같이 보여 줍니다.
import { AWAY_SECONDS, DROWSY_SECONDS } from "./focusLogic";
import type { FocusState } from "./focusLogic";

const LABEL = {
  focus: { color: "#4ade80", text: "🟢 집중" },
  away: { color: "#facc15", text: "🟡 자리 이탈 의심" },
  drowsy: { color: "#facc15", text: "🟡 졸음 의심" },
};

export default function FocusBadge({ state }: { state: FocusState }) {
  const { color, text } = LABEL[state.status];
  const detail =
    state.awaySeconds > 0
      ? `얼굴 안 보임 ${Math.floor(state.awaySeconds)}초 / ${AWAY_SECONDS}초`
      : state.closedSeconds > 0
        ? `눈 감음 ${Math.floor(state.closedSeconds)}초 / ${DROWSY_SECONDS}초`
        : "";

  return (
    <div style={{ color, fontWeight: 600 }}>
      {text}
      {detail && <span style={{ fontWeight: 400 }}> · {detail}</span>}
    </div>
  );
}
