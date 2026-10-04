// 지점 데이터(JSON)에서 충돌 상자를 만듭니다. 화면 표시와 충돌 판정이 같은 값을 씁니다.
export type Box = { x: number; z: number; w: number; d: number }

type Seat = { no: number; x: number; z: number; rot: number }
type Room = Box
type Branch = { walls: Box[]; seats: Seat[]; rooms: Room[]; kiosk: { x: number; z: number } }

export const SEAT = { w: 1.2, d: 0.6 }
export const KIOSK = { w: 0.6, d: 0.4 }
const WALL_T = 0.15 // 스터디룸 벽 두께
const DOOR_W = 1.4 // 스터디룸 문 너비

// 스터디룸 벽 4면. 좌석 쪽(서쪽) 벽 가운데에 문을 냅니다.
export function roomWalls(r: Room): Box[] {
  const left = r.x - r.w / 2, right = r.x + r.w / 2
  const top = r.z - r.d / 2, bottom = r.z + r.d / 2
  const side = (r.d - DOOR_W) / 2
  return [
    { x: r.x, z: top, w: r.w, d: WALL_T },
    { x: r.x, z: bottom, w: r.w, d: WALL_T },
    { x: right, z: r.z, w: WALL_T, d: r.d },
    { x: left, z: top + side / 2, w: WALL_T, d: side },
    { x: left, z: bottom - side / 2, w: WALL_T, d: side },
  ]
}

export function obstaclesOf(b: Branch): Box[] {
  return [
    ...b.walls,
    ...b.rooms.flatMap(roomWalls),
    ...b.seats.map((s) => ({ x: s.x, z: s.z, ...SEAT })),
    { x: b.kiosk.x, z: b.kiosk.z, ...KIOSK },
  ]
}

// 앉는 자리: 좌석 번호, 의자 위치, 앉았을 때 바라보는 방향(책상 쪽)
export type Spot = { no: number; x: number; z: number; rot: number }
const CHAIR_GAP = 0.65 // 책상 중심에서 의자까지 거리
export const CHAIR = { w: 0.45, h: 0.45, d: 0.45 }

// rot 방향으로 책상을 바라보므로, 의자는 책상의 반대쪽에 놓입니다.
export function spotsOf(b: Branch): Spot[] {
  return b.seats.map((s) => ({
    no: s.no,
    x: s.x - Math.sin(s.rot) * CHAIR_GAP,
    z: s.z - Math.cos(s.rot) * CHAIR_GAP,
    rot: s.rot,
  }))
}
