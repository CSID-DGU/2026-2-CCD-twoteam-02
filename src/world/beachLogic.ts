// 캠빛 해변 배치 계산. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 바다는 -z 쪽. 비치체어는 모두 바다를 봅니다. 파라솔 하나 양옆에 두 자리씩이고, 줄(rows)·칸(columns)으로 놓습니다.
// DB 좌석 번호는 1부터 줄·칸 순서대로(0058 의 seats 와 같음), Player 의 자리 번호는 base(BENCH_SEAT_BASE)를 더한 값.
// 벤치와 같이 빈자리에 앉으면 내 자리, 일어나면 놓음.
//   beachSeats    앉는 자리 24개
//   parasolSpots  파라솔 12개
//   beachObstacles 의자·파라솔 기둥·물 (물에는 들어갈 수 없음)
//   waveLevel     물과의 거리에 따른 파도 소리 크기 0.25~1
//   sightClear    앉은 자리에서 바다 쪽 시선이 파라솔에 막히지 않는지
//   onSand·stepGap 모래 발소리: 모래 위인지, 속도별 간격
import type { Box, Spot } from '../space/layout'

// torches: 모래 위 횃불 자리 (BeachLights)
export type BeachSpec = { shoreZ: number; rows: number[]; columns: number[]; chairGap: number; torches?: { x: number; z: number }[] }

export const CHAIR_BOX = { w: 0.6, d: 0.96 } // 비치체어 부딪힘 상자. 앞·뒤에서 다가가도 앉는 거리(0.9m) 안에 들게 실제 길이보다 짧게
export const CHAIR_SIT = { y: -0.14, lie: 0.18 } // 앉는 높이 보정, 뒤로 기대는 각도(라디안)
export const PARASOL = { r: 1.3, poleY: 2.45, rimY: 2.0, pole: 0.14, back: 0.45 } // 천 반지름, 꼭대기·천 끝 높이, 기둥 굵기, 의자 앞줄에서 뒤로 물린 거리
const TORCH_BOX = 0.2 // 횃불 대 부딪힘 상자 한 변
const SIGHT_POLE_CLEAR = 0.25 // 시선에서 기둥까지 이만큼은 비어야 함
const WAVE = { min: 0.25, falloff: 24 } // 파도 소리 최소 크기, 물가에서 최소가 되는 거리(m)
export const BOARDWALK = { z0: 11, z1: 14, sideGap: 1, stemW: 6 } // 나무 산책로: 가로 길 앞뒤, 양끝 여백, 문까지 세로 길 폭
export const STEP_GAP = { walk: 0.44, run: 0.28 } // 모래 발소리 사이 간격(초)
const STEP_MIN_SPEED = 0.3 // 이보다 느리면 걷는 게 아님 (m/s)
const STEP_RUN_SPEED = 6.2 // 이보다 빠르면 달리기 (moveSpeed.ts 의 걷기 5, 달리기 7.5 사이)
const SEA_ROT = Math.PI // 바다(-z)를 보는 방향

export function parasolSpots(b: BeachSpec): { x: number; z: number }[] {
  return b.rows.flatMap((z) => b.columns.map((x) => ({ x, z: z + PARASOL.back })))
}

export function beachSeats(b: BeachSpec, base: number): Spot[] {
  const out: Spot[] = []
  for (const z of b.rows) {
    for (const x of b.columns) {
      for (const side of [-1, 1]) {
        out.push({ no: base + out.length + 1, x: x + (side * b.chairGap) / 2, z, rot: SEA_ROT, y: CHAIR_SIT.y, lie: CHAIR_SIT.lie })
      }
    }
  }
  return out
}

// 물 상자: 물가에서 월드 뒤 끝까지
export function beachObstacles(b: BeachSpec, size: { w: number; d: number }): Box[] {
  const back = -size.d / 2
  return [
    { x: 0, z: (b.shoreZ + back) / 2, w: size.w, d: b.shoreZ - back },
    ...beachSeats(b, 0).map((s) => ({ x: s.x, z: s.z, ...CHAIR_BOX })),
    ...parasolSpots(b).map((p) => ({ x: p.x, z: p.z, w: PARASOL.pole, d: PARASOL.pole })),
    ...(b.torches ?? []).map((t) => ({ x: t.x, z: t.z, w: TORCH_BOX, d: TORCH_BOX })),
  ]
}

