// 캠리단길 정원 자리: 잔디 위 풀 포기와 화단(여러 가지 풀·꽃)을 어디에 둘지. React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   keepOutBoxes  풀·화단을 두지 않는 곳: 광장 돌바닥과 자갈 띠, 길, 건물(+여유), 건물 입구 앞, 정문 지나는 곳,
//                 벤치·게시판 앞(다가가 앉고 E 를 누르는 자리), 가로등
//   grassTufts    잔디 위 풀 포기 TUFTS 개. 막힌 곳을 피해 고르게 흩뿌림
//   flowerBeds    자갈 띠 바로 바깥을 두르는 화단. 몇 m 마다 종류를 바꿔 무리 지어 심고, 잔디 곳곳에 들꽃
// 자리는 정해진 난수로 골라 매번 같습니다(다른 사람 화면과도 같음).
// 캠퍼스(잔디 쿼드)는 화단 띠 없이 풀 포기와 들꽃만. 굽은 길·축구장·등불나무 광장·쉬는 자리도 비움
import { GRAVEL_W, gravelStrips, placeGates } from './worldLogic'
import type { PlacedBuilding, PlazaLayout } from './worldLogic'
import type { Box } from '../space/layout'

export const TUFTS = 2600 // 풀 포기 수
const EDGE = 0.7 // 울타리에서 이만큼 안쪽까지만
const PAD = { building: 0.35, entry: 1.4, bench: 0.7, lamp: 0.35 } // 막힌 곳 둘레 여유(m)
const BOARD_FRONT = { w: 4.4, d: 3.4 } // 게시판 앞 비워 둘 넓이(m)
const GATE_PASS = 3 // 정문 앞뒤로 비워 둘 깊이(m)
const BED = { from: 0.25, to: 2.1, step: 0.75, cluster: 3.2 } // 화단: 자갈 띠 바깥 몇 m 부터 몇 m 까지, 포기 간격, 한 무리 길이
const WILDFLOWERS = 70 // 잔디 곳곳의 들꽃 수
const TREE_CLEAR = 0.6 // 나무 줄기에서 이만큼은 비움

export type Tuft = { x: number; z: number; s: number; rot: number }
export type PlantKind = 'bush' | 'rose' | 'lavender' | 'fern' | 'daisy'
export type Plant = Tuft & { kind: PlantKind }
const BED_KINDS: PlantKind[] = ['bush', 'rose', 'lavender', 'fern', 'bush', 'daisy']

function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const grow = (b: Box, pad: number): Box => ({ x: b.x, z: b.z, w: b.w + pad * 2, d: b.d + pad * 2 })
const inside = (x: number, z: number, b: Box) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2

export function keepOutBoxes(plaza: PlazaLayout, placed: PlacedBuilding[]): Box[] {
  const { w, d } = plaza.plaza
  const rects = placed.map((b) => b.rect)
  const lawn = plaza.ground === 'lawn'
  const boxes: Box[] = [
    ...(lawn ? lawnKeepOut(plaza) : [{ x: 0, z: 0, w: w + GRAVEL_W * 2, d: d + GRAVEL_W * 2 }, ...gravelStrips(plaza, rects)]),
    ...plaza.paths,
    ...rects.map((r) => grow(r, PAD.building)),
    ...placed.map((b) => ({ x: b.entry.x, z: b.entry.z, w: PAD.entry * 2, d: PAD.entry * 2 })),
    ...plaza.benches.map((b) => ({ x: b.x, z: b.z, w: 1.6 + PAD.bench * 2, d: 1.6 + PAD.bench * 2 })),
    ...plaza.lamps.map((l) => ({ x: l.x, z: l.z, w: PAD.lamp * 2, d: PAD.lamp * 2 })),
  ]
  if (plaza.board) boxes.push({ x: plaza.board.x, z: plaza.board.z, w: BOARD_FRONT.w, d: BOARD_FRONT.d })
  for (const g of placeGates(plaza)) {
    const along = g.spec.facing === 'east' || g.spec.facing === 'west' // 문 폭이 z 방향
    const span = g.spec.w + 1
    boxes.push(along ? { x: g.spec.x, z: g.spec.z, w: GATE_PASS * 2, d: span } : { x: g.spec.x, z: g.spec.z, w: span, d: GATE_PASS * 2 })
    boxes.push(...g.posts, ...g.fences)
  }
  return boxes
}

