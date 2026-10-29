// 지점 데이터(JSON)에서 충돌 상자를 만듭니다. 화면 표시와 충돌 판정이 같은 값을 씁니다.
import { decorBoxes, stoolBoxes } from './theme'
import type { BranchTheme } from './theme'

export type Box = { x: number; z: number; w: number; d: number }

// tall: 높은 의자(바 스툴) 자리. 앉은 캐릭터와 좌석 카메라가 TALL_RAISE 만큼 올라갑니다 (#57 다이너 테마)
// chair: 원목 테마에서 이 자리의 의자 모양 (booth = 원목 부스, chair = 원목 의자, none = 의자 없이 방석만(원형 부스 안), stool = 높은 원목 스툴, tub = 둥근 1인 소파, 기본 chair)
// desk: 이 자리 책상 모양 (round = 1인 둥근 작은 테이블, low = 낮은 둥근 테이블, 없으면 기본 테이블)
type Seat = { no: number; x: number; z: number; rot: number; tall?: boolean; chair?: 'booth' | 'chair' | 'none' | 'stool' | 'tub'; desk?: 'round' | 'low' }
export const TALL_RAISE = 0.3 // 높은 의자에 앉았을 때 올라가는 높이 (의자 0.45 → 스툴 0.75)
// 지점 배치. 스터디카페는 키오스크(kiosk), 카페는 커피 바(bar)가 있습니다. (#44)
export type BranchLayout = {
  id: string
  name: string
  size: { w: number; d: number }
  spawn: { x: number; z: number }
  walls: Box[]
  seats: Seat[]
  // 회의실 문. 지점 동쪽 벽에 붙은 문이고, 앞에서 E 로 회의에 들어갑니다. 로비처럼 문 너머의 다른 장소라서
  // 회의실 방 자체는 지점에 그리지 않습니다(위에서 보기에도 안 보임). 문도 부딪히는 상자입니다. (#45)
  meetingDoor?: Box
  elevator?: Box // 엘리베이터 문 (서쪽·동쪽 벽). 여러 층 건물(world.json floors)의 지점에만. 앞에서 E 로 다른 층으로
  kiosk?: { x: number; z: number }
  bar?: Box
  door?: Box // 로비로 나가는 출입문. 남쪽 벽 가운데, 들어오면 서는 자리(spawn) 바로 뒤 (#150)
  mapSprite?: string // 전체 지도에서 지붕 대신 쓸 건물 그림 (public/ 기준 주소, 선택). 없으면 색 칠한 지붕 (#300)
  theme?: BranchTheme // 지점 테마(색·천장·액자·카운터, #57). 없으면 기본 모습. 값은 theme.ts 참고
}
type Branch = Pick<BranchLayout, 'walls' | 'seats' | 'meetingDoor' | 'elevator' | 'kiosk' | 'bar' | 'theme'>

export const SEAT = { w: 1.2, d: 0.6 }
export const KIOSK = { w: 0.6, d: 0.4 }
const MEETING_DOOR_REACH = 0.7 // 회의실 문 안쪽(지점 쪽) 이 거리 앞에 서면 E 로 들어갈 수 있습니다

// 회의실 문 앞 E 를 누르는 자리 (문의 서쪽, 지점 안)
export const meetingDoorFront = (door: Box) => ({ x: door.x - door.w / 2 - MEETING_DOOR_REACH, z: door.z })

// 엘리베이터 문 앞 E 를 누르는 자리 (벽에서 지점 안쪽으로). 서쪽 벽(x < 0)이면 동쪽으로, 동쪽 벽이면 서쪽으로 나옵니다.
// heading: 그 자리에서 엘리베이터를 등지고 지점 안쪽을 보는 방향 (엘리베이터에서 내렸을 때)
export function elevatorFront(door: Box): { x: number; z: number; heading: number } {
  const inward = door.x < 0 ? 1 : -1
  return { x: door.x + inward * (door.w / 2 + MEETING_DOOR_REACH), z: door.z, heading: (inward * Math.PI) / 2 }
}

export function obstaclesOf(b: Branch): Box[] {
  return [
    ...b.walls,
    ...(b.meetingDoor ? [b.meetingDoor] : []),
    ...(b.elevator ? [b.elevator] : []),
    ...b.seats.map((s) => ({ x: s.x, z: s.z, ...SEAT })),
    ...(b.kiosk ? [{ x: b.kiosk.x, z: b.kiosk.z, ...KIOSK }] : []),
    ...(b.bar ? [b.bar] : []),
    ...stoolBoxes(b.theme), // 테마의 카운터 스툴도 부딪힙니다
    ...decorBoxes(b.theme), // 고리 테이블 가운데(나무)도 막습니다
  ]
}

// 앉는 자리: 좌석 번호, 의자 위치, 앉았을 때 바라보는 방향(책상 쪽)
// y: 앉는 높이 보정. 높은 의자면 TALL_RAISE, 아니면 0 (회의실처럼 따로 만드는 자리는 생략 = 0)
export type Spot = { no: number; x: number; z: number; rot: number; y?: number; tall?: boolean; chair?: 'booth' | 'chair' | 'none' | 'stool' | 'tub' }
const CHAIR_GAP = 0.65 // 책상 중심에서 의자까지 거리
export const CHAIR = { w: 0.45, h: 0.45, d: 0.45 }

// rot 방향으로 책상을 바라보므로, 의자는 책상의 반대쪽에 놓입니다.
export function spotsOf(b: Branch): Spot[] {
  return b.seats.map((s) => ({
    no: s.no,
    x: s.x - Math.sin(s.rot) * CHAIR_GAP,
    z: s.z - Math.cos(s.rot) * CHAIR_GAP,
    rot: s.rot,
    y: s.tall ? TALL_RAISE : 0,
    tall: s.tall ?? false,
    chair: s.chair,
  }))
}

// 한 걸음 움직이기 (Player). 축별로 따로 판정해서 벽에 비스듬히 닿으면 미끄러지듯 움직입니다. r: 캐릭터 충돌 반경
// 지금 이미 겹쳐 있는 상자는 막지 않습니다. 앉으면 충돌 판정 없이 의자 자리로 옮겨 가는데, 옆을 보는 자리
// (원형 부스 양옆·곡선 바 스툴·1인 소파)는 의자 자리가 책상 상자(늘 가로 1.2×0.6) 안에 들어가서,
// 일어나면 어느 쪽으로도 못 움직이고 갇혔습니다. 새로 부딪히는 상자만 막아 빠져나올 수 있게 합니다.
export function stepWithObstacles(p: { x: number; z: number }, dx: number, dz: number, obstacles: Box[], r: number): { x: number; z: number } {
  const hit = (x: number, z: number, o: Box) => Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r
  let { x, z } = p
  if (!obstacles.some((o) => hit(x + dx, z, o) && !hit(x, z, o))) x += dx
  if (!obstacles.some((o) => hit(x, z + dz, o) && !hit(x, z, o))) z += dz
  return { x, z }
}
