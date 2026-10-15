// 카메라 문제 안내: 머리~가슴이 잘리거나 카메라가 돌아간 상태가 10초 넘게 이어지면 화면 위쪽에 안내를 띄웁니다.
// 버튼 없이, 다시 제대로 보이면 저절로 사라집니다. 자리를 떠난 경우(배경 그대로)에는 띄우지 않습니다.
// 판정 규칙은 poseFrame.ts(nextGuideAlert)에 있습니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { initialGuideAlert, nextGuideAlert } from "./poseFrame";
import type { GuideAlert } from "./poseFrame";
import type { PoseState } from "./useTracking";

const CHECK_MS = 1000; // 1초마다 확인 (배경 확인 주기와 같음)

export function CameraGuideNotice({ pose }: { pose: RefObject<PoseState> }) {
  const [alert, setAlert] = useState<GuideAlert>(initialGuideAlert);
  const lastInputMs = useRef<number | null>(null);

  // 키보드·마우스 입력 시각만 기억합니다. (무엇을 눌렀는지는 보지 않음)
  useEffect(() => {
    const mark = () => {
      lastInputMs.current = Date.now();
    };
    const events = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, mark));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      // 다른 탭에 있으면 트래킹이 멈춰 마지막 값이 남아 있으므로 처음부터 다시 잽니다.
      if (document.hidden) {
        setAlert(initialGuideAlert);
        return;
      }
      const { found, framed, bgSame } = pose.current;
      setAlert((prev) =>
        nextGuideAlert(prev, { found, framed, bgSame, lastInputMs: lastInputMs.current }, Date.now())
      );
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [pose]);

  if (!alert.show) return null;
  return <div style={style}>(가이드라인) 📷 카메라에 머리와 어깨가 보이도록 맞춰 주세요</div>;
}

// 공부 막대(top 16) 바로 아래, 공부 시작 창(zIndex 20)보다 위
const style: CSSProperties = {
  position: "fixed", top: 56, left: "50%", transform: "translateX(-50%)", zIndex: 30,
  padding: "8px 16px", borderRadius: 8, background: "rgba(250,204,21,.95)", color: "#1f1a05",
  font: "14px system-ui, sans-serif", fontWeight: 600, pointerEvents: "none",
};
