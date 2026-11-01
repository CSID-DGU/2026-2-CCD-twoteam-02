// 화면 왼쪽 위 FPS 표시 (설정 → 화면·마우스). 기본은 꺼짐.
//
// 성능을 재 볼 때(팀·발표) 켜는 측정용 숫자라 평소에는 숨깁니다. 끄면 FPS 를 재는 일(FpsProbe)도 하지 않아,
// 0.5초마다 화면 상태를 다시 그리던 일도 없어집니다. 마우스 감도처럼 이 브라우저에 기억합니다.
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'dooteum.perf'
const listeners = new Set<() => void>()

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let current = load()

export const getShowPerf = () => current

export function setShowPerf(on: boolean) {
  current = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // 기억하지 못해도 이번 접속에서는 바뀐 값을 씁니다.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useShowPerf = () => useSyncExternalStore(subscribe, getShowPerf)
