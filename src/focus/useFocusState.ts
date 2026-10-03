// 얼굴 인식 결과(ref)를 0.1초마다 읽어 집중 상태를 계산하는 훅
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { initialFocusState, nextFocusState } from "./focusLogic";
import type { FocusInput, FocusState } from "./focusLogic";

export type FocusView = FocusState & {
  allowDevices: boolean;
  setAllowDevices: (value: boolean) => void;
};

export function useFocusState(face: RefObject<FocusInput>): FocusView {
  const [state, setState] = useState<FocusState>(initialFocusState);
  // 학습기기 사용 여부. 모드 선택 창이 생기기 전까지는 화면의 체크박스로 바꿉니다.
  const [allowDevices, setAllowDevices] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const { found, blink } = face.current;
      const screen = {
        pageHidden: document.hidden,
        windowFocused: document.hasFocus(),
        allowDevices,
      };
      setState((prev) => nextFocusState(prev, { found, blink }, Date.now(), screen));
    }, 100);
    return () => clearInterval(id);
  }, [face, allowDevices]);

  return { ...state, allowDevices, setAllowDevices };
}
