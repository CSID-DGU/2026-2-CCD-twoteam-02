// 집중 상태 표시 (초록/노랑/빨강) + 집중 시간. 기준 시간이 되기 전에도 재는 중인 시간을 같이 보여 줍니다.
// 빨강 = 기준을 넘겨 시간이 안 올라감, 노랑 = 아직 올라가는 중 (보류·가이드라인)
import {
  AWAY_SECONDS,
  OUTFRAME_SECONDS,
  HOLD_LABEL,
  holdReason,
  shownStudyMs,
} from "./focusLogic";
import type { FocusView } from "./useFocusState";

const LABEL = {
  focus: { color: "#4ade80", text: "🟢 집중" },
  away: { color: "#f87171", text: "🔴 자리 이탈" },
  drowsy: { color: "#f87171", text: "🔴 졸음" },
  offscreen: { color: "#f87171", text: "🔴 다른 화면 사용 중" },
  outframe: { color: "#facc15", text: "🟡 가이드라인 이탈 의심" },
  phone: { color: "#f87171", text: "🔴 휴대폰 사용" },
};

// 밀리초 → "01:02:03"
function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export default function FocusBadge({
  state,
  guide,
}: {
  state: FocusView;
  guide?: "loading" | "ready" | "error"; // 가이드라인(Pose) 상태. 안 넘기면 표시 안 함
}) {
  const hold = holdReason(state);
  const { color, text } = hold
    ? { color: "#facc15", text: HOLD_LABEL[hold] }
    : LABEL[state.status];
  const detail =
    state.awaySeconds > 0
      ? `얼굴 안 보임 ${Math.floor(state.awaySeconds)}초 / ${AWAY_SECONDS}초`
      : state.closedSeconds > 0
        ? `눈 감음 ${Math.floor(state.closedSeconds)}초 / ${state.drowsyLimitSeconds}초` // 기준은 자세에 따라 21초·60초
        : state.outframeSeconds > 0
          ? `머리~가슴 화면 밖 ${Math.floor(state.outframeSeconds)}초 / ${OUTFRAME_SECONDS}초`
          : "";

  return (
    <>
      <div style={{ color, fontWeight: 600 }}>
        {text}
        {detail && <span style={{ fontWeight: 400 }}> · {detail}</span>}
      </div>
      <div>집중 시간 {formatTime(shownStudyMs(state))}</div>
      {guide === "loading" && <div style={{ opacity: 0.7 }}>가이드라인 모델 불러오는 중…</div>}
      {guide === "error" && <div style={{ opacity: 0.7 }}>가이드라인 확인 불가 (다른 판정은 계속)</div>}
      {/* 임시: 모드 선택 창이 생기면 그쪽으로 옮깁니다. */}
      <label style={{ cursor: "pointer", display: "block" }}>
        <input
          type="checkbox"
          checked={state.allowOtherScreen}
          onChange={(e) => state.setAllowOtherScreen(e.target.checked)}
        />{" "}
        다른 탭·앱 사용함 (다른 탭·다른 앱을 써도 공부로 인정)
      </label>
      <label style={{ cursor: "pointer", display: "block" }}>
        <input
          type="checkbox"
          checked={state.allowDevices}
          onChange={(e) => state.setAllowDevices(e.target.checked)}
        />{" "}
        휴대폰·학습기기 사용함 (휴대폰·패드가 보여도 공부로 인정)
      </label>
    </>
  );
}
