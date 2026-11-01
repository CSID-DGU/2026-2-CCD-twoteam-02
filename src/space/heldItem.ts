// 카페에서 받아 들고 있는 것 (음료·빵). 같은 건물의 다른 층(예: 이끼 정원 → 이끼 루프탑)으로 가도 들고 가도록
// 지점 화면 밖(모듈)에 기억합니다. 새로고침하면 사라집니다. 내 화면에만 있고 서버에 보내지 않습니다.
import type { MenuItem } from './baristaLogic'

let held: MenuItem | null = null

export function heldItem() {
  return held
}

export function setHeldItem(item: MenuItem | null) {
  held = item
}
