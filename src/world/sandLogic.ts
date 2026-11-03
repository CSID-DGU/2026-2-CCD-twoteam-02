// 해변 모래 글씨·그림의 자리·수명·제한. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//   mark(글씨판) 한 장은 바닥의 BOARD.size 정사각형이고, 그 안의 획·글자(op)를 0~1 좌표로 담습니다.
//   DB 에 저장하지 않고 실시간 전송만 씁니다. 메시지는 누구나 보낼 수 있으므로 받을 때 readMsg 로 다시 검사합니다.
import { BANNED_WORDS, normalizeNickname } from '../auth/nicknameRules'
import { onSand } from './beachLogic'
import { handFontFromDb } from '../planner/handFonts'
import type { HandFontId } from '../planner/handFonts'

export const LIFE_MS = 60000 // 남긴 뒤 사라지기까지 1분
const FADE_MS = 6000 // 마지막에 옅어지는 시간
export const BOARD = { size: 4, ahead: 2.2 } // 글씨판 한 변(m), 내 앞으로 떨어진 거리(m)
export const LIMIT = { text: 20, points: 240, ops: 60, perPerson: 3, total: 24 } // 글자 수, 획 하나 좌표 수(x·y 합), 판 하나 획·글자 수, 한 사람 판 수, 해변 전체 판 수
const ID_MAX = 48
const WORLD_MAX = 500 // 좌표가 이보다 크면 잘못된 메시지

type P = { x: number; z: number }
export type SandOp = { t: 'line'; p: number[] } | { t: 'text'; s: string; u: number; v: number; f: HandFontId } // f: 쓴 사람의 손글씨 글씨체
export type SandMsg = { id: string; by: string; x: number; z: number; rot: number; age: number; op: SandOp }
export type SandMark = { id: string; by: string; x: number; z: number; rot: number; at: number; ops: SandOp[] }

// 내 앞 글씨판 가운데. heading 은 WalkCamera 와 같음(앞 = sin, cos). rot 는 판을 돌리는 각도(판의 위쪽이 내 앞)
export function boardAt(me: P, heading: number) {
  return { x: me.x + Math.sin(heading) * BOARD.ahead, z: me.z + Math.cos(heading) * BOARD.ahead, rot: heading + Math.PI }
}

// 쓸 수 있는 자리: 내가 모래 위이고 판 가운데도 모래 위 (물·나무 산책로 제외)
export function canWrite(me: P, heading: number, beach: { shoreZ: number }, size: { w: number; d: number }): boolean {
  const c = boardAt(me, heading)
  const dry = (p: P) => p.z > beach.shoreZ && onSand(p.x, p.z, size) && Math.abs(p.x) < size.w / 2 - 1 && Math.abs(p.z) < size.d / 2 - 1
  return dry(me) && dry(c)
}

// 땅 위 점 → 판 좌표(0~1, 그림의 왼쪽 위가 0). 판 밖이면 null
export function toBoard(b: { x: number; z: number; rot: number }, p: P) {
  const dx = p.x - b.x
  const dz = p.z - b.z
  const c = Math.cos(b.rot)
  const s = Math.sin(b.rot)
  const u = (c * dx - s * dz) / BOARD.size + 0.5
  const v = (s * dx + c * dz) / BOARD.size + 0.5
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v }
}

// 보이는 정도: 1 또렷함 ~ 0 사라짐
export function markAlpha(at: number, now: number): number {
  const left = at + LIFE_MS - now
  if (left <= 0) return 0
  return left >= FADE_MS ? 1 : left / FADE_MS
}

// 글자 다듬기: 앞뒤 공백 제거, 길이 제한. 비었거나 금칙어(닉네임과 같은 목록)면 null
export function cleanText(raw: string): string | null {
  const s = raw.trim().slice(0, LIMIT.text)
  if (!s) return null
  const flat = normalizeNickname(s)
  return BANNED_WORDS.some((w) => flat.includes(w)) ? null : s
}

const unit = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1
const coord = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < WORLD_MAX
const name = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= ID_MAX

function readOp(o: unknown): SandOp | null {
  const op = o as { t?: unknown; p?: unknown; s?: unknown; u?: unknown; v?: unknown; f?: unknown } | null
  if (!op || typeof op !== 'object') return null
  if (op.t === 'line') {
    const p = op.p
    if (!Array.isArray(p) || p.length < 4 || p.length > LIMIT.points || p.length % 2 || !p.every(unit)) return null
    return { t: 'line', p: p as number[] }
  }
  if (op.t === 'text' && typeof op.s === 'string' && unit(op.u) && unit(op.v)) {
    const s = cleanText(op.s)
    return s ? { t: 'text', s, u: op.u, v: op.v, f: handFontFromDb(op.f) } : null
  }
  return null
}

// 받은 메시지 검사. 잘못됐으면 null (다른 사람이 보낸 값은 믿지 않음)
export function readMsg(raw: unknown): SandMsg | null {
  const m = raw as Partial<SandMsg> | null
  if (!m || typeof m !== 'object' || !name(m.id) || !name(m.by) || !coord(m.x) || !coord(m.z) || !coord(m.rot) || typeof m.age !== 'number') return null
  if (!Number.isFinite(m.age) || m.age >= LIFE_MS) return null
  const op = readOp(m.op)
  return op ? { id: m.id, by: m.by, x: m.x, z: m.z, rot: m.rot, age: Math.max(0, m.age), op } : null
}

// 획·글자 하나를 목록에 더함. 새로 쓰면 그 판의 1분이 다시 시작. 한 사람·전체 수를 넘으면 가장 오래된 판부터 뺌
export function addOp(marks: SandMark[], m: SandMsg, now: number): SandMark[] {
  const at = now - m.age
  const found = marks.find((k) => k.id === m.id)
  let next: SandMark[]
  if (found) {
    if (found.ops.length >= LIMIT.ops) return marks
    next = marks.map((k) => (k === found ? { ...k, at: Math.max(k.at, at), ops: [...k.ops, m.op] } : k))
  } else {
    next = [...marks, { id: m.id, by: m.by, x: m.x, z: m.z, rot: m.rot, at, ops: [m.op] }]
  }
  const oldest = (list: SandMark[]) => list.reduce((a, b) => (b.at < a.at ? b : a))
  const mine = next.filter((k) => k.by === m.by)
  if (mine.length > LIMIT.perPerson) {
    const drop = oldest(mine)
    next = next.filter((k) => k !== drop)
  }
  if (next.length > LIMIT.total) {
    const drop = oldest(next)
    next = next.filter((k) => k !== drop)
  }
  return next
}

export const pruneMarks = <T extends { at: number }>(marks: T[], now: number): T[] => marks.filter((k) => k.at + LIFE_MS > now)
