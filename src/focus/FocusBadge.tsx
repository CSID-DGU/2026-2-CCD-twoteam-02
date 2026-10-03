// 집중 상태 표시 (초록/노랑) + 집중 시간. 기준 시간이 되기 전에도 재는 중인 시간을 같이 보여 줍니다.
import { AWAY_SECONDS, DROWSY_SECONDS } from "./focusLogic";
import type { FocusView } from "./useFocusState";

const LABEL = {
  focus: { color: "#4ade80", text: "🟢 집중" },
  away: { color: "#facc15", text: "🟡 자리 이탈 의심" },
  drowsy: { color: "#facc15", text: "🟡 졸음 의심" },
  offscreen: { color: "#facc15", text: "🟡 다른 화면 사용 중" },
};

// 밀리초 → "01:02:03"
function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export default function FocusBadge({ state }: { state: FocusView }) {
  const { color, text } = LABEL[state.status];
  const detail =
    state.awaySeconds > 0
      ? `얼굴 안 보임 ${Math.floor(state.awaySeconds)}초 / ${AWAY_SECONDS}초`
      : state.closedSeconds > 0
        ? `눈 감음 ${Math.floor(state.closedSeconds)}초 / ${DROWSY_SECONDS}초`
        : "";

  return (
    <>
      <div style={{ color, fontWeight: 600 }}>
        {text}
        {detail && <span style={{ fontWeight: 400 }}> · {detail}</span>}
      </div>
      <div>집중 시간 {formatTime(state.studyMs)}</div>
      {/* 임시: 모드 선택 창이 생기면 그쪽으로 옮깁니다. */}
      <label style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={state.allowDevices}
          onChange={(e) => state.setAllowDevices(e.target.checked)}
        />{" "}
        학습기기 사용함 (다른 화면도 공부로 인정)
      </label>
    </>
  );
}
