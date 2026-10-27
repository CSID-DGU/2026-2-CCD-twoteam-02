// 얼굴 인식 결과(ref)와 가이드라인·몸·보정 기준(선택)을 0.1초마다 읽어 집중 상태를 계산하는 훅
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialFocusState, nextFocusState } from "./focusLogic";
import type { FocusInput, FocusState } from "./focusLogic";
import type { Baseline } from "./calibration";
import { workerInterval } from "../lib/workerInterval";

// 두 허용 값은 따로 켜고 끕니다 (#172). allowOtherScreen: 다른 탭·앱 사용함, allowDevices: 휴대폰·학습기기 사용함
export type Allowed = { allowOtherScreen: boolean; allowDevices: boolean };
export const NOTHING_ALLOWED: Allowed = { allowOtherScreen: false, allowDevices: false };

export type FocusView = FocusState & {
  allowOtherScreen: boolean;
  allowDevices: boolean;
  setAllowOtherScreen: (value: boolean) => void;
  setAllowDevices: (value: boolean) => void;
};

// body: 몸(Pose) 결과 — framed가 null이면 Pose 준비 전·오류라 "모름"으로 넘깁니다. lastMotionMs는 팔이 마지막으로 움직인 시각(깨어 있음 신호).
// baseline: 보정 기준 (없으면 눈 감음 판정 안 함)
// phone: 휴대폰 감지 결과 (없거나 null이면 휴대폰은 보지 않음)
export type FocusExtras = {
  body?: RefObject<{ found: boolean; framed: boolean | null; lastMotionMs?: number | null }>;
  baseline?: Baseline | null;
  phone?: RefObject<{ found: boolean | null }>;
  paused?: boolean; // 중지(#236): 판정을 멈춥니다. 다시 시작하면 확정 시간(studyMs)만 두고 판정을 새로 시작합니다.
};

// initial: 공부 시작 창에서 고른 두 허용 값. 트래킹 검증 화면은 체크박스로 바꿉니다.
// pose(선택): 카메라 가이드라인 결과. 넘기지 않으면 가이드라인은 보지 않습니다.
export function useFocusState(
  face: RefObject<FocusInput>,
  initial: Allowed = NOTHING_ALLOWED,
  pose?: RefObject<{ framed: boolean | null }>,
  extras: FocusExtras = {}
): FocusView {
  const [state, setState] = useState<FocusState>(initialFocusState);
  const [allowOtherScreen, setAllowOtherScreen] = useState(initial.allowOtherScreen);
  const [allowDevices, setAllowDevices] = useState(initial.allowDevices);
  const lastInputMs = useRef<number | null>(null);
  const { body, baseline = null, phone, paused = false } = extras;
  // 중지했다 다시 시작하면 첫 판정에서 이전 기록을 지웁니다. 그대로 이으면 중지한 시간만큼 얼굴이 안 보인 것으로 계산돼
  // 바로 자리 이탈이 됩니다. 중지 직전의 보류 시간도 여기서 버립니다(타이머에 안 들어감, 기록은 중지).
  const resumed = useRef(false);

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
    if (paused) {
      resumed.current = true;
      return;
    }
    const stop = workerInterval(100, () => {
      const fresh = resumed.current;
      resumed.current = false;
      const { found, ear, pitch, updatedAt } = face.current;
      const framed = pose?.current.framed ?? null;
      const bodyFound = body ? (body.current.framed === null ? null : body.current.found) : null;
      const lastMotionMs = body?.current.lastMotionMs ?? null;
      const phoneFound = phone?.current.found ?? null;
      const screen = {
        pageHidden: document.hidden,
        windowFocused: document.hasFocus(),
        allowOtherScreen,
        allowDevices,
        lastInputMs: lastInputMs.current,
      };
      setState((prev) =>
        nextFocusState(
          fresh ? { ...initialFocusState, studyMs: prev.studyMs } : prev,
          { found, ear, pitch, framed, bodyFound, lastMotionMs, baseline, updatedAt, phone: phoneFound },
          Date.now(),
          screen
        )
      );
    });
    return stop;
  }, [face, pose, body, baseline, phone, allowOtherScreen, allowDevices, paused]);

  return { ...state, allowOtherScreen, allowDevices, setAllowOtherScreen, setAllowDevices };
}
