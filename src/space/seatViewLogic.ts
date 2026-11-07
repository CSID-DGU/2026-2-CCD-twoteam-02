// 앉았을 때의 시점(#436): 1인칭과, 내 캐릭터를 밖에서 보는 3인칭 셋(뒤 위·오른쪽·왼쪽).
// React·three 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 3인칭 카메라는 내 머리(1인칭 눈 자리)를 가운데 둔 구면 좌표로 놓습니다.
//   dist: 머리에서 떨어진 거리(m), azimuth: 바로 뒤에서 오른쪽으로 돈 각도(라디안, 오른쪽 +), elevation: 위로 올라간 각도
// 끌기·WASD 로 둘러보면 azimuth·elevation 을 더하고 빼서 머리 둘레를 돕니다.
// 카메라가 벽 밖으로 나가면 높이는 두고 벽 앞까지 앞으로 당깁니다(fitInRoom). 그러면 머리 바로 뒤에 붙지 않고 위에서 내려다보게 됩니다.
// 책상·의자처럼 낮은 것은 카메라가 위로 지나가므로 벽만 봅니다. 천장은 아래를 보는 면만 있어서(Decor.Ceiling, 위에서 보기 시점과 같음)
// 카메라가 천장보다 높이 올라가도 천장에 가리지 않습니다.
import type { Box } from './layout'

export type SeatView = 'first' | 'behind' | 'right' | 'left'
export const SEAT_VIEWS: SeatView[] = ['first', 'behind', 'right', 'left'] // V 를 누르면 이 순서로 돎
export const SEAT_VIEW_NAME: Record<SeatView, string> = { first: '1인칭', behind: '뒤 위', right: '오른쪽', left: '왼쪽' }
export const nextSeatView = (v: SeatView): SeatView => SEAT_VIEWS[(SEAT_VIEWS.indexOf(v) + 1) % SEAT_VIEWS.length]
export const isSeatView = (v: unknown): v is SeatView => SEAT_VIEWS.includes(v as SeatView)

const deg = (d: number) => (d * Math.PI) / 180
export const THIRD_PERSON: Record<Exclude<SeatView, 'first'>, { dist: number; azimuth: number; elevation: number }> = {
  // 뒤통수만 크게 보이지 않게 멀리 뒤로 빼고 조금 올립니다(천장 위로 올라가도 됨, 위 설명). 너무 가파르면 바닥만 보여 비스듬히 둡니다.
  behind: { dist: 3.6, azimuth: 0, elevation: deg(32) }, // 내 뒤 위에서 나와 책상, 양옆 자리를 봄
  // 오른쪽·왼쪽: 바로 옆에 두면 옆자리 사람 머리가 카메라를 가려서, 그쪽 어깨 뒤 위에서 비스듬히 내려다봅니다.
  right: { dist: 3.4, azimuth: deg(45), elevation: deg(30) }, // 내 오른쪽 어깨 뒤 위에서 (나와 오른쪽 옆자리)
  left: { dist: 3.4, azimuth: deg(-45), elevation: deg(30) }, // 내 왼쪽 어깨 뒤 위에서 (나와 왼쪽 옆자리)
}
export const ELEVATION_RANGE = [deg(5), deg(80)] as const // 둘러볼 때 위아래로 돌 수 있는 범위
export const LOOK_AHEAD = 1.0 // 머리보다 책상 쪽으로 이만큼 앞을 봄(m). 나는 화면 아래쪽, 책상 너머 방이 위쪽에 보이게
export const LOOK_DROP = 0.1 // 머리(눈)보다 이만큼 아래를 봄(m). 크게 내리면 바닥만 보임
export const WALL_GAP = 0.3 // 벽에 닿으면 벽보다 이만큼 앞에서 멈춤(m)
export const MIN_FLAT = 0.3 // 벽이 아무리 가까워도 머리에서 옆으로 이만큼은 떨어짐(m). 머리 바로 위에서 내려다보면 방향이 뒤집힘

export type P3 = { x: number; y: number; z: number }

// 3인칭 카메라 자리. head: 머리(눈) 자리, rot: 자리 방향(책상 쪽, 라디안), turn·tilt: 둘러본 만큼 더할 각도
export function orbitPosition(view: Exclude<SeatView, 'first'>, head: P3, rot: number, turn = 0, tilt = 0): P3 {
  const v = THIRD_PERSON[view]
  const a = v.azimuth + turn
  const e = Math.min(ELEVATION_RANGE[1], Math.max(ELEVATION_RANGE[0], v.elevation + tilt))
  // 앞(책상 쪽) = (sin rot, cos rot), 캐릭터의 오른쪽 = (-cos rot, sin rot). 바로 뒤에서 오른쪽으로 a 만큼 돈 쪽으로 나감
  const fx = Math.sin(rot), fz = Math.cos(rot)
  const dx = -fx * Math.cos(a) - fz * Math.sin(a)
  const dz = -fz * Math.cos(a) + fx * Math.sin(a)
  const flat = v.dist * Math.cos(e)
  return { x: head.x + dx * flat, y: head.y + v.dist * Math.sin(e), z: head.z + dz * flat }
}

// 3인칭 카메라가 바라볼 곳: 머리보다 조금 책상 쪽
export function orbitTarget(head: P3, rot: number): P3 {
  return { x: head.x + Math.sin(rot) * LOOK_AHEAD, y: head.y - LOOK_DROP, z: head.z + Math.cos(rot) * LOOK_AHEAD }
}

// 머리 → 카메라 선이 처음 벽(위에서 본 상자)에 들어가는 곳(0~1). 안 닿으면 null. 머리가 이미 들어가 있는 상자는 건너뜀
function hitAt(ax: number, az: number, bx: number, bz: number, box: Box): number | null {
  const x0 = box.x - box.w / 2, x1 = box.x + box.w / 2, z0 = box.z - box.d / 2, z1 = box.z + box.d / 2
  if (ax > x0 && ax < x1 && az > z0 && az < z1) return null
  let tIn = 0, tOut = 1
  for (const [p, d, lo, hi] of [[ax, bx - ax, x0, x1], [az, bz - az, z0, z1]] as const) {
    if (d === 0) {
      if (p <= lo || p >= hi) return null
      continue
    }
    let t0 = (lo - p) / d, t1 = (hi - p) / d
    if (t0 > t1) [t0, t1] = [t1, t0]
    tIn = Math.max(tIn, t0)
    tOut = Math.min(tOut, t1)
    if (tIn > tOut) return null
  }
  return tIn
}

// 카메라를 방 안에 넣은 자리. 벽 밖이면 높이는 두고 벽 앞까지 머리 쪽으로 당깁니다.
export function fitInRoom(head: P3, cam: P3, walls: Box[]): P3 {
  const flat = Math.hypot(cam.x - head.x, cam.z - head.z)
  let t = 1
  for (const w of walls) {
    const hit = hitAt(head.x, head.z, cam.x, cam.z, w)
    if (hit !== null && hit < t) t = hit
  }
  if (t === 1 || flat === 0) return cam
  const keep = Math.max(MIN_FLAT, t * flat - WALL_GAP) / flat
  return { x: head.x + (cam.x - head.x) * keep, y: cam.y, z: head.z + (cam.z - head.z) * keep }
}
