// 현재 시각을 일정 간격으로 갱신해 주는 훅. 타이머 표시용.
// 그리는 중에 Date.now()를 직접 읽으면 React 규칙(순수 렌더)에 어긋나므로, 시계를 "바깥 저장소"로 두고 useSyncExternalStore로 읽습니다.
import { useSyncExternalStore } from "react";

const TICK_MS = 500; // 갱신 간격 (초 단위 표시라 0.5초면 충분)

let value = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    value = Date.now();
    timer = setInterval(() => {
      value = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => value;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
