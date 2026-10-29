// 지점 데이터(JSON)에서 충돌 상자를 만듭니다. 화면 표시와 충돌 판정이 같은 값을 씁니다.
import { decorBoxes, stoolBoxes } from './theme'
import type { BranchTheme } from './theme'

export type Box = { x: number; z: number; w: number; d: number }

// tall: 높은 의자(바 스툴) 자리. 앉은 캐릭터와 좌석 카메라가 TALL_RAISE 만큼 올라갑니다 (#57 다이너 테마)
// chair: 원목 테마에서 이 자리의 의자 모양 (booth = 원목 부스, chair = 원목 의자, 기본 chair)
type Seat = { no: number; x: number; z: number; rot: number; tall?: boolean; chair?: 'booth' | 'chair' }
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
  kiosk?: { x: number; z: number }
  bar?: Box
  door?: Box // 로비로 나가는 출입문. 남쪽 벽 가운데, 들어오면 서는 자리(spawn) 바로 뒤 (#150)
  mapSprite?: string // 전체 지도에서 지붕 대신 쓸 건물 그림 (public/ 기준 주소, 선택). 없으면 색 칠한 지붕 (#300)
  theme?: BranchTheme // 지점 테마(색·천장·액자·카운터, #57). 없으면 기본 모습. 값은 theme.ts 참고
}
type Branch = Pick<BranchLayout, 'walls' | 'seats' | 'meetingDoor' | 'kiosk' | 'bar' | 'theme'>

export const SEAT = { w: 1.2, d: 0.6 }
export const KIOSK = { w: 0.6, d: 0.4 }
const MEETING_DOOR_REACH = 0.7 // 회의실 문 안쪽(지점 쪽) 이 거리 앞에 서면 E 로 들어갈 수 있습니다

// 회의실 문 앞 E 를 누르는 자리 (문의 서쪽, 지점 안)
export const meetingDoorFront = (door: Box) => ({ x: door.x - door.w / 2 - MEETING_DOOR_REACH, z: door.z })

export function obstaclesOf(b: Branch): Box[] {
  return [
    ...b.walls,
    ...(b.meetingDoor ? [b.meetingDoor] : []),
    ...b.seats.map((s) => ({ x: s.x, z: s.z, ...SEAT })),
    ...(b.kiosk ? [{ x: b.kiosk.x, z: b.kiosk.z, ...KIOSK }] : []),
    ...(b.bar ? [b.bar] : []),
    ...stoolBoxes(b.theme), // 테마의 카운터 스툴도 부딪힙니다
    ...decorBoxes(b.theme), // 고리 테이블 가운데(나무)도 막습니다
  ]
}

// 앉는 자리: 좌석 번호, 의자 위치, 앉았을 때 바라보는 방향(책상 쪽)
// y: 앉는 높이 보정. 높은 의자면 TALL_RAISE, 아니면 0 (회의실처럼 따로 만드는 자리는 생략 = 0)
export type Spot = { no: number; x: number; z: number; rot: number; y?: number; tall?: boolean; chair?: 'booth' | 'chair' }
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
