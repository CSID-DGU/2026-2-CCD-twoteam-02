// 황도 12궁 별자리 계산 (#321). React·three.js 와 무관한 순수 로직입니다.
//
// 자료(constellations.json): 별자리마다 주요 별의 적경(시)·적위(도)·밝기(등급)와 별을 잇는 선. 공개 천문 자료의 값이며
// 여기서는 별자리 "모양"을 그리는 데만 씁니다.
//
// ── 머리 위 12달 원 ─────────────────────────────────────────────────
//   실제 하늘 위치는 계절에 따라 지평선 아래로 가서 내 별자리를 못 찾을 때가 많아, 머리 위를 둘러싼 원에 늘어놓습니다.
//   (2026-10-30 사용자 결정) 고도 40°(처음 50° 는 너무 높고 다닥다닥해 내림. 더 낮추면 2층 건물에 아래 별이 가림), 북쪽부터 시계 방향으로 1월~12월, 30° 간격.
//   달 = 그 별자리가 시작하는 달 (물병자리 1/20~ → 1월).
//   모양: 별자리 별들의 평균 방향을 가운데로 잡고 접평면(동·북)에 펼친 뒤, 가장 먼 별이 6° 가 되게 크기를 맞춰
//   원 위 자리에 올립니다. 별자리의 북쪽이 머리 위(천정) 쪽, 동쪽은 하늘을 올려다볼 때처럼 왼쪽입니다.
//
// ── 조준점 고르기 ───────────────────────────────────────────────────
//   조준점 방향과 별자리의 별·선 사이 가장 가까운 각이 3° 이하인 별자리 중 가장 가까운 것. 먼 하늘은 안 눌립니다.
import data from './constellations.json' with { type: 'json' }
import { toDirection } from './skyLogic'
import type { Vec3 } from './skyLogic'

export type Star = { ra: number; dec: number; mag: number } // ra 시, dec 도, mag 등급(작을수록 밝음)
// month: 원 위 달(그 별자리가 시작하는 달), from·to: 탄생 날짜 'MM-DD'
export type Sign = { id: string; name: string; month: number; from: string; to: string; stars: Star[]; lines: [number, number][] }
// 원 위에 놓인 별자리 (모두 단위 방향)
export type RingSign = { id: string; name: string; month: number; center: Vec3; stars: Vec3[]; label: Vec3 }

// JSON 은 lines 가 number[][] 로 읽혀 타입만 맞춥니다. (값은 검사 스크립트가 확인)
export const SIGNS = data as Sign[]

const RAD = Math.PI / 180
const RING = { altitude: 40 * RAD, spacing: 30 * RAD, size: 12 * RAD } // 원 높이, 별자리 간격, 별자리 크기(지름)
const LABEL_BELOW = 2 * RAD // 이름표는 별자리 아래 끝에서 이만큼 더 아래
const PICK = 3 * RAD // 조준점이 별·선에서 이 각 안쪽이면 그 별자리

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))))

// 적도 좌표의 단위 벡터 (x: 적경 0시, z: 천구 북극)
const equatorial = (s: Star): Vec3 => {
  const ra = s.ra * 15 * RAD
  const dec = s.dec * RAD
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) }
}

// 별자리 모양을 접평면 좌표(동 u, 북 w)로 펼침
function flatten(stars: Star[]): { u: number; w: number }[] {
  const vs = stars.map(equatorial)
  const c = norm(vs.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y, z: a.z + v.z }), { x: 0, y: 0, z: 0 }))
  const east = norm(cross({ x: 0, y: 0, z: 1 }, c)) // 적경이 커지는 쪽
  const north = cross(c, east)
  return vs.map((v) => ({ u: dot(v, east) / dot(v, c), w: dot(v, north) / dot(v, c) }))
}

export function ringLayout(): RingSign[] {
  return [...SIGNS]
    .sort((a, b) => a.month - b.month)
    .map((sign) => {
      const azimuth = (sign.month - 1) * RING.spacing
      const center = toDirection({ altitude: RING.altitude, azimuth })
      const up = norm({ x: -center.x * center.y, y: 1 - center.y * center.y, z: -center.z * center.y }) // 천정 쪽 (접평면)
      const left = cross(up, center) // 올려다볼 때 왼쪽 = 동쪽
      const flat = flatten(sign.stars)
      const far = Math.max(...flat.map((p) => Math.hypot(p.u, p.w)))
      const k = Math.tan(RING.size / 2) / far
      const stars = flat.map((p) =>
        norm({
          x: center.x + k * (p.u * left.x + p.w * up.x),
          y: center.y + k * (p.u * left.y + p.w * up.y),
          z: center.z + k * (p.u * left.z + p.w * up.z),
        }),
      )
      const label = toDirection({ altitude: RING.altitude - RING.size / 2 - LABEL_BELOW, azimuth })
      return { id: sign.id, name: sign.name, month: sign.month, center, stars, label }
    })
}

// 점 p 에서 대원 호 a–b 까지의 각
function arcDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const n = cross(a, b)
  const nl = Math.hypot(n.x, n.y, n.z)
  if (nl < 1e-9) return angle(p, a)
  const nn = { x: n.x / nl, y: n.y / nl, z: n.z / nl }
  const d = dot(p, nn)
  const q = norm({ x: p.x - d * nn.x, y: p.y - d * nn.y, z: p.z - d * nn.z }) // 대원 위로 내린 점
  const onArc = Math.abs(angle(a, q) + angle(q, b) - angle(a, b)) < 1e-6
  return onArc ? Math.asin(Math.min(1, Math.abs(d))) : Math.min(angle(p, a), angle(p, b))
}

export function pickRingSign(ray: Vec3, ring: RingSign[]): string | null {
  const r = norm(ray)
  let best: { id: string; d: number } | null = null
  for (const s of ring) {
    const sign = SIGNS.find((x) => x.id === s.id)
    const lineD = (sign?.lines ?? []).map(([a, b]) => arcDistance(r, s.stars[a], s.stars[b]))
    const d = Math.min(...s.stars.map((st) => angle(r, st)), ...lineD)
    if (d <= PICK && (!best || d < best.d)) best = { id: s.id, d }
  }
  return best?.id ?? null
}

// 생일(양력 월·일) → 탄생 별자리 id
export function signOfBirthday(month: number, day: number): string {
  const today = month * 100 + day
  const md = (s: string) => Number(s.slice(0, 2)) * 100 + Number(s.slice(3, 5))
  const hit = SIGNS.find((s) => {
    const from = md(s.from)
    const to = md(s.to)
    return from <= to ? today >= from && today <= to : today >= from || today <= to // 염소자리는 해를 넘김
  })
  return (hit ?? SIGNS[0]).id
}
