// 둥근 벽을 한 덩어리로 짓는 도구 (캠빛 중앙도서관 안·밖이 같이 씁니다). three.js 만 쓰는 코드입니다.
//
// 왜 CylinderGeometry 가 아닌가: 원기둥은 UV 가 0~1 로 늘어나 무늬 크기가 면마다 달라지고, 창 구멍을 낼 수 없습니다.
// 여기서는 UV 를 "미터 ÷ tile" 로 넣어 어느 면이든 돌 한 장·판자 한 장 크기가 같고, 구멍(hole)을 비운 벽을 조각 하나로 만듭니다.
// 조각을 한 지오메트리에 모으면 재질마다 그리기 호출이 한 번이라 가볍습니다.
//
// 각도 규칙: a = 0 이 +Z, +a 가 +X. 점은 (r·sin a, y, r·cos a) (LibraryDrum·theme 의 자리 각도와 같음).
import * as THREE from 'three'

const SEG = 0.06 // 곡면 한 조각의 각도(라디안). 반지름 10m 에서 약 0.6m

export type ArcHole = { a0: number; a1: number; y0: number; y1: number }
type V3 = [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const onArc = (r: number, a: number, y: number): V3 => [Math.sin(a) * r, y, Math.cos(a) * r]

export class ArcBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private uvs: number[] = []
  private col: number[] = []
  private idx: number[] = []
  shade = 1 // 이 뒤에 넣는 면의 정점 밝기 (useShade 로 만들 때만 쓰임). 조명 없이 패인 곳을 어둡게
  private tile: number
  constructor(tile = 1) {
    this.tile = tile // 무늬 한 장이 덮는 크기(m)
  }

  // 네 점(p00, p10, p01, p11) 사각형. n 쪽이 앞면이 되도록 감는 방향을 정합니다. uv 는 [u0, v0, u1, v1]
  quad(p00: V3, p10: V3, p01: V3, p11: V3, n: V3, uv: [number, number, number, number]) {
    const base = this.pos.length / 3
    const [u0, v0, u1, v1] = uv
    const verts: [V3, number, number][] = [[p00, u0, v0], [p10, u1, v0], [p01, u0, v1], [p11, u1, v1]]
    for (const [p, u, v] of verts) {
      this.pos.push(...p)
      this.nor.push(...n)
      this.uvs.push(u, v)
      this.col.push(this.shade, this.shade, this.shade)
    }
    if (dot(cross(sub(p10, p00), sub(p01, p00)), n) >= 0) this.idx.push(base, base + 1, base + 3, base, base + 3, base + 2)
    else this.idx.push(base, base + 3, base + 1, base, base + 2, base + 3)
  }

  // 곡면 띠: 반지름 r, 각도 a0~a1, 높이 y0~y1. inward 면 가운데를 보는 면. whole 이면 이 띠 전체에 UV 0~1 (유리창 그림용)
  band(r: number, a0: number, a1: number, y0: number, y1: number, inward = false, whole = false) {
    const n = Math.max(1, Math.ceil((a1 - a0) / SEG))
    for (let i = 0; i < n; i++) {
      const s0 = a0 + ((a1 - a0) * i) / n
      const s1 = a0 + ((a1 - a0) * (i + 1)) / n
      const mid = (s0 + s1) / 2
      const sign = inward ? -1 : 1
      const uv: [number, number, number, number] = whole ? [i / n, 0, (i + 1) / n, 1] : [(s0 * r) / this.tile, y0 / this.tile, (s1 * r) / this.tile, y1 / this.tile]
      this.quad(onArc(r, s0, y0), onArc(r, s1, y0), onArc(r, s0, y1), onArc(r, s1, y1), [sign * Math.sin(mid), 0, sign * Math.cos(mid)], uv)
    }
  }

  // 수평 고리 조각 (창턱·창 윗면): 반지름 r0~r1, 높이 y. up 이면 위를 보는 면
  ledge(r0: number, r1: number, a0: number, a1: number, y: number, up: boolean) {
    const n = Math.max(1, Math.ceil((a1 - a0) / SEG))
    for (let i = 0; i < n; i++) {
      const s0 = a0 + ((a1 - a0) * i) / n
      const s1 = a0 + ((a1 - a0) * (i + 1)) / n
      const t = this.tile
      this.quad(onArc(r0, s0, y), onArc(r0, s1, y), onArc(r1, s0, y), onArc(r1, s1, y), [0, up ? 1 : -1, 0], [(s0 * r0) / t, r0 / t, (s1 * r0) / t, r1 / t])
    }
  }

  // 구멍 난 곡면 벽: 각도 start~end, 높이 y0~y1 에서 holes 자리를 비웁니다 (같은 각도에 위·아래 창이 있어도 됨)
  wall(r: number, start: number, end: number, y0: number, y1: number, holes: ArcHole[], inward = false) {
    const cuts = [start, end, ...holes.flatMap((h) => [h.a0, h.a1])].filter((a) => a >= start && a <= end).sort((p, q) => p - q)
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a0 = cuts[i]
      const a1 = cuts[i + 1]
      if (a1 - a0 < 1e-6) continue
      const mid = (a0 + a1) / 2
      const here = holes.filter((h) => h.a0 <= mid && mid <= h.a1).sort((p, q) => p.y0 - q.y0)
      let y = y0
      for (const h of here) {
        if (h.y0 > y) this.band(r, a0, a1, y, h.y0, inward)
        y = h.y1
      }
      if (y1 > y) this.band(r, a0, a1, y, y1, inward)
    }
  }

  // 창 구멍의 안쪽 면 (양옆·창턱·윗면): 벽 면 r0 에서 유리 r1 까지. 면은 구멍 가운데를 봅니다
  reveal(h: ArcHole, r0: number, r1: number) {
    const t = this.tile
    const side = (a: number, sign: number) => {
      const n: V3 = [sign * Math.cos(a), 0, -sign * Math.sin(a)]
      this.quad(onArc(r0, a, h.y0), onArc(r1, a, h.y0), onArc(r0, a, h.y1), onArc(r1, a, h.y1), n, [r0 / t, h.y0 / t, r1 / t, h.y1 / t])
    }
    side(h.a0, 1)
    side(h.a1, -1)
    this.ledge(r0, r1, h.a0, h.a1, h.y0, true)
    this.ledge(r0, r1, h.a0, h.a1, h.y1, false)
  }

  // 옆모습(바닥→위 순서 [반지름, 높이])을 돌려 만든 띠와 몰딩. 면마다 각지게 (돌을 깎은 느낌)
  revolve(profile: [number, number][], a0 = -Math.PI, a1 = Math.PI) {
    const n = Math.ceil((a1 - a0) / SEG)
    for (let k = 0; k + 1 < profile.length; k++) {
      const [r0, y0] = profile[k]
      const [r1, y1] = profile[k + 1]
      const len = Math.hypot(r1 - r0, y1 - y0) || 1
      const nr = (y1 - y0) / len // 위로 오르면 바깥, 안쪽으로 들어가면 위, 바깥으로 나가면 아래
      const ny = -(r1 - r0) / len
      for (let i = 0; i < n; i++) {
        const s0 = a0 + ((a1 - a0) * i) / n
        const s1 = a0 + ((a1 - a0) * (i + 1)) / n
        const mid = (s0 + s1) / 2
        const t = this.tile
        const v0 = (y0 + Math.abs(r0)) / t
        const v1 = v0 + len / t
        this.quad(onArc(r0, s0, y0), onArc(r0, s1, y0), onArc(r1, s0, y1), onArc(r1, s1, y1), [nr * Math.sin(mid), ny, nr * Math.cos(mid)], [(s0 * r0) / t, v0, (s1 * r0) / t, v1])
      }
    }
  }

  // 벽에 나란한 상자: 각도 a 쪽 반지름 r 에 가운데, 옆으로 lx, 높이 y. 크기 sx(접선)·sy(높이)·sz(반지름 방향)
  box(a: number, r: number, lx: number, y: number, sx: number, sy: number, sz: number) {
    const t: V3 = [Math.cos(a), 0, -Math.sin(a)] // 접선
    const o: V3 = [Math.sin(a), 0, Math.cos(a)] // 바깥
    const c: V3 = [o[0] * r + t[0] * lx, y, o[2] * r + t[2] * lx]
    const P = (i: number, j: number, k: number): V3 => [c[0] + (t[0] * i * sx + o[0] * k * sz) / 2, c[1] + (j * sy) / 2, c[2] + (t[2] * i * sx + o[2] * k * sz) / 2]
    const m = this.tile
    this.quad(P(-1, -1, 1), P(1, -1, 1), P(-1, 1, 1), P(1, 1, 1), o, [lx / m, (y - sy / 2) / m, (lx + sx) / m, (y + sy / 2) / m]) // 바깥
    this.quad(P(-1, -1, -1), P(1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [-o[0], 0, -o[2]], [lx / m, (y - sy / 2) / m, (lx + sx) / m, (y + sy / 2) / m]) // 안쪽
    this.quad(P(1, -1, -1), P(1, -1, 1), P(1, 1, -1), P(1, 1, 1), t, [0, (y - sy / 2) / m, sz / m, (y + sy / 2) / m]) // +접선
    this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, -1), P(-1, 1, 1), [-t[0], 0, -t[2]], [0, (y - sy / 2) / m, sz / m, (y + sy / 2) / m]) // -접선
    this.quad(P(-1, 1, -1), P(1, 1, -1), P(-1, 1, 1), P(1, 1, 1), [0, 1, 0], [lx / m, 0, (lx + sx) / m, sz / m]) // 위
    this.quad(P(-1, -1, -1), P(1, -1, -1), P(-1, -1, 1), P(1, -1, 1), [0, -1, 0], [lx / m, 0, (lx + sx) / m, sz / m]) // 아래
  }

  build(useShade = false) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    if (useShade) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    return g
  }
}

// 창살 막대: 곡면 창 하나(각도 범위·높이)의 테두리와 격자를 상자로. cols·rows 는 유리 칸 수, r 은 막대 가운데 반지름
export function windowBars(b: ArcBuilder, h: ArcHole, r: number, cols: number, rows: number, t: number, depth: number) {
  const span = h.a1 - h.a0
  const height = h.y1 - h.y0
  const cy = (h.y0 + h.y1) / 2
  for (let i = 0; i <= cols; i++) {
    const edge = i === 0 || i === cols
    b.box(h.a0 + (span * i) / cols, r, 0, cy, edge ? t * 1.4 : t, height, depth)
  }
  for (let i = 0; i < cols; i++) {
    const mid = h.a0 + (span * (i + 0.5)) / cols
    const w = (span / cols) * r // 칸 폭 (곡면이라 칸마다 곧은 막대)
    for (let j = 0; j <= rows; j++) {
      const edge = j === 0 || j === rows
      b.box(mid, r, 0, h.y0 + (height * j) / rows, w, edge ? t * 1.4 : t * 0.8, depth)
    }
  }
}
