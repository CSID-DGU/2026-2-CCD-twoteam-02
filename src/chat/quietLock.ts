// 방해금지 고정 (캠빛 대학교 도서관). 지점 화면이 "이 지점에 있는 동안 방해금지를 켠 채로" 를 여기 올리면,
// 채팅(ChatProvider)이 읽어 방해금지를 켜고 끌 수 없게 합니다. 지점을 나가면 지점 화면이 풉니다.
// 지점 화면과 채팅은 서로 다른 곳(채팅은 앱 전체)에 있어서 작은 전역 저장소로 주고받습니다(liveTitle 과 같은 방식).
import { useSyncExternalStore } from 'react'

let locked = false
const listeners = new Set<() => void>()

export function setQuietLock(on: boolean) {
  if (on === locked) return
  locked = on
  listeners.forEach((l) => l())
}

export const getQuietLock = () => locked

export function subscribeQuietLock(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useQuietLock = () => useSyncExternalStore(subscribeQuietLock, getQuietLock)
