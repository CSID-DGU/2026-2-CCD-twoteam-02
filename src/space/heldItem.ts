// 카페에서 받아 들고 있는 것 (음료·빵·캠프파이어 마시멜로). 같은 건물의 다른 층(예: 이끼 정원 → 이끼 루프탑)이나 광장으로 가도
// 들고 가도록 지점 화면 밖(모듈)에 기억합니다. 새로고침하면 사라집니다. 내 화면에만 있고 서버에 보내지 않습니다.
// 마시멜로는 굽기 정도(toast, campfireLogic)도 같이 기억합니다. 먹기·마시기 키(설정의 eat, 기본 C)로 먹으면 손이 비워집니다.
import { useEffect } from 'react'
import type { MenuItem } from './baristaLogic'
import { getKeymap } from '../menu/keymap'

let held: MenuItem | null = null
let toast = 0

export function heldItem() {
  return held
}

export function setHeldItem(item: MenuItem | null) {
  if (item !== held) toast = 0 // 새로 받으면 생 마시멜로부터
  held = item
}

export const heldToast = () => toast
export function setHeldToast(t: number) {
  toast = t
}

// 먹기·마시기 키: 들고 있을 때 누르면 onEat. 입력 칸에 쓰는 중이거나 창이 떠 있으면(paused) 무시
export function useEatKey(holding: MenuItem | null, paused: boolean, onEat: (item: MenuItem) => void) {
  useEffect(() => {
    if (!holding || paused) return
    const down = (e: KeyboardEvent) => {
      if (e.code !== getKeymap().eat || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      onEat(holding)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [holding, paused, onEat])
}

// 먹고 마셨을 때 한마디 (마시멜로는 굽기에 따라 campfireLogic.eatLine)
export const drinkLine = (item: MenuItem) => (item.food ? `냠냠! ${item.name} 맛있어요 ${item.icon}` : `꿀꺽! ${item.name} 다 마셨어요 ${item.icon}`)
