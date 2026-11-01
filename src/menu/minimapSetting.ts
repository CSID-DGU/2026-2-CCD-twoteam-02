// 걸을 때 미니맵 보기 (설정 → 화면). 기본은 꺼짐.
//
// 미니맵은 걷는 동안 3D 장면을 한 번 더 그려서 컴퓨터가 더 일합니다. 필요한 사람만 켜도록 기본은 끄고,
// 마우스 감도처럼 계정이 아니라 이 브라우저에 기억합니다. 광장·캠퍼스에서만 쓰고, 지점·회의실 안에는 미니맵이 없습니다.
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'dooteum.minimap'
const listeners = new Set<() => void>()

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)
  }
}

let current = load()

export const getShowMinimap = () => current

export function setShowMinimap(on: boolean) {
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

// 설정 창에서 바꾸면 광장 화면이 바로 따라 바뀝니다.
export const useShowMinimap = () => useSyncExternalStore(subscribe, getShowMinimap)
