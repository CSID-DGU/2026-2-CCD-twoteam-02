// 폰처럼 터치로만 조작하는 기기인지 (#377). 마우스·터치패드가 붙어 있으면(any-pointer: fine) PC 로 봅니다.
// 그래서 키보드를 붙인 태블릿·터치 노트북은 지금처럼 PC 조작이고, 앱으로 감싸도(Capacitor 등) 같은 판단이 통합니다.
import { useSyncExternalStore } from 'react'

const QUERY = '(pointer: coarse) and (not (any-pointer: fine))'

export function isTouchMode(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribe, isTouchMode, () => false)
}

// 폰에서 공부 자리·키오스크·회의실을 누르면 띄우는 안내 (#377 1단계: 폰은 구경, 공부는 PC)
export const STUDY_ON_PC = '공부는 PC에서 할 수 있어요. 폰에서는 둘러보기와 쉬는 자리만 쓸 수 있어요.'
