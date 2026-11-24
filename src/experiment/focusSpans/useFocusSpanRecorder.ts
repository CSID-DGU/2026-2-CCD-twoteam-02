// 공부 중인 동안 표시등 구간을 1초마다 브라우저 저장소에 남기는 훅 (실험용, focusSpanLogic.ts).
// 다른 탭에 가 있어도 워커 신호로 계속 기록합니다. 새로고침해도 앞 기록에 이어 씁니다.
import { useEffect, useRef, useState } from "react";
import type { FocusStatus } from "../../focus/focusLogic";
import { workerInterval } from "../../lib/workerInterval";
import { browserStore } from "../survey/surveyBrowser";
import { TICK_MS, extend, lightOf, loadSpans, saveSpans } from "./focusSpanLogic";
import type { HoldReason } from "./focusSpanLogic";

// 돌려주는 값: 저장에 실패했는지 (저장 공간 부족 등). 화면에 알리는 데 씁니다.
export function useFocusSpanRecorder(user: string, status: FocusStatus, hold: HoldReason | null): boolean {
  const latest = useRef({ status, hold });
  useEffect(() => {
    latest.current = { status, hold };
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let spans = loadSpans(browserStore);
    const tick = () => {
      const { light, reason } = lightOf(latest.current.status, latest.current.hold);
      spans = extend(spans, Date.now(), user, light, reason);
      setFailed(!saveSpans(browserStore, spans));
    };
    tick();
    const stop = workerInterval(TICK_MS, tick);
    window.addEventListener("pagehide", tick); // 탭을 닫을 때 마지막 구간의 끝을 지금으로
    return () => {
      stop();
      window.removeEventListener("pagehide", tick);
      tick(); // 일어나기, 과목 바꾸기, 지점 나가기
    };
  }, [user]);

  return failed;
}
