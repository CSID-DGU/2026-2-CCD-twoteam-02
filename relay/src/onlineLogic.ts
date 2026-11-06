// 접속 표시 방의 판정·값 검사 (Cloudflare·화면과 무관한 순수 로직) (#473)
//
// 접속 표시는 위치와 달리 들어올 때와 있는 곳·공부 중 여부가 바뀔 때만 바뀐다.
// 그래서 1초에 한 번만 모아 내보내고, 연결 상한은 위치 방보다 크게 둔다.
// 값은 아는 칸만 골라 새 객체로 옮긴다(relayLogic 과 같은 원칙). 계정 번호는 토큰에서 꺼낸 값을 쓴다.

// ── 기준값 ───────────────────────────────────────────────────────────
export const ONLINE_NAME = 'global' // 접속 표시 방은 서비스 전체에 하나
export const ONLINE_TICK_MS = 1000 // 받은 변경을 이 간격으로 합쳐 내보낸다
export const ONLINE_MAX_CONNECTIONS = 1000 // 방 전체 연결 상한 (탭마다 하나). 목표 동시 접속 200명에 여유를 둔다
export const ONLINE_MAX_PER_USER = 8 // 한 계정이 동시에 열 수 있는 탭. 넘으면 소식이 가장 오래 없는 탭을 닫는다 (#347 탭 양보는 여러 탭을 본다)

const PLACE_PATTERN = /^[a-z0-9:-]{1,40}$/ // 'lobby', 지점 slug, 'meeting:byeol', 'elsewhere'
const TAB_PATTERN = /^[a-z0-9]{1,16}$/
const MAX_CHANNEL_NO = 999

// 화면(OnlineProvider)이 올리는 내 상태
export type OnlineMeta = {
  place: string
  studying: boolean
  quiet: boolean
  tab: string
  since: number
  scene: boolean
  channel?: number
}

// 내보내는 한 줄: [연결 번호, 계정 번호, 상태]. 연결 번호는 서버가 정해 탭을 구분한다
export type OnlineEntry = [string, string, OnlineMeta]

export function sanitizeMeta(value: unknown): OnlineMeta | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.place !== 'string' || !PLACE_PATTERN.test(v.place)) return null
  if (typeof v.tab !== 'string' || !TAB_PATTERN.test(v.tab)) return null
  if (typeof v.since !== 'number' || !Number.isFinite(v.since) || v.since < 0) return null
  const meta: OnlineMeta = {
    place: v.place,
    studying: v.studying === true,
    quiet: v.quiet === true,
    tab: v.tab,
    since: v.since,
    scene: v.scene === true,
  }
  if (typeof v.channel === 'number' && Number.isInteger(v.channel) && v.channel >= 1 && v.channel <= MAX_CHANNEL_NO) meta.channel = v.channel
  return meta
}

// 두 상태가 같은지. 같은 값을 다시 보내면 내보내지 않는다
export function sameMeta(a: OnlineMeta | null, b: OnlineMeta): boolean {
  return a !== null && a.place === b.place && a.studying === b.studying && a.quiet === b.quiet && a.tab === b.tab && a.since === b.since && a.scene === b.scene && a.channel === b.channel
}
