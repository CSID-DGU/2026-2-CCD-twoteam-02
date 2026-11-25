// 같이 공부하는 봇 (#50). 화면·React와 무관한 순수 계산입니다.
//
// 봇은 DB 의 진짜 계정이고, 1분마다 도는 예약 작업(0075 의 bot_tick)이 자리를 잡고 공부 기록을 남깁니다.
// 화면은 bot_presence() 로 현황(어느 자리에, 언제 도착하고 언제 떠나는지)을 읽어, 실제 참여자처럼 그리기만 합니다.
//
//   도착 전 (arrive_at − 걷는 시간 이전)      안 보임
//   걸어 들어옴 (arrive_at 직전 걷는 시간)     입구(바깥은 자리 뒤)에서 자리까지 걸어옴
//   공부 (arrive_at ~ until_at)               자리에 앉아 초록불. 고개가 천천히 움직이고 눈을 깜빡임
//   걸어 나감 (until_at 또는 left_at 부터)    자리에서 입구로 걸어 나감
//   그 뒤                                      안 보임 (쉬는 중이거나 나감)
//
// 시각은 서버 시각 기준이라, 읽을 때 받은 서버 시각과 내 시계의 차이(offset)를 더해 씁니다.
import type { PresenceState } from '../realtime/participants'
import type { Spot } from '../space/layout'

export const BOT_POLL_MS = 15_000 // 봇 현황을 다시 읽는 간격. 도착 45초 전에 자리를 잡으므로(0075) 걸어 들어오는 모습을 놓치지 않음
export const BOT_TICK_MS = 250 // 상태를 다시 계산하는 간격 (실제 사람이 위치를 보내는 간격과 같음)
export const BOT_WALK_SPEED = 2.2 // 걷는 빠르기(m/초). 사람 걷기(4)보다 느긋하게 (실험 봇과 같음)
export const WALK_AWAY = 5 // 바깥에서 자리 뒤로 걸어가는 거리(m)
const STAND_BACK = 0.8 // 일어나서 먼저 의자 뒤로 물러서는 거리(m)
const MAX_WALK_MS = 15_000 // 걷는 시간 상한 (입구가 아주 멀어도)
const BLINK_MS = 150 // 눈 깜빡임 한 번의 길이

export type BotState = 'studying' | 'break' | 'off'

// bot_presence() 한 줄을 화면에서 쓰는 모양으로 (시각은 ms)
export type BotRow = {
  id: string
  nickname: string
  avatar: unknown // profiles.avatar (avatarFromDb 로 읽음)
  state: BotState
  slug: string | null // 지금(쉬는 중이면 마지막) 장소 = 지점 slug, 광장은 plaza
  seat: number | null // DB 좌석 번호
  arriveAt: number | null
  untilAt: number | null
  leftAt: number | null
}

export type BotPresence = { rows: BotRow[]; offset: number; at: number } // offset: 서버 시각 − 내 시계 (ms), at: 읽은 시각(내 시계)

const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

// bot_presence() 결과 읽기. 모양이 이상한 줄은 버립니다.
export function parseBotPresence(raw: unknown, localNow: number): BotPresence {
  const obj = (raw ?? {}) as { now?: unknown; bots?: unknown }
  const serverNow = time(obj.now)
  const rows: BotRow[] = []
  for (const b of Array.isArray(obj.bots) ? obj.bots : []) {
    const r = b as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.nickname !== 'string') continue
    if (r.state !== 'studying' && r.state !== 'break' && r.state !== 'off') continue
    rows.push({
      id: r.id,
      nickname: r.nickname,
      avatar: r.avatar,
      state: r.state,
      slug: typeof r.slug === 'string' ? r.slug : null,
      seat: typeof r.seat === 'number' ? r.seat : null,
      arriveAt: time(r.arrive_at),
      untilAt: time(r.until_at),
      leftAt: time(r.left_at),
    })
  }
  return { rows, offset: serverNow === null ? 0 : serverNow - localNow, at: localNow }
}

