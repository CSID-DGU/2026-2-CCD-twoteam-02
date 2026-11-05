// 중계 서버의 판정·값 검사 (Cloudflare·화면과 무관한 순수 로직) (#451)
//
// 클라이언트가 보낸 값은 믿지 않는다. 아는 칸만 골라 새 객체로 옮기고, userId 는 토큰에서 꺼낸 값으로 넣는다.
// 그래서 메시지에 남의 userId 를 적어 보내도 남을 사칭할 수 없고, 모르는 칸을 실어 남에게 퍼뜨릴 수도 없다.

// ── 기준값 ───────────────────────────────────────────────────────────
export const TICK_MS = 100 // 받은 변경을 이 간격으로 합쳐 내보낸다
export const CHANNEL_CAPACITY = 20 // 광장·캠퍼스·해변 채널 하나의 정원 (#442). FPS 측정 결과에 따라 조정한다
export const MAX_ROOM_CONNECTIONS = 100 // 채널로 나누지 않는 방(지점)의 정원. ROOM_MAX_CONNECTIONS 환경 변수로 시험 때만 바꾼다
export const MAX_WATCH_CONNECTIONS = 100 // 방마다 보기 전용 연결의 상한. 정원과 따로 세어 창문을 보는 사람이 입장을 막지 않게 한다 (#442)
export const MAX_CONNECTIONS_PER_USER = 3 // 한 사람이 한 방에 동시에 둘 수 있는 연결(종류별). 넘으면 가장 오래된 것을 닫는다
export const MAX_MESSAGE_BYTES = 2048 // 메시지 하나의 크기 상한. 걷는 사람의 위치 메시지는 약 200바이트다
export const SOFT_MESSAGES_PER_SEC = 10 // 연결당 초당 이만큼까지 처리한다. 넘은 메시지는 버린다 (앱은 초당 4회)
export const HARD_MESSAGES_PER_SEC = 40 // 이만큼 넘게 보내면 연결을 끊는다
export const STALE_CONNECTION_MS = 120000 // 이 시간 동안 메시지도 ping 도 없는 연결은 죽은 것으로 보고 닫는다 (탭이 숨으면 타이머가 1분에 1번까지 느려진다)
export const SWEEP_INTERVAL_MS = 15000 // 죽은 연결을 찾는 간격. 내보낼 때 곁들여 하므로 따로 깨우지 않는다

const MAX_SHORT_TEXT = 32 // status·emote 같은 짧은 글자의 길이 상한
const MAX_USER_ID = 64 // 계정 번호 길이 상한(UUID 는 36자)

// 닫을 때 쓰는 번호. 4000번대는 응용이 자유롭게 쓰는 구간이다.
export const CLOSE_TOO_BIG = 1009
export const CLOSE_NOT_TEXT = 1003
export const CLOSE_TOKEN_EXPIRED = 4401
export const CLOSE_REPLACED = 4409
export const CLOSE_STALE = 4408
export const CLOSE_TOO_FAST = 4429
export const CLOSE_FULL = 4503

// 중계할 수 있는 방. 회의(meeting:*)는 DB 정책이 참석자를 확인하는 비공개 방이라 여기로 오지 않는다.
// 이름을 제한하지 않으면 로그인한 누구나 객체를 무한히 만들 수 있다.
// 광장·캠퍼스·해변은 채널로 나뉜다. 1번 채널은 이름 그대로(lobby), 2번부터 lobby:2 처럼 쓴다 (#442).
const ROOM_PATTERN = /^(branch:\d{1,6}|(lobby|campus|beach)(:([2-9]|[1-9]\d{1,2}))?)$/
export const isAllowedRoom = (room: string) => ROOM_PATTERN.test(room)

// 이 방의 정원. override 는 시험용 환경 변수 값이다.
export function capacityOf(room: string, override?: string): number {
  return Number(override) || (room.startsWith('branch:') ? MAX_ROOM_CONNECTIONS : CHANNEL_CAPACITY)
}

// 새 연결을 받을 자리가 있는지. 활동 연결과 보기 전용 연결은 서로의 자리를 차지하지 않는다.
export function hasRoom(watch: boolean, active: number, watching: number, capacity: number): boolean {
  return watch ? watching < MAX_WATCH_CONNECTIONS : active < capacity
}

export type RelayState = Record<string, unknown> & { userId: string; x: number; z: number }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown, length: number): v is number[] => Array.isArray(v) && v.length === length && v.every(isNum)
const isShortText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_SHORT_TEXT

// 위치 메시지의 칸을 검사한다. 필수 칸이 틀리면 null(버림), 선택 칸이 틀리면 그 칸만 뺀다.
// 칸 목록은 src/realtime/participants.ts 의 PresenceState 와 같다.
export function sanitizeState(userId: string, raw: unknown): RelayState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  if (!isNum(s.x) || !isNum(s.z)) return null
  const clean: RelayState = {
    userId, // 메시지에 적힌 값이 아니라 토큰의 값
    x: s.x,
    z: s.z,
    seat: isNum(s.seat) ? s.seat : null,
    status: isShortText(s.status) ? s.status : 'idle',
  }
  for (const key of ['h', 'mouth', 'emoteSeq', 'jump', 'sync', 'lv']) if (isNum(s[key])) clean[key] = s[key]
  for (const key of ['eyes', 'mic']) if (typeof s[key] === 'boolean') clean[key] = s[key]
  if (isVec(s.head, 3)) clean.head = s.head
  if (isShortText(s.emote)) clean.emote = s.emote
  if (s.nf === true) clean.nf = true
  if (Array.isArray(s.arms) && s.arms.length === 2 && s.arms.every((a) => a === null || isVec(a, 3))) clean.arms = s.arms
  return clean
}

// 위치 외 메시지. 받는 쪽 코드가 쓰는 형태 그대로, 보낸 사람 칸만 토큰 값으로 채운다.
//   flick   딱밤. 맞은 사람(to)이 친구·거리로 다시 확인한다
//   profile 캐릭터를 바꿨으니 DB 에서 다시 읽으라는 신호. 값은 싣지 않는다
export function sanitizeEvent(userId: string, event: unknown, payload: unknown): { e: string; p: Record<string, unknown> } | null {
  if (event === 'profile') return { e: 'profile', p: { userId } }
  if (event === 'flick') {
    const to = (payload as { to?: unknown } | null)?.to
    if (typeof to !== 'string' || to.length === 0 || to.length > MAX_USER_ID) return null
    return { e: 'flick', p: { from: userId, to } }
  }
  return null
}

// 연결당 초당 메시지 세기. 1초 칸마다 새로 센다.
export type RateWindow = { startedAt: number; count: number }

export type RateVerdict = 'ok' | 'drop' | 'close'

export function countMessage(window: RateWindow, now: number): RateVerdict {
  if (now - window.startedAt >= 1000) {
    window.startedAt = now
    window.count = 0
  }
  window.count++
  if (window.count > HARD_MESSAGES_PER_SEC) return 'close'
  return window.count > SOFT_MESSAGES_PER_SEC ? 'drop' : 'ok'
}

// 이번에 내보낼 때까지 기다릴 시간. 0 이면 바로 내보낸다.
// 틱이 이미 지났으면 타이머 없이 바로 보낸다. 대기 중인 타이머가 있으면 객체가 잠들지 못해 그 시간만큼 요금(duration)이 든다.
export function flushDelay(lastFlushAt: number, now: number): number {
  return Math.max(0, TICK_MS - (now - lastFlushAt))
}
