// 다른 참여자의 최신 상태(위치·고개·눈 등)를 React 상태 밖에 두는 곳 (#504)
//
// 전에는 위치가 하나 올 때마다 참여자 목록을 새로 만들어 화면(WorldScene 등) 전체를 다시 맞췄습니다.
// 19명이 걸으면 초당 수십 번 광장 전체를 다시 맞춰 메모리를 쓰고 버리는 양이 3배가 됐습니다(#500 결과 11).
// 그래서 목록(useParticipants 의 others)은 사람이 들고 나거나 앉기·상태처럼 드물게 바뀌는 값이 바뀔 때만 새로 만들고,
// 자주 바뀌는 값은 여기에 두어 캐릭터 하나하나가 자기 것만 구독합니다(OtherParticipants).
// 한 사람이 움직이면 그 사람 캐릭터만 다시 그립니다.
import type { PresenceState } from './participants'

export type LiveStates = {
  get(userId: string): PresenceState | undefined
  subscribe(userId: string, onChange: () => void): () => void
}

export type LiveStore = LiveStates & {
  set(state: PresenceState): void
  delete(userId: string): void
  clear(): void
}

export function createLiveStates(): LiveStore {
  const states = new Map<string, PresenceState>()
  const listeners = new Map<string, Set<() => void>>()
  const notify = (userId: string) => listeners.get(userId)?.forEach((l) => l())
  return {
    get: (userId) => states.get(userId),
    subscribe(userId, onChange) {
      let set = listeners.get(userId)
      if (!set) listeners.set(userId, (set = new Set()))
      set.add(onChange)
      return () => {
        set.delete(onChange)
        if (set.size === 0 && listeners.get(userId) === set) listeners.delete(userId)
      }
    },
    set(state) {
      states.set(state.userId, state)
      notify(state.userId)
    },
    delete(userId) {
      if (states.delete(userId)) notify(userId)
    },
    clear() {
      const ids = [...states.keys()]
      states.clear()
      ids.forEach(notify)
    },
  }
}

// 목록을 새로 만들어야 하는 변화인지. 목록을 쓰는 곳(빈자리, 접속 인원, 회의 음성·방장)이 보는 값만 비교합니다.
// 위치·방향·고개·눈·팔·입·감정표현·점프는 캐릭터가 live 에서 직접 받으므로 넣지 않습니다.
export function listFieldsChanged(prev: PresenceState, next: PresenceState): boolean {
  return (
    prev.seat !== next.seat ||
    prev.status !== next.status ||
    prev.lv !== next.lv ||
    prev.nf !== next.nf ||
    prev.mic !== next.mic ||
    prev.sync !== next.sync
  )
}
