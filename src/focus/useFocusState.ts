// 얼굴 인식 결과(ref)를 0.1초마다 읽어 집중 상태를 계산하는 훅
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { initialFocusState, nextFocusState } from "./focusLogic";
import type { FocusInput, FocusState } from "./focusLogic";

export function useFocusState(face: RefObject<FocusInput>) {
  const [state, setState] = useState<FocusState>(initialFocusState);

  useEffect(() => {
    const id = setInterval(() => {
      const { found, blink } = face.current;
      setState((prev) => nextFocusState(prev, { found, blink }, Date.now()));
    }, 100);
    return () => clearInterval(id);
  }, [face]);

  return state;
}
