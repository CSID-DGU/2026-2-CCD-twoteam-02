// 캠퍼스 곡선 벽돌길과 길가 둥근 조명의 자리. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//   walkPoints  길의 점들. curve 면 점 사이를 부드럽게 (Catmull-Rom) 잘게 나눔
//   orbSpots    곡선 길 양옆에 번갈아 놓는 둥근 조명. 건물·길·나무 등과 겹치는 자리는 건너뜀
import type { PlazaLayout, Walk } from './worldLogic'
import { propFootprints } from './hallLogic'

const CURVE_STEPS = 10 // 점 사이를 나누는 수
export const ORB = { every: 2.3, sizes: [0.34, 0.24, 0.46, 0.28, 0.38], gaps: [0.55, 1.1, 0.75, 1.5, 0.9], lift: 0.75, start: 1.2 } // 간격, 반지름들, 길 가장자리에서 떨어진 거리들, 묻힘(반지름 비율), 길 시작에서 비우는 거리

export function walkPoints(walk: Walk): number[][] {
  if (!walk.curve) return walk.points
  const P = walk.points
  const out: number[][] = [P[0]]
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(i - 1, 0)]
    const p1 = P[i]
    const p2 = P[i + 1]
    const p3 = P[Math.min(i + 2, P.length - 1)]
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const u = s / CURVE_STEPS
      const at = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u)
      out.push(s === CURVE_STEPS ? p2 : [at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  return out
}

export type Orb = { x: number; z: number; r: number }
type Box = { x: number; z: number; w: number; d: number }

function buildingBoxes(plaza: PlazaLayout): Box[] {
  const out: Box[] = plaza.buildings.map((b) => (b.facing === 'east' || b.facing === 'west' ? { x: b.x, z: b.z, w: b.d, d: b.w } : { x: b.x, z: b.z, w: b.w, d: b.d }))
  const p = plaza.pitch
  if (p) out.push(p.across ? { x: p.x, z: p.z, w: p.d + 3, d: p.w + 1 } : { x: p.x, z: p.z, w: p.w + 1, d: p.d + 3 })
  return out
}

// 문 앞 비워 둘 구역: 문 가운데에서 양옆 DOOR_ZONE.w/2, 벽에서 앞으로 DOOR_ZONE.d (간판·입구가 안 가리게)
export const DOOR_ZONE = { w: 5.4, d: 5 }
export function doorZones(plaza: PlazaLayout): Box[] {
  const Z = DOOR_ZONE
  return plaza.buildings.map((b) => {
    const half = b.d / 2 // 입구 면에서 가운데까지
    if (b.facing === 'south') return { x: b.x, z: b.z + half + Z.d / 2, w: Z.w, d: Z.d }
    if (b.facing === 'north') return { x: b.x, z: b.z - half - Z.d / 2, w: Z.w, d: Z.d }
    if (b.facing === 'east') return { x: b.x + half + Z.d / 2, z: b.z, w: Z.d, d: Z.w }
    return { x: b.x - half - Z.d / 2, z: b.z, w: Z.d, d: Z.w }
  })
}

function isFree(plaza: PlazaLayout, o: Orb, boxes: Box[], placed: Orb[]) {
  const P = 0.3
  if (boxes.some((b) => Math.abs(o.x - b.x) < b.w / 2 + o.r + P && Math.abs(o.z - b.z) < b.d / 2 + o.r + P)) return false
  const near = (t: { x: number; z: number }, gap: number) => Math.hypot(t.x - o.x, t.z - o.z) < o.r + gap
  const spots = [...plaza.trees, ...plaza.lamps, ...plaza.benches, ...(plaza.signposts ?? []), ...(plaza.rests ?? []), ...(plaza.courtyard?.bags ?? [])]
  if (spots.some((t) => near(t, 0.8))) return false
  if (placed.some((t) => near(t, t.r + 0.5))) return false
  const c = plaza.court
  if (c && Math.hypot(o.x - c.x, o.z - c.z) < c.r + o.r) return false
  if (Math.abs(o.x) > plaza.size.w / 2 - 1 || Math.abs(o.z) > plaza.size.d / 2 - 2) return false
  // 다른 길 위에 놓이지 않게
  return !(plaza.walks ?? []).some((w) => walkPoints(w).some(([x, z]) => Math.hypot(o.x - x, o.z - z) < w.w / 2 + o.r))
}

const cache = new WeakMap<PlazaLayout, Orb[]>()
export function orbSpots(plaza: PlazaLayout): Orb[] {
  const hit = cache.get(plaza)
  if (hit) return hit
  const out: Orb[] = []
  const boxes = [...buildingBoxes(plaza), ...doorZones(plaza), ...(plaza.props ? propFootprints(plaza.props) : [])]
  let no = 0
  for (const w of plaza.walks ?? []) {
    if (!w.curve) continue
    const S = walkPoints(w)
    let along = 0
    let next = ORB.start
    let side = 1
    for (let i = 1; i < S.length; i++) {
      const dx = S[i][0] - S[i - 1][0]
      const dz = S[i][1] - S[i - 1][1]
      const len = Math.hypot(dx, dz)
      along += len
      if (along < next || len === 0) continue
      next += ORB.every
      no++
      const r = ORB.sizes[no % ORB.sizes.length]
      const off = w.w / 2 + ORB.gaps[no % ORB.gaps.length] + r
      const o = { x: S[i][0] + (-dz / len) * off * side, z: S[i][1] + (dx / len) * off * side, r }
      side = -side
      if (isFree(plaza, o, boxes, out)) out.push(o)
    }
  }
  cache.set(plaza, out)
  return out
}

// 부딪힘 (둥글지만 걸음 판정이 상자뿐이라 조금 작은 네모로)
export const orbBoxes = (plaza: PlazaLayout): Box[] => orbSpots(plaza).map((o) => ({ x: o.x, z: o.z, w: o.r * 1.4, d: o.r * 1.4 }))
