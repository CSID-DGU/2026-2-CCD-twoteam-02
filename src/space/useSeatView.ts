// 앉았을 때의 시점(1인칭·뒤 위·오른쪽·왼쪽, #436)을 화면 여러 곳이 같이 쓰는 저장소.
//
// 좌석 카메라(SeatCamera)가 V 키로 바꾸고, 시점 버튼(SeatViewButton)과 장면(3인칭이면 내 캐릭터를 그림)이 같은 값을 읽습니다.
// 마지막으로 고른 시점은 localStorage(브라우저에 오래 남는 저장소)에 두어 다음에 앉을 때도 그 시점으로 시작합니다.
// 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 기억하지 못할 뿐 동작은 같습니다.
import { useSyncExternalStore } from 'react'
import { isSeatView, nextSeatView } from './seatViewLogic'
import type { SeatView } from './seatViewLogic'

const STORAGE_KEY = 'dooteum.seatView'

function read(): SeatView {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isSeatView(saved) ? saved : 'first'
  } catch {
    return 'first'
  }
}

let current: SeatView = read()
const listeners = new Set<() => void>()

export function setSeatView(view: SeatView) {
  if (view === current) return
  current = view
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // 저장 못 해도 이번 접속에서는 그대로 씁니다.
  }
  listeners.forEach((l) => l())
}

export const cycleSeatView = () => setSeatView(nextSeatView(current))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSeatView(): SeatView {
  return useSyncExternalStore(subscribe, () => current, () => 'first' as SeatView)
}
