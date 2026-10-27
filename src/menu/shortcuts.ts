// 오른쪽 위 버튼의 키보드 단축키 (#205). 화면·React와 무관한 값과 계산입니다.
//
// 1인칭으로 걸을 때는 마우스가 시점에 잠겨 있어 버튼을 누르려면 Esc 로 풀어야 했습니다.
// 자주 쓰는 버튼은 키로도 열게 합니다. 창이 뜨면 잠금이 자동으로 풀려 커서가 나타납니다.
// 로그아웃(실수 방지)은 단축키를 두지 않습니다. 키는 설정에서 바꿀 수 있습니다(keymap.ts, #250).
import type { PanelView } from './panelTypes'
import { getKeymap } from './keymap'
import type { KeyAction } from './keymap'

// 창을 여는 단축키. 같은 키를 한 번 더 누르면 닫습니다. 실제 키는 getKeymap() 에서 읽습니다.
export const PANEL_KEYS: { action: KeyAction & PanelView['kind']; label: string }[] = [
  { action: 'map', label: '전체 지도' },
  { action: 'records', label: '내 기록' },
  { action: 'friends', label: '친구' },
  { action: 'profile', label: '내 프로필' },
  { action: 'settings', label: '설정' }, // 메뉴 아래 상자에 있음 (#222)
]

// 글자를 쓰는 중인지 (입력칸·채팅창). 이때 누른 키는 단축키가 아닙니다.
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

// 단축키로 받을 수 있는 키 입력인지. Ctrl·Cmd·Alt 와 함께 누른 것(새로고침 Ctrl+R, 찾기 Ctrl+F,
// 인쇄 Cmd+P 등)은 브라우저 것이라 건드리지 않고, 누르고 있어 반복되는 입력도 무시합니다.
export function isShortcut(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !e.isComposing && !isTyping(e.target)
}

// 키를 눌렀을 때 띄울 창. 그 창이 이미 떠 있으면 null(닫기), 단축키가 아니면 undefined(그대로)
export function panelAfterKey(code: string, current: PanelView | null, myId: string, keymap = getKeymap()): PanelView | null | undefined {
  const hit = PANEL_KEYS.find((k) => keymap[k.action] === code)
  if (!hit) return undefined
  const next: PanelView = hit.action === 'profile' ? { kind: 'profile', userId: myId } : { kind: hit.action }
  const same = current !== null && current.kind === next.kind && (next.kind !== 'profile' || (current.kind === 'profile' && current.userId === myId))
  return same ? null : next
}
