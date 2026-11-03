// 캠퍼스 돌 건물의 창·현관·시계·소품 자리. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
type Box = { x: number; z: number; w: number; d: number }
export type Bay = { x: number; y: number; w: number; h: number; arch: boolean } // x·y 는 창 가운데, h 는 아치 꼭대기까지 전체 높이

export const HALL_BAYS = { col: 2.6, w: 1.72, ground: { y0: 0.55, h: 3.2 }, upper: [{ y0: 4.4, h: 2.4 }, { y0: 7.9, h: 2.4 }] } // 칸 간격, 창 폭, 1층(아치)·위층 높이
export const HALL_BELTS = [4.05, 7.35] // 층을 나누는 돌 띠 높이
const DOOR_PAD = 0.5 // 문과 창 사이 벽
export const PORCH = { pad: 0.7, depth: 1.5, r: 0.19 } // 현관 기둥: 문 옆으로 떨어진 거리, 벽에서 앞으로 나온 거리, 반지름

// 벽 폭 w 에 창을 고르게 놓음. 1층은 아치 창이고 문 앞 칸은 비움. 문이 없는 면은 doorX 를 멀리, doorW 를 0 으로
export function hallBays(w: number, doorX: number, doorW: number): Bay[] {
  const B = HALL_BAYS
  const n = Math.max(2, Math.floor((w - 1) / B.col))
  const out: Bay[] = []
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * B.col) / 2 + i * B.col
    if (Math.abs(x - doorX) >= doorW / 2 + PORCH.pad + DOOR_PAD + B.w / 2) out.push({ x, y: B.ground.y0 + B.ground.h / 2, w: B.w, h: B.ground.h, arch: true })
    for (const f of B.upper) out.push({ x, y: f.y0 + f.h / 2, w: B.w, h: f.h, arch: false })
  }
  return out
}

// 현관 기둥 자리 (건물 가운데 기준, d 는 건물 깊이)
export function porchColumns(doorX: number, doorW: number, d: number) {
  return [-1, 1].map((s) => ({ x: doorX + s * (doorW / 2 + PORCH.pad), z: d / 2 + PORCH.depth }))
}

// 시계 바늘 각도 (12시에서 시계 방향, 라디안)
export function clockAngles(h: number, m: number, s: number) {
  const full = Math.PI * 2
  return { hour: (((h % 12) + m / 60) / 12) * full, minute: ((m + s / 60) / 60) * full, second: (s / 60) * full }
}

// 캠퍼스 소품 배치 (campus.json props)
export type XZ = { x: number; z: number }
export type CampusProps = {
  flags: XZ[] // 깃대
  banners: (XZ & { text: string; color: string })[] // 벽 세로 현수막
  bikes: XZ // 자전거 거치대
  tents: (XZ & { text: string; color: string })[] // 동아리 천막
}
export const PROP = {
  flag: 0.25,
  bikes: { w: 3.4, d: 1.8, count: 4 },
  tent: { size: 3, table: { w: 2.4, d: 0.7, z: 0.7 } }, // table.z: 천막 가운데에서 앞으로 (중정 쪽 -z)
}

// 부딪힘 (천막은 탁자만: 천막 밑으로 지나갈 수 있음)
export function propBoxes(p: CampusProps): Box[] {
  const P = PROP
  return [
    ...p.flags.map((f) => ({ x: f.x, z: f.z, w: P.flag, d: P.flag })),
    { x: p.bikes.x, z: p.bikes.z, w: P.bikes.w, d: P.bikes.d },
    ...p.tents.map((t) => ({ x: t.x, z: t.z - P.tent.table.z, w: P.tent.table.w, d: P.tent.table.d })),
  ]
}

// 차지하는 땅 (풀을 안 심는 자리, 배치 검사). 천막은 지붕 전체
export function propFootprints(p: CampusProps): Box[] {
  const S = PROP.tent.size
  const tents = p.tents.map((t) => ({ x: t.x, z: t.z, w: S, d: S }))
  return [...propBoxes(p).filter((b) => b.w !== PROP.tent.table.w), ...tents]
}
