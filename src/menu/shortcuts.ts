// 오른쪽 위 버튼의 키보드 단축키 (#205). 화면·React와 무관한 값과 계산입니다.
//
// 1인칭으로 걸을 때는 마우스가 시점에 잠겨 있어 버튼을 누르려면 Esc 로 풀어야 했습니다.
// 자주 쓰는 버튼은 키로도 열게 합니다. 창이 뜨면 잠금이 자동으로 풀려 커서가 나타납니다.
// 로그아웃(실수 방지)과 트래킹 검증(개발용)은 단축키를 두지 않습니다.
import type { PanelView } from './panelTypes'

// 창을 여는 키 (KeyboardEvent.code). 같은 키를 한 번 더 누르면 닫습니다.
export const PANEL_KEYS = [
  { code: 'KeyR', key: 'R', label: '내 기록', kind: 'records' },
  { code: 'KeyF', key: 'F', label: '친구', kind: 'friends' },
  { code: 'KeyP', key: 'P', label: '내 프로필', kind: 'profile' },
] as const

// 지점에서 로비로 나가기. 서 있을 때만 됩니다(공부 중에 실수로 나가지 않게).
export const LOBBY_KEY = { code: 'KeyL', key: 'L' }

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
export function panelAfterKey(code: string, current: PanelView | null, myId: string): PanelView | null | undefined {
  const hit = PANEL_KEYS.find((k) => k.code === code)
  if (!hit) return undefined
  const next: PanelView = hit.kind === 'profile' ? { kind: 'profile', userId: myId } : { kind: hit.kind }
  const same = current !== null && current.kind === next.kind && (next.kind !== 'profile' || (current.kind === 'profile' && current.userId === myId))
  return same ? null : next
}
