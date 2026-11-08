// C 조건의 팀원 캐릭터(봇) 움직임 (#195). 화면·React와 무관한 순수 계산입니다. (Node 로 검사)
//
// 참가자가 room C 에 들어온 순간이 0초입니다. 팀원은 한 명씩 조금 간격을 두고 문으로 들어와 자기 자리까지 걸어가 앉고,
// 앉은 뒤부터는 기록 파일(#190)의 값을 그대로 재생합니다. 참가자가 공부를 시작하는 것과는 상관없이 흐릅니다.
// (앉아 있던 캐릭터가 참가자의 조작에 맞춰 갑자기 움직이면 사람처럼 보이지 않기 때문)
import type { PresenceState } from '../realtime/participants'
import type { RecordFile } from '../recording/recordLogic'
import { stateAt } from './replayLogic'

export const ENTER_DELAY_MS = [6_000, 17_000, 31_000] // 참가자가 들어온 뒤 팀원이 문에 나타나는 시각 (한 명씩)
export const BOT_WALK_SPEED = 2.2 // 걷는 빠르기(m/초). 참가자 걷기(4)보다 느긋하게
export const APPROACH = 1.0 // 의자 뒤 이만큼 떨어진 곳까지 걸어간 뒤 자리에 앉음(m)

export type P2 = { x: number; z: number }
export type SeatSpot = P2 & { rot: number } // rot: 앉아서 바라보는 방향 (라디안, 0 이면 +Z)

// 문(spawn)에서 자리까지 걷는 길: 문 → 의자 뒤 → 의자
export function pathToSeat(spawn: P2, seat: SeatSpot): P2[] {
  const behind = { x: seat.x - Math.sin(seat.rot) * APPROACH, z: seat.z - Math.cos(seat.rot) * APPROACH }
  return [spawn, behind, { x: seat.x, z: seat.z }]
}

export const pathLength = (path: P2[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0)

export const walkMs = (path: P2[], speed = BOT_WALK_SPEED) => (pathLength(path) / speed) * 1000

// 길을 따라 dist(m)만큼 간 자리와 몸 방향(가는 쪽). 끝을 넘으면 마지막 자리
export function along(path: P2[], dist: number): P2 & { h: number } {
  let left = Math.max(0, dist)
  let h = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
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

export type Bot = { userId: string; record: RecordFile; seat: SeatSpot; enterAt: number } // enterAt: 문에 나타나는 시각(ms, 0 = 참가자 입장)

// 참가자가 들어온 지 elapsedMs 지났을 때 이 봇이 보낼 값. 아직 안 들어왔으면 null
export function botState(bot: Bot, spawn: P2, elapsedMs: number): PresenceState | null {
  const since = elapsedMs - bot.enterAt
  if (since < 0) return null
  const path = pathToSeat(spawn, bot.seat)
  const walking = walkMs(path)
  if (since < walking) {
    const p = along(path, (since / 1000) * BOT_WALK_SPEED)
    return { userId: bot.userId, x: p.x, z: p.z, h: p.h, seat: null, status: 'idle' }
  }
  return stateAt(bot.record, since - walking, bot.userId)
}
