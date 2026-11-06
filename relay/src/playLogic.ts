// 위치 방에서 같이 노는 것(캠퍼스 축구공, 해변 모래 글씨)의 값 검사 (Cloudflare·화면과 무관한 순수 로직) (#473)
//
// 예전에는 축구공(campus-ball)·모래 글씨(beach-sand)마다 Supabase 방을 따로 썼다. 위치 방에는 같은 채널 사람이 이미 모여 있으므로
// 같은 연결로 주고받는다. 새로 온 사람의 "공·글씨 어디 있어요?"(need)는 서버가 가장 오래 있던 한 사람에게만 넘기고,
// 그 사람은 물어본 사람에게만 답한다. 예전처럼 아는 사람 전원이 답하지 않는다.
//
//   {t:'p', e:'ball', p:공}                 공 상태 (찬 사람이 보냄) → 방 전원, to 가 있으면 그 연결에만(need 의 답)
//   {t:'p', e:'ball-need'}                  공 상태를 물음 → 서버가 한 사람에게 {t:'p', e, r:물어본 연결}
//   {t:'p', e:'sand-op', p:획·글자 하나}    → 방 전원
//   {t:'p', e:'sand-mark', p:판 하나, to}   need 의 답 → 물어본 연결에만
//   {t:'p', e:'sand-need'}                  → 서버가 한 사람에게
//
// 값은 아는 칸만 골라 새 객체로 옮긴다(relayLogic 과 같은 원칙). 자세한 검사는 받는 화면도 한 번 더 한다(sandLogic.readMsg).

// ── 기준값 ───────────────────────────────────────────────────────────
export const PLAY_SOFT_PER_SEC = 20 // 연결당 초당 이만큼까지 처리 (위치와 따로 센다). 공을 찬 사람은 초당 약 7번 보낸다
export const PLAY_HARD_PER_SEC = 60 // 이만큼 넘게 보내면 끊는다. need 의 답으로 판 12개를 한 번에 보낼 수 있게 여유를 둔다
export const PLAY_MAX_BYTES = 4096 // 방 전원에게 가는 것의 크기 상한 (획 하나는 좌표 240개, 약 2KB)
export const PLAY_REPLY_MAX_BYTES = 65536 // 한 사람에게만 가는 답(판 하나, 획 여러 개)의 크기 상한

const SAND = { text: 20, points: 240, ops: 60, name: 48, font: 32 } // 화면 src/world/sandLogic.ts 의 LIMIT 과 같게
const LIFE_MS = 60000 // 판이 사라지기까지 (sandLogic 과 같다)
const MAX_OWNER = 32 // 공 주인(탭 구분 글자) 길이 상한
const MAX_COORD = 500

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const coord = (v: unknown): v is number => num(v) && Math.abs(v) <= MAX_COORD
const shortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

export type PlayEvent = 'ball' | 'ball-need' | 'sand-op' | 'sand-mark' | 'sand-need'
export type PlayRoute = 'all' | 'reply' | 'need' // 방 전원, 물어본 연결 하나, 서버가 고른 한 사람

export function routeOf(e: PlayEvent, hasTo: boolean): PlayRoute {
  if (e === 'ball-need' || e === 'sand-need') return 'need'
  if (e === 'sand-mark') return 'reply'
  return e === 'ball' && hasTo ? 'reply' : 'all'
}

function cleanBall(p: Record<string, unknown>) {
  if (!coord(p.x) || !coord(p.z) || !num(p.vx) || !num(p.vz) || Math.abs(p.vx) > 50 || Math.abs(p.vz) > 50) return null
  if (!shortText(p.owner, MAX_OWNER)) return null
  const ball: Record<string, unknown> = { x: p.x, z: p.z, vx: p.vx, vz: p.vz, owner: p.owner }
  if (p.goal === 'north' || p.goal === 'south') ball.goal = p.goal
  return ball
}

function cleanOp(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'object' || v === null) return null
  const op = v as Record<string, unknown>
  if (op.t === 'line') {
    if (!Array.isArray(op.p) || op.p.length < 2 || op.p.length > SAND.points || !op.p.every(num)) return null
    return { t: 'line', p: op.p }
  }
  if (op.t === 'text') {
    if (!shortText(op.s, SAND.text) || !num(op.u) || !num(op.v) || !shortText(op.f, SAND.font)) return null
    return { t: 'text', s: op.s, u: op.u, v: op.v, f: op.f }
  }
  return null
}

// 판의 자리(아이디·쓴 사람·위치·나이)
function cleanBoard(p: Record<string, unknown>) {
  if (!shortText(p.id, SAND.name) || !shortText(p.by, SAND.name) || !coord(p.x) || !coord(p.z) || !coord(p.rot)) return null
  if (!num(p.age) || p.age < 0 || p.age >= LIFE_MS) return null
  return { id: p.id, by: p.by, x: p.x, z: p.z, rot: p.rot, age: p.age }
}

// 이벤트마다 아는 칸만 남긴다. 모르는 이벤트나 틀린 값이면 null
export function sanitizePlay(e: unknown, value: unknown): { e: PlayEvent; p: Record<string, unknown> } | null {
  const p = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  switch (e) {
    case 'ball-need':
    case 'sand-need':
      return { e, p: {} }
    case 'ball': {
      const ball = cleanBall(p)
      return ball ? { e, p: ball } : null
    }
    case 'sand-op': {
      const board = cleanBoard(p)
      const op = cleanOp(p.op)
      return board && op ? { e, p: { ...board, op } } : null
    }
    case 'sand-mark': {
      const board = cleanBoard(p)
      if (!board || !Array.isArray(p.ops) || p.ops.length === 0 || p.ops.length > SAND.ops) return null
      const ops = p.ops.map(cleanOp)
      return ops.every((op) => op !== null) ? { e, p: { ...board, ops } } : null
    }
    default:
      return null
  }
}

// need 를 넘길 사람: 물어본 사람이 아니고 가장 오래 있던 연결 (공·글씨 상태를 알고 있을 가능성이 가장 높다)
export function pickResponder<T extends { conn: string; joinedAt: number }>(candidates: T[], asker: string): T | null {
  let best: T | null = null
  for (const c of candidates) if (c.conn !== asker && (!best || c.joinedAt < best.joinedAt)) best = c
  return best
}
