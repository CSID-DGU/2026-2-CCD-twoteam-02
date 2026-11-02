// 캠프파이어 (캠리단길 광장 서쪽 잔디). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// world.json 의 campfire: 불 가운데(x·z), 통나무 의자가 놓이는 둥근 고리 반지름(r), 통나무 수(logs).
//   campfireSeats  통나무 자리. 벤치처럼 공부 자리(광장 DB 좌석)이고 번호는 벤치 다음부터(벤치 16석 → 17~).
//                  불을 바라봄. 통나무는 빈백처럼 부딪히지 않고, 불 둘레 돌 고리만 막음(fireBox).
//   fireLoudness   불에서의 거리 → 소리 크기 0~1 (가까이 가면 타닥타닥, 멀어지면 조용히)
//   stall*         옆 마시멜로 가판대 (campfire.stall): 카운터 상자, 판매원(바리스타 NPC 와 같은 모양), 앞에서 E 로 받는 자리
//   toast*         받은 마시멜로 굽기: 불 가까이 있는 동안 익어 하양 → 노릇 → 갈색 → 탐. 먹으면 굽기 정도에 맞는 한마디
import type { Box } from '../space/layout'
import type { Point } from './worldLogic'
import type { Barista, Facing } from '../space/baristaLogic'
import { COUNTER, counterBox, orderSpot } from '../space/baristaLogic'

// stall: 가판대 가운데(x·z)·폭(w)·손님 쪽 방향(facing). 판매원 모습은 STALL_LOOK
export type StallSpec = { x: number; z: number; w: number; facing: Facing }
export type CampfireSpec = { x: number; z: number; r: number; logs: number; stall?: StallSpec }

// ring: 불 둘레 돌 고리 반지름, near·far: 이 거리 안이면 소리 최대, 밖이면 소리 없음(m)
export const CAMPFIRE = { ring: 0.75, near: 3.5, far: 13 }

// 통나무 자리: 고리 위에 같은 간격. 동서남북은 비워(반 칸 돌려) 사이로 걸어 들어감(광장 쪽 길이 동쪽에서 옴). rot = 불을 보는 방향(0 = +z)
export function campfireSeats(fire: CampfireSpec, firstNo: number) {
  return Array.from({ length: fire.logs }, (_, i) => {
    const a = Math.PI + ((i + 0.5) * 2 * Math.PI) / fire.logs // 불에서 자리 쪽 각도 (sin, cos)
    return { no: firstNo + i, x: fire.x + Math.sin(a) * fire.r, z: fire.z + Math.cos(a) * fire.r, rot: normalize(a + Math.PI) }
  })
}

export const fireBox = (fire: CampfireSpec): Box => ({ x: fire.x, z: fire.z, w: CAMPFIRE.ring * 2, d: CAMPFIRE.ring * 2 })

export function fireLoudness(fire: Point, p: Point) {
  const d = Math.hypot(p.x - fire.x, p.z - fire.z)
  if (d <= CAMPFIRE.near) return 1
  if (d >= CAMPFIRE.far) return 0
  const t = 1 - (d - CAMPFIRE.near) / (CAMPFIRE.far - CAMPFIRE.near)
  return t * t // 멀어질수록 빨리 작아짐
}

function normalize(a: number) {
  const r = Math.atan2(Math.sin(a), Math.cos(a))
  return Math.abs(r) < 1e-9 ? 0 : r
}

// ── 마시멜로 가판대 ──
// 판매원·카운터 자리 계산은 카페 바리스타와 같은 규칙(baristaLogic). 메뉴는 마시멜로 하나 (돈 없이 받음, 내 화면에만)
export const MARSHMALLOW = { name: '마시멜로', icon: '🍡', food: 'marshmallow' as const }
export const STALL_LOOK = { hair: 'space-buns-textured', hairColor: '#3b2a1e', top: 'longsleeve', topColor: '#c0392b', bottomColor: '#3b3b46', apron: '#f4efe6', hat: 'beret' as const, hatColor: '#e9c46a' }
export const stallBarista = (s: StallSpec): Barista => ({ x: s.x, z: s.z, w: s.w, facing: s.facing, counter: false, look: STALL_LOOK, menu: [MARSHMALLOW], greeting: '마시멜로 구워 드실래요? 🔥' })
export const stallBoxes = (s: StallSpec) => {
  const b = stallBarista(s)
  return [counterBox(b), { ...vendorSpot(b), w: COUNTER.d * 0.6, d: COUNTER.d * 0.6 }]
}
export const stallOrderSpot = (s: StallSpec) => orderSpot(stallBarista(s))
function vendorSpot(b: Barista) {
  const d = { south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0] }[b.facing]
  return { x: b.x - d[0] * COUNTER.behind, z: b.z - d[1] * COUNTER.behind }
}

// ── 굽기 ──
// toast: 0 = 생 마시멜로, 1 = 노릇노릇(가장 맛있음), 2 = 까맣게 탐. 불에서 ROAST.reach m 안이면 1초에 1/ROAST.golden 씩
export const ROAST = { reach: 3.4, golden: 14, max: 2.2 }
export function toastStep(toast: number, dt: number, fire: Point, p: Point) {
  if (Math.hypot(p.x - fire.x, p.z - fire.z) > ROAST.reach) return toast
  return Math.min(ROAST.max, toast + dt / ROAST.golden)
}
const STOPS: [number, string][] = [
  [0, '#fbf7f0'],
  [0.5, '#f3d9a0'],
  [1, '#d9a35a'],
  [1.5, '#8a5a2b'],
  [2, '#2a1d14'],
]
// 굽기 정도 → 마시멜로 색 (단계 사이는 섞음)
export function toastColor(t: number) {
  const x = Math.max(0, Math.min(2, t))
  let i = 0
  while (i < STOPS.length - 2 && x > STOPS[i + 1][0]) i++
  const [a0, c0] = STOPS[i]
  const [a1, c1] = STOPS[i + 1]
  const k = (x - a0) / (a1 - a0)
  const ch = (c: string, j: number) => parseInt(c.slice(1 + j * 2, 3 + j * 2), 16)
  return '#' + [0, 1, 2].map((j) => Math.round(ch(c0, j) + (ch(c1, j) - ch(c0, j)) * k).toString(16).padStart(2, '0')).join('')
}
// 굽기 정도 이름 (먹기 버튼) 과 먹었을 때 한마디
export function toastLabel(t: number) {
  return t < 0.15 ? '생 마시멜로' : t < 0.6 ? '살짝 구움' : t < 1.2 ? '노릇노릇' : t < 1.7 ? '바삭한 갈색' : '까맣게 탐'
}
export function eatLine(t: number) {
  return t < 0.15
    ? '냠… 말랑하지만 불에 구워 먹으면 더 맛있어요!'
    : t < 0.6
      ? '냠냠! 겉이 살짝 따뜻해요'
      : t < 1.2
        ? '냠냠! 노릇노릇 완벽하게 구웠어요 🤤'
        : t < 1.7
          ? '바삭! 겉은 바삭 속은 쭉 늘어나요'
          : '앗 써… 너무 오래 구워서 탔어요 😅'
}