// 캠퍼스에서 더 비울 곳: 축구장(골망 포함 + 1m), 굽은 길(0.5m 마다 네모), 등불나무 광장, 쉬는 자리
const WALK_STEP = 0.5
function lawnKeepOut(plaza: PlazaLayout): Box[] {
  const out: Box[] = []
  const p = plaza.pitch
  if (p) out.push({ x: p.x, z: p.z, w: p.w + 2, d: p.d + 2 * 1.4 + 2 })
  for (const wk of plaza.walks ?? []) {
    for (let i = 1; i < wk.points.length; i++) {
      const [ax, az] = wk.points[i - 1]
      const [bx, bz] = wk.points[i]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / WALK_STEP))
      for (let k = 0; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, w: wk.w + 0.5, d: wk.w + 0.5 })
    }
  }
  const c = plaza.courtyard
  if (c) out.push({ x: c.x, z: c.z, w: c.r * 2 + 0.8, d: c.r * 2 + 0.8 }, ...c.bags.map((b) => ({ x: b.x, z: b.z, w: 1.6, d: 1.6 })))
  for (const r of plaza.rests ?? []) out.push({ x: r.x, z: r.z, w: 2, d: 2 })
  return out
}

const nearTree = (plaza: PlazaLayout, x: number, z: number) => plaza.trees.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_CLEAR)

export function grassTufts(plaza: PlazaLayout, placed: PlacedBuilding[]): Tuft[] {
  const r = random(101)
  const keep = keepOutBoxes(plaza, placed)
  const hw = plaza.size.w / 2 - EDGE
  const hd = plaza.size.d / 2 - EDGE
  const out: Tuft[] = []
  for (let tries = 0; out.length < TUFTS && tries < TUFTS * 20; tries++) {
    const x = (r() * 2 - 1) * hw
    const z = (r() * 2 - 1) * hd
    const s = 0.7 + r() * 0.6
    const rot = r() * Math.PI * 2
    if (keep.some((b) => inside(x, z, b)) || nearTree(plaza, x, z)) continue
    out.push({ x, z, s, rot })
  }
  return out
}

export function flowerBeds(plaza: PlazaLayout, placed: PlacedBuilding[]): Plant[] {
  const lawn = plaza.ground === 'lawn' // 캠퍼스: 화단 띠 없이 들꽃만
  const r = random(202)
  const keep = keepOutBoxes(plaza, placed)
  const ok = (x: number, z: number) => !keep.some((b) => inside(x, z, b)) && !nearTree(plaza, x, z)
  const out: Plant[] = []
  const hw = plaza.plaza.w / 2 + GRAVEL_W
  const hd = plaza.plaza.d / 2 + GRAVEL_W
  // 네 변을 따라 띠 모양 화단 (한 변 = [시작점, 방향, 길이, 바깥 방향])
  const sides: [number, number, number, number, number, number, number][] = [
    [-hw - BED.to, -hd, 1, 0, (hw + BED.to) * 2, 0, -1],
    [-hw - BED.to, hd, 1, 0, (hw + BED.to) * 2, 0, 1],
    [-hw, -hd, 0, 1, hd * 2, -1, 0],
    [hw, -hd, 0, 1, hd * 2, 1, 0],
  ]
  let cluster = 0
  for (const [sx, sz, dx, dz, len, ox, oz] of lawn ? [] : sides) {
    for (let a = 0; a < len; a += BED.step) {
      if (a % BED.cluster < BED.step) cluster++
      const kind = BED_KINDS[cluster % BED_KINDS.length]
      for (let depth = BED.from; depth <= BED.to; depth += BED.step) {
        const x = sx + dx * a + ox * depth + (r() - 0.5) * 0.35
        const z = sz + dz * a + oz * depth + (r() - 0.5) * 0.35
        const s = 0.75 + r() * 0.5
        const rot = r() * Math.PI * 2
        if (ok(x, z)) out.push({ kind, x, z, s, rot })
      }
    }
  }
  // 잔디 곳곳의 들꽃
  const hW = plaza.size.w / 2 - EDGE
  const hD = plaza.size.d / 2 - EDGE
  for (let i = 0, tries = 0; i < WILDFLOWERS && tries < WILDFLOWERS * 30; tries++) {
    const x = (r() * 2 - 1) * hW
    const z = (r() * 2 - 1) * hD
    const s = 0.6 + r() * 0.5
    const rot = r() * Math.PI * 2
    if (!ok(x, z)) continue
    out.push({ kind: 'daisy', x, z, s, rot })
    i++
  }
  return out
}
