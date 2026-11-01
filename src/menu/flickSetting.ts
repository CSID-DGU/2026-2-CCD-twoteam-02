// 딱밤 받기 (설정 → 화면·마우스, #304). 기본은 켜짐.
// 끄면 맞아도 아무 일도 없고, 실시간 위치 메시지에 "받지 않음"(nf)을 실어 친구 화면의 딱밤 안내에도 뜨지 않습니다.
// 마우스 감도처럼 계정이 아니라 이 브라우저에 기억합니다.
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'dooteum.flick'
const listeners = new Set<() => void>()

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

let current = load()

export const getFlickReceiving = () => current

export function setFlickReceiving(on: boolean) {
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

export const useFlickReceiving = () => useSyncExternalStore(subscribe, getFlickReceiving)
