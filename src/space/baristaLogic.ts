// 카페 바리스타 NPC 와 카운터 자리 계산. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 지점 JSON 의 barista: 카운터 가운데(x·z)·길이(w)·손님 쪽 방향(facing). counter 가 false 면 원래 있는 bar 를 카운터로 씀(학생회관 카페).
//   counterBox   카운터 바닥 상자 (부딪힘)
//   npcSpot      바리스타 자리: 카운터 뒤 가운데, 손님 쪽을 봄
//   orderSpot    주문 자리: 카운터 앞 가운데 (여기 가까이 서면 E 로 주문)
//   nearCounter  내 자리가 주문 자리 가까이(카운터 앞쪽)인지
// 스터디카페(별다방)는 키오스크 무인이라 바리스타가 없고, 휴식공간(숨 라운지·학생 라운지)도 없습니다.

export type Facing = 'north' | 'south' | 'east' | 'west'
// food: 빵이면 그 모양 (컵 대신 접시에 담겨 나옴). 없으면 음료 컵
export type FoodKind = 'scone' | 'madeleine' | 'ciabatta' | 'sandwich'
export type MenuItem = { name: string; icon: string; food?: FoodKind }
// apron: 앞치마 색, hat: 모자 모양(캡·베레모·두건)과 색
export type BaristaLook = { hair: string; hairColor: string; top: string; topColor: string; bottomColor: string; skin?: string; apron?: string; hat?: 'cap' | 'beret' | 'bandana'; hatColor?: string }
export type Barista = { x: number; z: number; w: number; facing: Facing; counter: boolean; look: BaristaLook; menu: MenuItem[]; greeting?: string }

// d: 카운터 깊이, h: 높이, behind: 카운터 가운데에서 바리스타까지, front: 카운터 가운데에서 주문 자리까지, reach: 주문 자리에서 이 거리 안이면 가까움
export const COUNTER = { d: 0.8, h: 0.9, behind: 0.85, front: 1.2, reach: 1.3 }

// 손님 쪽 방향 (단위 벡터)과 그쪽을 보는 heading (0 = +z)
const DIR: Record<Facing, { x: number; z: number; h: number }> = {
  south: { x: 0, z: 1, h: 0 },
  north: { x: 0, z: -1, h: Math.PI },
  east: { x: 1, z: 0, h: Math.PI / 2 },
  west: { x: -1, z: 0, h: -Math.PI / 2 },
}

export function counterBox(b: Barista) {
  const along = b.facing === 'south' || b.facing === 'north'
  return { x: b.x, z: b.z, w: along ? b.w : COUNTER.d, d: along ? COUNTER.d : b.w }
}

export function npcSpot(b: Barista) {
  const d = DIR[b.facing]
  return { x: b.x - d.x * COUNTER.behind, z: b.z - d.z * COUNTER.behind, h: d.h }
}

export function orderSpot(b: Barista) {
  const d = DIR[b.facing]
  return { x: b.x + d.x * COUNTER.front, z: b.z + d.z * COUNTER.front }
}

export function nearCounter(p: { x: number; z: number }, b: Barista) {
  const o = orderSpot(b)
  const d = DIR[b.facing]
  const inFront = (p.x - b.x) * d.x + (p.z - b.z) * d.z > COUNTER.d / 2 // 카운터 앞쪽
  return inFront && Math.hypot(p.x - o.x, p.z - o.z) < COUNTER.reach
}
