// 얼굴 인식 결과(ref)와 가이드라인·몸·보정 기준(선택)을 0.1초마다 읽어 집중 상태를 계산하는 훅
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialFocusState, nextFocusState } from "./focusLogic";
import type { FocusInput, FocusState } from "./focusLogic";
import type { Baseline } from "./calibration";
import { workerInterval } from "../lib/workerInterval";

export type FocusView = FocusState & {
  allowDevices: boolean;
  setAllowDevices: (value: boolean) => void;
};

// body: 몸(Pose) 결과 — framed가 null이면 Pose 준비 전·오류라 "모름"으로 넘깁니다.
// baseline: 보정 기준 (없으면 눈 감음 판정 안 함)
export type FocusExtras = {
  body?: RefObject<{ found: boolean; framed: boolean | null }>;
  baseline?: Baseline | null;
};

// initialAllowDevices: 공부 시작 창에서 고른 학습기기 사용 여부. 트래킹 검증 화면은 체크박스로 바꿉니다.
// pose(선택): 카메라 가이드라인 결과. 넘기지 않으면 가이드라인은 보지 않습니다.
export function useFocusState(
  face: RefObject<FocusInput>,
  initialAllowDevices = false,
  pose?: RefObject<{ framed: boolean | null }>,
  extras: FocusExtras = {}
): FocusView {
  const [state, setState] = useState<FocusState>(initialFocusState);
  const [allowDevices, setAllowDevices] = useState(initialAllowDevices);
  const lastInputMs = useRef<number | null>(null);
  const { body, baseline = null } = extras;

  // 키보드·마우스 입력 시각만 기억합니다. (무엇을 눌렀는지는 보지 않음)
  useEffect(() => {
    const mark = () => {
      lastInputMs.current = Date.now();
    };
    const events = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, mark));
  }, []);

  // 판정은 워커 신호로 0.1초마다 합니다. setInterval은 다른 탭에 있으면 브라우저가 1분 1회까지 늦출 수 있어서입니다.
  useEffect(() => {
    const stop = workerInterval(100, () => {
      const { found, ear, pitch, updatedAt } = face.current;
      const framed = pose?.current.framed ?? null;
      const bodyFound = body ? (body.current.framed === null ? null : body.current.found) : null;
      const screen = {
        pageHidden: document.hidden,
        windowFocused: document.hasFocus(),
        allowDevices,
        lastInputMs: lastInputMs.current,
      };
      setState((prev) =>
        nextFocusState(prev, { found, ear, pitch, framed, bodyFound, baseline, updatedAt }, Date.now(), screen)
      );
    });
    return stop;
  }, [face, pose, body, baseline, allowDevices]);

  return { ...state, allowDevices, setAllowDevices };
}