// 글자 → 32비트 정수 (FNV-1a). 봇마다 다른 고개 흔들림·깜빡임 간격을 정하는 데 씀
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 봇마다 다른 값(0 이상 1 미만) n 개. 같은 봇이면 누구 화면에서나 같음
function traits(id: string, n: number): number[] {
  let a = hashString(id)
  return Array.from({ length: n }, () => {
    a = (a + 0x6d2b79f5) >>> 0 // mulberry32 (WorldSky 의 seeded 와 같은 식)
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
}

const r2 = (v: number) => Math.round(v * 100) / 100 // 실제 사람이 보내는 값과 같은 자릿수

// 공부 중 고개: 책·화면을 보듯 아래로 숙이고(+), 좌우로 천천히 흔들림. [좌우, 위아래, 갸웃] 라디안
export function botHead(id: string, nowMs: number): [number, number, number] {
  const [a, b, c, d] = traits(id, 4).map((v) => v * Math.PI * 2)
  const t = nowMs / 1000
  const yaw = 0.18 * Math.sin(t / 9.1 + a) + 0.06 * Math.sin(t / 3.7 + b)
  const pitch = 0.3 + 0.12 * Math.sin(t / 11.3 + c) + 0.04 * Math.sin(t / 2.3 + d)
  const roll = 0.04 * Math.sin(t / 13.7 + b)
  return [r2(yaw), r2(pitch), r2(roll)]
}

// 3~6초마다 한 번 깜빡임
export function botBlinking(id: string, nowMs: number): boolean {
  const [period, phase] = traits(id, 6).slice(4)
  const every = 3_000 + Math.floor(period * 3_000)
  return (nowMs + Math.floor(phase * every)) % every < BLINK_MS
}

export type P2 = { x: number; z: number }

// 자리 뒤(앉아서 보는 방향의 반대쪽)로 dist 만큼 간 자리
export function behind(spot: Spot, dist: number): P2 {
  return { x: spot.x - Math.sin(spot.rot) * dist, z: spot.z - Math.cos(spot.rot) * dist }
}

// 자리에서 나가는 길: 자리 → 의자 뒤 → 나가는 곳. 나가는 곳이 없으면(바깥) 자리 뒤로 WALK_AWAY 만큼. 들어올 때는 거꾸로
export function exitPath(spot: Spot, exit: P2 | null): P2[] {
  return [{ x: spot.x, z: spot.z }, behind(spot, STAND_BACK), exit ?? behind(spot, WALK_AWAY)]
}

export const pathLength = (path: P2[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0)

export const walkMsOf = (path: P2[]) => Math.min((pathLength(path) / BOT_WALK_SPEED) * 1000, MAX_WALK_MS)

// 길을 따라 dist(m)만큼 간 자리와 가는 쪽 방향. 끝을 넘으면 마지막 자리
export function along(path: P2[], dist: number): P2 & { h: number } {
  let left = Math.max(0, dist)
  let h = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len > 0) h = Math.atan2(b.x - a.x, b.z - a.z)
    if (left <= len) {
      const k = len === 0 ? 1 : left / len
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h }
    }
    left -= len
  }
  const last = path[path.length - 1]
  return { x: last.x, z: last.z, h }
}

// 지금 이 봇이 보낼 상태. 안 보일 때는 null.
// spot: 이 화면에서 그 봇 자리(Player 자리 번호). exit: 걸어 나가고 들어오는 곳 (지점은 입구, 바깥은 null = 자리 뒤)
// serverNow: 서버 시각 기준 지금 (Date.now() + offset)
export function botPresenceState(row: BotRow, spot: Spot, exit: P2 | null, serverNow: number): PresenceState | null {
  const path = exitPath(spot, exit)
  const length = pathLength(path)
  const walkMs = walkMsOf(path)
  const walking = (k: number, comingIn: boolean): PresenceState => {
    const p = comingIn ? along([...path].reverse(), k * length) : along(path, k * length)
    return { userId: row.id, x: r2(p.x), z: r2(p.z), h: r2(p.h), seat: null, status: 'idle' }
  }
  // 떠나는 시각: 공부 중이면 예정된 끝(until_at, DB 가 1분 안에 따라옴), 쉬거나 나갔으면 실제로 떠난 시각
  const leaveAt = row.state === 'studying' ? row.untilAt : row.leftAt
  if (leaveAt !== null && serverNow >= leaveAt) {
    const since = serverNow - leaveAt
    return since < walkMs ? walking(since / walkMs, false) : null
  }
  if (row.state !== 'studying' || row.arriveAt === null) return null
  const toArrive = row.arriveAt - serverNow
  if (toArrive > walkMs) return null // 아직 안 옴
  if (toArrive > 0) return walking(1 - toArrive / walkMs, true)
  return { userId: row.id, x: r2(spot.x), z: r2(spot.z), h: r2(spot.rot), seat: spot.no, status: 'focus', head: botHead(row.id, serverNow), eyes: botBlinking(row.id, serverNow) }
}

// 접속 목록에 넣을 때: 공부·휴식 중이면 접속 중, 공부는 자리에 도착한 뒤부터
export const botOnline = (row: BotRow) => row.state !== 'off'
export const botStudying = (row: BotRow, serverNow: number) => row.state === 'studying' && row.arriveAt !== null && serverNow >= row.arriveAt

// 봇 장소(DB 지점 slug) → 접속 목록의 "있는 곳". 광장은 예전 로비 이름을 씁니다(src/realtime/online.ts 의 LOBBY_PLACE 등과 같은 값)
const OUTSIDE_PLACE: Record<string, string> = { plaza: 'lobby', campus: 'campus', beach: 'beach' }
export const botPlace = (slug: string) => OUTSIDE_PLACE[slug] ?? slug

export type BotOnlineEntry = { place: string; studying: boolean; quiet: boolean; channel: number }

// 접속 목록(실제 사람)에 지금 접속 중인 봇을 더한 새 목록. 봇이 없으면 받은 목록 그대로. 공부 중인지는 읽은 시각 기준(15초마다 갱신)
export function withBots<E>(people: Map<string, E>, presence: BotPresence, toEntry: (b: BotOnlineEntry) => E): Map<string, E> {
  const online = presence.rows.filter((r) => botOnline(r) && r.slug !== null && !people.has(r.id))
  if (online.length === 0) return people
  const serverNow = presence.at + presence.offset
  const out = new Map(people)
  for (const r of online) out.set(r.id, toEntry({ place: botPlace(r.slug!), studying: botStudying(r, serverNow), quiet: false, channel: 1 }))
  return out
}
