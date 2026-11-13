// 중계 서버의 판정·값 검사 (Cloudflare·화면과 무관한 순수 로직) (#451)
//
// 클라이언트가 보낸 값은 믿지 않는다. 아는 칸만 골라 새 객체로 옮기고, userId 는 토큰에서 꺼낸 값으로 넣는다.
// 그래서 메시지에 남의 userId 를 적어 보내도 남을 사칭할 수 없고, 모르는 칸을 실어 남에게 퍼뜨릴 수도 없다.

// ── 기준값 ───────────────────────────────────────────────────────────
export const TICK_MS = 100 // 받은 변경을 이 간격으로 합쳐 내보낸다
export const CHANNEL_CAPACITY = 20 // 채널(세계) 하나의 정원 (#442, #481). 광장·카페·캠퍼스·해변·일반 페이지에 있는 사람을 모두 합쳐 센다. 직접 고르거나 친구를 따라갈 때는 여기까지 들어간다
export const AUTO_FILL = 15 // 처음 들어올 때 자동 배정은 채널마다 여기까지만 채운다. 남은 자리는 친구끼리 모일 여유분이다
export const BASE_CHANNELS = 6 // 채널 목록에 늘 보이는 채널 수. 마지막 채널까지 AUTO_FILL 만큼 차면 하나씩 더 연다
export const TOTAL_CAPACITY = 100 // 서비스 전체 인원 상한 (#442). 채팅이 Supabase 에 남아 접속자마다 연결이 하나씩 열려, Free 동시 연결 200개의 절반으로 둔다 (#473 접속 표시 이전 뒤 50 → 100)
export const SEAT_HOLD_MS = 15000 // 채널을 안내받은 사람의 자리를 입장할 때까지 맡아 두는 시간
export const MAX_CHANNEL_NO = 999
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
// 지점도 채널마다 따로다 (#481). 1번은 branch:5, 2번부터 branch:5:2
const ROOM_PATTERN = /^(branch:\d{1,6}|lobby|campus|beach)(:([2-9]|[1-9]\d{1,2}))?$/
export const isAllowedRoom = (room: string) => ROOM_PATTERN.test(room)

// 이 방의 정원. override 는 시험용 환경 변수 값이다.
export function capacityOf(room: string, override?: string): number {
  return Number(override) || (room.startsWith('branch:') ? MAX_ROOM_CONNECTIONS : CHANNEL_CAPACITY)
}

// ── 채널 배정 (#442, #481) ───────────────────────────────────────────
//
// 채널은 하나의 세계다. 1채널 사람은 광장·카페·캠퍼스·해변·회의실 어디에 있든 1채널 사람만 본다.
// 그래서 정원은 장소가 아니라 채널 전체로 센다. 사람마다의 채널은 접속 표시 방(online.ts)이 탭마다 받은 값으로 안다.
// 일반 페이지(내 기록·친구·프로필)에 있는 사람도 마지막으로 있던 채널의 인원이다.

export const CHANNEL_WORLDS = ['lobby', 'campus', 'beach', 'branch']
export const isChannelWorld = (world: string) => CHANNEL_WORLDS.includes(world)
export const channelRoom = (world: string, no: number) => (no === 1 ? world : `${world}:${no}`)

export type Holds = Map<string, { no: number; until: number }> // 사람별 맡아 둔 채널 (안내받고 들어가기 전까지)
export type Members = Map<string, number> // 계정 번호 → 지금 채널

function dropExpired(holds: Holds, now: number) {
  for (const [id, hold] of holds) if (hold.until <= now) holds.delete(id)
}

// 채널별 인원. 맡아 둔 자리도 센다(이미 그 채널에 있는 사람의 것은 빼서 두 번 세지 않는다). except 는 빼고 센다
export function channelTally(members: Members, holds: Holds, except?: string): Map<number, number> {
  const tally = new Map<number, number>()
  for (const [id, no] of members) if (id !== except) tally.set(no, (tally.get(no) ?? 0) + 1)
  for (const [id, hold] of holds) if (id !== except && members.get(id) !== hold.no) tally.set(hold.no, (tally.get(hold.no) ?? 0) + 1)
  return tally
}

export function totalCount(members: Members, holds: Holds, now: number): number {
  dropExpired(holds, now)
  let total = members.size
  for (const id of holds.keys()) if (!members.has(id)) total++
  return total
}

