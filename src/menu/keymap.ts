// 단축키 표와 바꾸기 (#250). 설정 창(O)에서 사람마다 키를 바꿀 수 있습니다.
//
// 키는 KeyboardEvent.code(자판 위치, 예: 'KeyR')로 다룹니다. 한글 입력 상태여도 같은 자리를 누르면 같은 값이 나옵니다.
// 바꾼 키는 이 브라우저에 기억합니다(마우스 감도와 같은 방식, DB 변경 없음).
// 화면들은 누른 순간 getKeymap() 으로 지금 키를 읽고, 키 표시(키캡·안내 문구)는 useKeymap() 으로 바뀌면 다시 그립니다.
import { useSyncExternalStore } from 'react'

export type KeyAction = 'records' | 'friends' | 'profile' | 'settings' | 'lobby' | 'tracking' | 'view' | 'emoteWheel' | 'interact' | 'flick' | 'recenter' | 'mic' | 'map' | 'bag'
export type Keymap = Record<KeyAction, string>

// 설정 창에 보이는 순서와 이름
export const KEY_ACTIONS: { action: KeyAction; label: string }[] = [
  { action: 'interact', label: '앉기·입장·일어나기·프로필 보기' },
  { action: 'flick', label: '딱밤 (빨간불인 친구 옆에서)' },
  { action: 'view', label: '시점 바꾸기 (1인칭·위에서)' },
  { action: 'recenter', label: '정면 보기 (앉았을 때) · 점프 (서 있을 때)' },
  { action: 'emoteWheel', label: '감정표현 바퀴' },
  { action: 'map', label: '전체 지도' },
  { action: 'bag', label: '가방 (스터디 플래너·메모장)' },
  { action: 'records', label: '내 기록' },
  { action: 'friends', label: '친구' },
  { action: 'profile', label: '내 프로필' },
  { action: 'settings', label: '설정' },
  { action: 'lobby', label: '캠리단길로' },
  { action: 'tracking', label: '트래킹 검증' },
  { action: 'mic', label: '마이크 켜기·끄기 (회의실)' },
]

export const DEFAULT_KEYMAP: Keymap = {
  interact: 'KeyE',
  flick: 'KeyQ', // 딱밤으로 깨우기 (#304)
  view: 'KeyV',
  recenter: 'Space', // 앉아서 둘러본 시점을 책상 정면으로 되돌림 (#112). 서 있을 때는 점프
  emoteWheel: 'KeyX',
  records: 'KeyR',
  friends: 'KeyF',
  profile: 'KeyP',
  settings: 'KeyO',
  lobby: 'KeyL',
  tracking: 'KeyT',
  mic: 'KeyM', // 회의실 음성 (#46)
  map: 'KeyG', // 전체 지도 (#300). M 은 마이크가 써서 G
  bag: 'KeyB', // 가방: 스터디 플래너·메모장
}

// 바꿀 수 없는 키: 이동(WASD·방향키), 달리기(Shift), 채팅(Enter), 창 닫기(Esc), 감정표현(1~8), 그 밖의 조작 키
const RESERVED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'Enter', 'NumpadEnter', 'Escape', 'Tab', 'Backspace', 'CapsLock',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8',
])
export const isReserved = (code: string) => RESERVED.has(code)

// 키캡·안내 문구에 보일 글자: 'KeyR' → 'R', 'Digit9' → '9', 'Semicolon' → ';'
const SYMBOLS: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`',
}
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `숫자판 ${code.slice(6)}`
  return SYMBOLS[code] ?? code
}

export type AssignResult = { ok: true; keymap: Keymap; swapped: KeyAction | null } | { ok: false; error: string }

// action 의 키를 code 로 바꿉니다. 다른 동작이 쓰던 키면 서로 바꿉니다(그 동작은 원래 내 키를 받음).
export function assignKey(keymap: Keymap, action: KeyAction, code: string): AssignResult {
  if (isReserved(code)) return { ok: false, error: `${keyLabel(code)} 는 이동·채팅 등에 쓰는 키라 고를 수 없어요.` }
  const other = (Object.keys(keymap) as KeyAction[]).find((a) => a !== action && keymap[a] === code) ?? null
  const next = { ...keymap, [action]: code }
  if (other) next[other] = keymap[action]
  return { ok: true, keymap: next, swapped: other }
}

// 저장해 둔 값을 읽어 기본값과 합칩니다. 이상한 값(쓸 수 없는 키, 겹침)이 있으면 기본값으로 돌립니다.
export function sanitize(raw: unknown): Keymap {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_KEYMAP }
  const merged = { ...DEFAULT_KEYMAP }
  for (const a of Object.keys(DEFAULT_KEYMAP) as KeyAction[]) {
    const v = (raw as Record<string, unknown>)[a]
    if (typeof v === 'string' && !isReserved(v)) merged[a] = v
  }
  const codes = Object.values(merged)
  return new Set(codes).size === codes.length ? merged : { ...DEFAULT_KEYMAP }
}

// ── 이 브라우저에 기억하는 지금 키 ─────────────────────────────
const STORAGE_KEY = 'dooteum.keymap'
const listeners = new Set<() => void>()

function load(): Keymap {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? sanitize(JSON.parse(saved)) : { ...DEFAULT_KEYMAP }
  } catch {
    return { ...DEFAULT_KEYMAP }
  }
}

let current = load()

export const getKeymap = () => current

export function setKeymap(next: Keymap) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 기억하지 못해도 이번 접속에서는 바뀐 키를 씁니다.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 키 표시가 바뀌면 다시 그리도록 지금 키를 읽습니다.
export function useKeymap(): Keymap {
  return useSyncExternalStore(subscribe, getKeymap)
}
