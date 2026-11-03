// 등불 나무 모양 (사용자 참고 사진: 뿌리가 넓은 굵은 줄기가 둘로 갈라져 큰 가지로 뻗고, 가지에서 줄 조명이 길게 늘어져 끝에 유리 등이 달림).
// React·three.js 와 무관한 순수 로직입니다. 늘 같은 모양이 나오게 정해진 씨앗을 씁니다. (Node 로 검사)
export type P3 = [number, number, number]
export type Limb = { pts: P3[]; radii: number[] }
export type Strand = { x: number; z: number; top: number; bottom: number }
export type Leaf = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; tone: number }

export const TREE_SIZE = {
  trunk: { h: 3.1, r0: 0.72, r1: 0.4 }, // 줄기: 높이, 뿌리·갈라지는 곳 반지름
  main: { len: 3.8, tilt: 0.55, r0: 0.34, r1: 0.19 }, // 큰 가지 둘
  second: { len: 3.0, tilt: 0.95, r0: 0.18, r1: 0.09, n: 3 }, // 큰 가지마다 작은 가지 셋
  third: { len: 2.1, tilt: 1.25, r0: 0.085, r1: 0.035, n: 2 },
  rings: 8, // 가지 하나를 나누는 수
  leaves: { perTip: 110, rx: 1.75, ry: 0.85, size: [0.26, 0.42], tones: 4 },
  strand: { low: 2.15, range: 2.0, perLimb: 2 }, // 줄 끝 높이 (머리 위 2.15m 이상)
}

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// from 에서 방위 a, 수직에서 tilt 만큼 기울어 len 만큼 뻗는 굽은 가지 (끝으로 갈수록 더 눕음)
function grow(from: P3, a: number, tilt: number, len: number, r0: number, r1: number, rings: number): Limb {
  const pts: P3[] = [from]
  const radii = [r0]
  let [x, y, z] = from
  for (let i = 1; i <= rings; i++) {
    const t = i / rings
    const lean = tilt + (t - 0.5) * 0.5
    const step = len / rings
    x += Math.sin(a) * Math.sin(lean) * step
    y += Math.cos(lean) * step
    z += Math.cos(a) * Math.sin(lean) * step
    pts.push([x, y, z])
    radii.push(r0 + (r1 - r0) * t)
  }
  return { pts, radii }
}

export function lanternTreeShape(seed: number) {
  const T = TREE_SIZE
  const rand = seeded(seed)
  const limbs: Limb[] = []
  // 줄기: 아래는 뿌리처럼 빠르게 넓어짐 (t 가 0 에 가까울수록)
  const trunkPts: P3[] = []
  const trunkR: number[] = []
  for (let i = 0; i <= T.rings; i++) {
    const t = i / T.rings
    trunkPts.push([Math.sin(t * 2.4) * 0.1, t * T.trunk.h, Math.cos(t * 1.7) * 0.08 - 0.08])
    trunkR.push(T.trunk.r1 + (T.trunk.r0 - T.trunk.r1) * Math.pow(1 - t, 2.6))
  }
  limbs.push({ pts: trunkPts, radii: trunkR })
  const top = trunkPts[T.rings]
  const seconds: Limb[] = []
  const thirds: Limb[] = []
  const a0 = rand() * Math.PI
  for (const m of [0, 1]) {
    const am = a0 + m * Math.PI * 0.92
    const main = grow(top, am, T.main.tilt, T.main.len * (0.9 + rand() * 0.2), T.main.r0, T.main.r1, T.rings)
    limbs.push(main)
    for (let k = 0; k < T.second.n; k++) {
      const start = main.pts[k === 2 ? T.rings : k === 1 ? T.rings - 3 : T.rings - 5]
      const as = am + (k - 1) * 1.0 + (rand() - 0.5) * 0.4
      const sec = grow(start, as, T.second.tilt, T.second.len * (0.85 + rand() * 0.3), T.second.r0, T.second.r1, T.rings)
      limbs.push(sec)
      seconds.push(sec)
      for (let n = 0; n < T.third.n; n++) {
        const third = grow(sec.pts[n === 0 ? T.rings : T.rings - 3], as + (n - 0.5) * 1.3, T.third.tilt, T.third.len * (0.8 + rand() * 0.4), T.third.r0, T.third.r1, T.rings)
        limbs.push(third)
        thirds.push(third)
      }
    }
  }
  // 줄 조명: 가지 중간에서 곧게 늘어짐
  const strands: Strand[] = []
  for (const l of [...seconds, ...thirds]) {
    for (let i = 0; i < T.strand.perLimb; i++) {
      const p = l.pts[3 + Math.floor(rand() * (T.rings - 3))]
      const bottom = T.strand.low + rand() * T.strand.range
      if (Math.hypot(p[0], p[2]) > 0.9 && p[1] > bottom + 1) strands.push({ x: p[0], z: p[2], top: p[1], bottom })
    }
  }
  // 잎: 가지 끝 둘레에 잎 한 장씩 흩뿌림 (덩어리 공이 아니라 낱장)
  const L = T.leaves
  const leaves: Leaf[] = []
  for (const l of [...seconds, ...thirds]) {
    const tip = l.pts[T.rings]
    for (let i = 0; i < L.perTip; i++) {
      // 납작한 타원 안에 고르게 (가운데가 더 빽빽)
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * L.rx
      leaves.push({
        x: tip[0] + Math.sin(a) * d,
        y: Math.max(4.2, tip[1] + (rand() - 0.35) * L.ry * 2),
        z: tip[2] + Math.cos(a) * d,
        rx: rand() * Math.PI,
        ry: rand() * Math.PI * 2,
        rz: rand() * Math.PI,
        s: L.size[0] + rand() * (L.size[1] - L.size[0]),
        tone: Math.floor(rand() * L.tones),
      })
    }
  }
  return { limbs, strands, leaves }
}

