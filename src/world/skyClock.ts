// 지금 하늘 시계 (팀 전용 하늘 시간 조절). 단축키 표(keymap.ts)와 같은 방식의 작은 저장소입니다.
//
// WorldSky 가 매 프레임 getSkyClock() 으로 읽어 하늘 시각을 정하고, 처음에는 주소(?time, ?speed)로 채웁니다(parseClock).
// 팀 계정의 조절판(SkyTimePanel)이 setSkyClock 으로 바꾸면 다음 프레임부터 그 시각·빠르기로 하늘이 움직입니다.
// 내 브라우저 안의 값이라 다른 사람 하늘은 바뀌지 않고, 새로고침하면 실제 시각(또는 주소 값)으로 돌아갑니다.
import { useSyncExternalStore } from 'react'
import type { Clock } from './skyLogic'

let current: Clock | null = null
const listeners = new Set<() => void>()

export const getSkyClock = () => current

export function setSkyClock(next: Clock) {
  current = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 조절판이 빠르기 표시를 다시 그리도록 지금 시계를 읽습니다.
export function useSkyClock(): Clock | null {
  return useSyncExternalStore(subscribe, getSkyClock)
}
