// 내 채널 번호 (#442, #481). 탭마다 하나를 기억합니다(sessionStorage). 새로고침해도 남고, 탭을 닫으면 사라집니다.
//
// 채널은 광장·카페·캠퍼스·해변·회의실을 모두 포함한 하나의 세계라, 어느 화면이든 이 번호 하나를 씁니다.
// 접속 표시(OnlineProvider)도 이 번호를 올려, 일반 페이지(내 기록·친구·프로필)에 있는 사람도 이 채널 인원으로 셉니다.
// 번호가 바뀌면 구독한 화면에 알립니다(React 의 useSyncExternalStore).
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'twoteam-channel'
const listeners = new Set<() => void>()

export function readMyChannel(): number | null {
  try {
    const no = Number(sessionStorage.getItem(STORAGE_KEY))
    return Number.isInteger(no) && no >= 1 ? no : null
  } catch {
    return null // 저장소를 못 쓰는 환경. 서버가 1번부터 찾아 줍니다
  }
}

export function saveMyChannel(no: number) {
  if (readMyChannel() === no) return
  try {
    sessionStorage.setItem(STORAGE_KEY, String(no))
  } catch {
    // 못 적어도 이번 화면에서는 동작합니다
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// 내 채널 번호. 아직 정해지지 않았으면 null
export const useMyChannel = () => useSyncExternalStore(subscribe, readMyChannel)