// 벚나무: 짙은 줄기가 낮게 갈라져 옆으로 퍼지고, 가지 끝마다 꽃 뭉치 판(card)이 겹침
export const CHERRY_SIZE = {
  trunk: { h: 2.2, r0: 0.26, r1: 0.16 },
  main: { n: 5, len: 2.1, tilt: 0.95, r0: 0.13, r1: 0.06 },
  twig: { n: 3, len: 1.25, tilt: 1.2, r0: 0.05, r1: 0.018 },
  cards: { perTip: 9, spread: 0.75, size: [0.5, 0.92] },
  rings: 6,
}
export type Card = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; tone: number }

export function cherryShape(seed: number) {
  const C = CHERRY_SIZE
  const rand = seeded(seed)
  const limbs: Limb[] = []
  const lean = rand() * Math.PI * 2
  const trunk: Limb = grow([0, 0, 0], lean, 0.12, C.trunk.h, C.trunk.r0, C.trunk.r1, C.rings)
  limbs.push(trunk)
  const top = trunk.pts[C.rings]
  const cards: Card[] = []
  for (let i = 0; i < C.main.n; i++) {
    const a = (i / C.main.n) * Math.PI * 2 + rand() * 0.6
    const start = trunk.pts[C.rings - (i % 2)]
    const main = grow(i % 2 ? start : top, a, C.main.tilt, C.main.len * (0.8 + rand() * 0.4), C.main.r0, C.main.r1, C.rings)
    limbs.push(main)
    for (let k = 0; k < C.twig.n; k++) {
      const twig = grow(main.pts[C.rings - k * 2], a + (k - 1) * 0.9 + (rand() - 0.5) * 0.4, C.twig.tilt, C.twig.len * (0.8 + rand() * 0.5), C.twig.r0, C.twig.r1, C.rings)
      limbs.push(twig)
      const tip = twig.pts[C.rings]
      for (let n = 0; n < C.cards.perTip; n++) {
        cards.push({
          x: tip[0] + (rand() - 0.5) * C.cards.spread * 2,
          y: Math.max(2.4, tip[1] + (rand() - 0.4) * C.cards.spread),
          z: tip[2] + (rand() - 0.5) * C.cards.spread * 2,
          rx: rand() * Math.PI,
          ry: rand() * Math.PI * 2,
          rz: rand() * Math.PI,
          s: C.cards.size[0] + rand() * (C.cards.size[1] - C.cards.size[0]),
          tone: Math.floor(rand() * 4),
        })
      }
    }
  }
  return { limbs, cards }
}