// 채널 목록. 1번부터 BASE_CHANNELS 개는 늘 보이고, 마지막 채널까지 AUTO_FILL 만큼 차면 다음 번호를 연다.
// 그 뒤 번호라도 사람이 있으면 목록에 넣는다. 화면마다 목록이 달라 보이지 않게 서버가 정한다.
export function channelCounts(tally: Map<number, number>): { no: number; count: number }[] {
  let open = BASE_CHANNELS
  const filled = (n: number) => (tally.get(n) ?? 0) >= AUTO_FILL
  while (open < MAX_CHANNEL_NO && Array.from({ length: open }, (_, i) => i + 1).every(filled)) open++
  const list: { no: number; count: number }[] = []
  for (let no = 1; no <= open; no++) list.push({ no, count: tally.get(no) ?? 0 })
  for (const [no, count] of tally) if (no > open && count > 0) list.push({ no, count })
  return list.sort((a, b) => a.no - b.no)
}

// 배정 방식
//   auto: 처음 들어올 때. 1번부터 AUTO_FILL 미만인 첫 채널
//   keep: 장소를 옮기거나 새로고침할 때 기억한 채널. 내가 이미 그 채널 인원이면 그대로, 아니면 정원 미만일 때 그대로, 가득 찼으면 auto
//   pick: 목록에서 고르기·친구 따라가기·부르기. 정원 미만이면 그 채널, 아니면 full (다른 채널로 몰래 보내지 않는다)
export type AssignMode = 'auto' | 'keep' | 'pick'
// 배정 결과. no: 들어갈 채널, wait: 전체 상한이라 입장 대기, full: 고른 채널이 가득 참(pick 만, 지금 채널에 그대로 둠)
export type AssignResult = { no: number } | { wait: true } | { full: true }

// 이미 채널이 있는 사람(일반 페이지에 있다 돌아온 사람 포함)은 전체 상한에 걸리지 않는다.
export function assignChannel(want: number | null, mode: AssignMode, userId: string, members: Members, holds: Holds, now: number, totalCapacity = TOTAL_CAPACITY): AssignResult {
  dropExpired(holds, now)
  const held = holds.get(userId)
  holds.delete(userId) // 다시 물으면 예전 맡기는 놓는다
  const mine = members.get(userId)
  if (mine === undefined && totalCount(members, holds, now) >= totalCapacity) {
    if (held) holds.set(userId, held)
    return { wait: true }
  }
  const tally = channelTally(members, holds, userId)
  const count = (no: number) => tally.get(no) ?? 0
  const hold = (no: number): AssignResult => {
    holds.set(userId, { no, until: now + SEAT_HOLD_MS })
    return { no }
  }
  const wanted = want !== null && Number.isInteger(want) && want >= 1 && want <= MAX_CHANNEL_NO ? want : null
  if (mode === 'pick') {
    if (wanted !== null && count(wanted) < CHANNEL_CAPACITY) return hold(wanted)
    if (held) holds.set(userId, held)
    return { full: true }
  }
  if (mode === 'keep' && wanted !== null && (mine === wanted || count(wanted) < CHANNEL_CAPACITY)) return hold(wanted)
  for (let no = 1; no <= MAX_CHANNEL_NO; no++) if (count(no) < AUTO_FILL) return hold(no)
  return { wait: true }
}

// 새 연결을 받을 자리가 있는지. 활동 연결과 보기 전용 연결은 서로의 자리를 차지하지 않는다.
// 활동 연결은 연결 수가 아니라 사람 수로 센다 (#515). 이미 방에 연결이 있는 사람은 새 사람이 아니라서 받는다:
//   와이파이가 끊겼다 다시 붙으면 서버는 아직 옛 연결을 살아 있는 것으로 본다(소식 없음 2분 뒤에야 닫음).
//   연결 수로 세면 그 옛 연결 때문에 꽉 찬 방에서 거절되어 다음 채널로 밀렸다. 탭을 두 개 연 사람도 두 명으로 잡혔다.
// conns: 방에 남아 있는 연결들 (이미 정리한 연결은 빼고 넘긴다)
export function hasRoom(watch: boolean, userId: string, conns: { userId: string; watch: boolean }[], capacity: number): boolean {
  if (watch) return conns.filter((c) => c.watch).length < MAX_WATCH_CONNECTIONS
  const people = new Set(conns.filter((c) => !c.watch).map((c) => c.userId))
  return people.has(userId) || people.size < capacity
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

export function countMessage(window: RateWindow, now: number, soft = SOFT_MESSAGES_PER_SEC, hard = HARD_MESSAGES_PER_SEC): RateVerdict {
  if (now - window.startedAt >= 1000) {
    window.startedAt = now
    window.count = 0
  }
  window.count++
  if (window.count > hard) return 'close'
  return window.count > soft ? 'drop' : 'ok'
}

// 이번에 내보낼 때까지 기다릴 시간. 0 이면 바로 내보낸다.
// 틱이 이미 지났으면 타이머 없이 바로 보낸다. 대기 중인 타이머가 있으면 객체가 잠들지 못해 그 시간만큼 요금(duration)이 든다.
export function flushDelay(lastFlushAt: number, now: number, tick = TICK_MS): number {
  return Math.max(0, tick - (now - lastFlushAt))
}
