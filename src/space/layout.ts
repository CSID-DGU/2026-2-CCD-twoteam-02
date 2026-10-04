// 지점 데이터(JSON)에서 충돌 상자를 만듭니다. 화면 표시와 충돌 판정이 같은 값을 씁니다.
export type Box = { x: number; z: number; w: number; d: number }

type Seat = { x: number; z: number }
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