// 물가와 그 앞(z ≤ shoreZ)은 1, 멀어질수록 줄어 WAVE.min 에서 멈춤
export function waveLevel(z: number, shoreZ: number): number {
  const t = Math.min(1, Math.max(0, z - shoreZ) / WAVE.falloff)
  return 1 - (1 - WAVE.min) * t
}

// 바다 쪽(-z) 곧은 시선. 앞에 있는 파라솔 기둥에 막히거나, 눈이 천 높이까지 올라가 천에 막히면 false
export function sightClear(seat: Spot, parasols: { x: number; z: number }[], eyeY: number): boolean {
  return parasols.every((p) => {
    const dx = Math.abs(p.x - seat.x)
    const ahead = p.z < seat.z
    if (ahead && dx < SIGHT_POLE_CLEAR) return false
    if (eyeY >= PARASOL.rimY && dx < PARASOL.r && seat.z - p.z < PARASOL.r) return false
    return true
  })
}

// 모래 위인지 (나무 산책로 위는 모래가 아님). 발소리에 씁니다
export function onSand(x: number, z: number, size: { w: number; d: number }): boolean {
  const onCross = z >= BOARDWALK.z0 && z <= BOARDWALK.z1 && Math.abs(x) <= size.w / 2 - BOARDWALK.sideGap
  const onStem = z > BOARDWALK.z1 && Math.abs(x) <= BOARDWALK.stemW / 2
  return !onCross && !onStem
}

// 이동 속도(m/s)에 맞는 발소리 간격(초). 서 있으면 null
export function stepGap(speed: number): number | null {
  if (speed < STEP_MIN_SPEED) return null
  return speed > STEP_RUN_SPEED ? STEP_GAP.run : STEP_GAP.walk
}

// 나무 산책로 가장자리의 작은 말뚝 자리: 가로 길 앞뒤, 문까지 세로 길 양옆. 세로 길이 만나는 곳은 비움. 걸어 지나갈 수 있습니다(부딪힘 없음)
export const POST = { step: 1.1, r: 0.055, h: 0.42 } // 간격, 반지름, 높이
export function boardwalkPosts(size: { w: number; d: number }): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  const edge = size.w / 2 - BOARDWALK.sideGap
  for (let x = -edge; x <= edge + 0.01; x += POST.step) {
    out.push({ x, z: BOARDWALK.z0 })
    if (Math.abs(x) >= BOARDWALK.stemW / 2) out.push({ x, z: BOARDWALK.z1 })
  }
  for (let z = BOARDWALK.z1 + POST.step; z < size.d / 2 - 1; z += POST.step) {
    for (const sx of [-1, 1]) out.push({ x: (sx * BOARDWALK.stemW) / 2, z })
  }
  return out
}

// 모래 위 조개껍질 자리: 값을 고정해 모두에게 같은 자리, 물가에 더 많이. 산책로·의자 밑은 피함. kind: 0 부채꼴 1 소라
export type ShellSpot = { x: number; z: number; rot: number; scale: number; kind: 0 | 1; tint: number }
const SHELL = { shoreBand: 7, nearShare: 0.55, seatClear: 0.85, scale: [0.75, 1.4], margin: 1, tints: 4 }
export function shellSpots(b: BeachSpec, size: { w: number; d: number }, count: number): ShellSpot[] {
  let seed = 4242
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const seats = beachSeats(b, 0)
  const out: ShellSpot[] = []
  while (out.length < count) {
    const nearShore = rnd() < SHELL.nearShare
    const zLo = b.shoreZ + 0.5
    const z = nearShore ? zLo + rnd() * SHELL.shoreBand * 0.8 : zLo + rnd() * (size.d / 2 - zLo - SHELL.margin)
    const x = (rnd() - 0.5) * (size.w - SHELL.margin * 2)
    const rot = rnd() * Math.PI * 2
    const scale = SHELL.scale[0] + rnd() * (SHELL.scale[1] - SHELL.scale[0])
    const kind = rnd() < 0.72 ? 0 : 1
    const tint = Math.floor(rnd() * SHELL.tints)
    if (!onSand(x, z, size) || seats.some((c) => Math.hypot(c.x - x, c.z - z) <= SHELL.seatClear)) continue
    out.push({ x, z, rot, scale, kind, tint })
  }
  return out
}
