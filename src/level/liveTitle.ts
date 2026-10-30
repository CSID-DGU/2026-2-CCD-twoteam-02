// 공부 중인 실시간 누적 (꽃 피는 칭호). 공부 기록은 조각으로(5분마다) 저장돼, 저장된 합만 보면
// 축하 카드가 뜬 직후 프로필·내 기록 창이 최대 5분 동안 옛 칭호를 보였습니다. 그래서 공부 화면(StudyRunner)이
// 아는 "이 공부 전 누적 + 이번 확정분"을 여기 올려 두고, 내 칭호를 보여 주는 곳은 저장된 합과 이 값 중 큰 것을 씁니다.
// 사용자마다 따로(같은 탭에서 계정을 바꿔도 섞이지 않게), 늘기만 합니다(칭호는 떨어지지 않음).
import { useSyncExternalStore } from 'react'

const live = new Map<string, number>()
const listeners = new Set<() => void>()

export function setLiveSeconds(userId: string, seconds: number) {
  if (seconds <= (live.get(userId) ?? -1)) return
  live.set(userId, seconds)
  listeners.forEach((l) => l())
}

export const getLiveSeconds = (userId: string): number | null => live.get(userId) ?? null

export function subscribeLive(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 화면에 보여 줄 누적: 저장된 합과 실시간 누적 중 큰 값
export const shownSeconds = (saved: number, liveSeconds: number | null) => Math.max(saved, liveSeconds ?? 0)

// 내 실시간 누적 (없으면 null). 바뀌면 다시 그립니다.
export function useLiveSeconds(userId: string | undefined): number | null {
  return useSyncExternalStore(subscribeLive, () => (userId ? getLiveSeconds(userId) : null))
}
