// 루프탑 카페 소품 자리 계산 (이끼 루프탑). React·three 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   candleTables   캔들 테이블 자리(desk 'candle')를 테이블 하나씩으로 묶음 (마주 앉는 두 자리가 한 테이블)
//   pergolaSlats   퍼걸러 지붕살 자리 (x0~x1 사이를 SLAT_GAP 간격으로)
//   treeLights     나무에 감은 전구 자리: 줄기를 감아 오르고, 잎 덩이 둘레에 흩뿌림 (고정 씨앗이라 늘 같은 자리)
//   glowOf         밤 빛남(0 낮 ~ 1 밤) → 루프탑 불빛 세기 (해 질 녘부터 켜짐)
import type { Rooftop, RooftopPoint } from './theme'

export const SLAT_GAP = 0.32 // 퍼걸러 지붕살 간격
export const TREE = { trunkH: 1.5, crownR: 1.05, crownY: 2.35 } // 화분 위 줄기 높이, 잎 덩이 반지름·가운데 높이
export const TREE_LIGHTS = { trunk: 26, crown: 90, turns: 4 } // 줄기를 감는 전구 수·바퀴, 잎 둘레 전구 수
// 불빛 세기: 낮에도 조금(전구가 보이게), 밤에 가장 밝게. 해 질 녘 밤 빛남이 FROM 을 넘으면 빠르게 밝아짐
export const GLOW = { day: 0.15, night: 2.4, from: 0.05 }

type SeatLike = { x: number; z: number; desk?: string }

// 같은 테이블(같은 책상 자리)을 쓰는 자리를 하나로
export function candleTables(seats: SeatLike[]): RooftopPoint[] {
  const out: RooftopPoint[] = []
  for (const s of seats) {
    if (s.desk !== 'candle') continue
    if (!out.some((t) => Math.abs(t.x - s.x) < 0.01 && Math.abs(t.z - s.z) < 0.01)) out.push({ x: s.x, z: s.z })
  }
  return out
}

// 퍼걸러 지붕살: 양 끝 보 사이를 고른 간격으로 (양 끝 포함)
export function pergolaSlats(p: Rooftop['pergola']): number[] {
  const n = Math.max(1, Math.round((p.x1 - p.x0) / SLAT_GAP))
  return Array.from({ length: n + 1 }, (_, i) => p.x0 + ((p.x1 - p.x0) * i) / n)
}

// 고정 씨앗 난수 (열 때마다 같은 자리)
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// 나무 전구 자리 (나무 가운데 기준, 화분 윗면이 y 0)
export function treeLights(): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = []
  const L = TREE_LIGHTS
  for (let i = 0; i < L.trunk; i++) {
    const t = i / (L.trunk - 1)
    const a = t * L.turns * Math.PI * 2
    out.push({ x: Math.cos(a) * 0.12, y: 0.15 + t * (TREE.trunkH - 0.2), z: Math.sin(a) * 0.12 })
  }
  const rnd = seeded(77)
  for (let i = 0; i < L.crown; i++) {
    // 잎 덩이 겉면 근처 (아래쪽 반은 덜): 높이를 먼저 고르고 그 높이의 둘레에
    const y = -0.7 + rnd() * 1.4
    const ring = Math.sqrt(Math.max(0, 1 - (y / TREE.crownR) ** 2)) * TREE.crownR * (0.92 + rnd() * 0.12)
    const a = rnd() * Math.PI * 2
    out.push({ x: Math.cos(a) * ring, y: TREE.crownY + y * 0.8, z: Math.sin(a) * ring })
  }
  return out
}

// 밤 빛남 → 불빛 세기
export function glowOf(night: number): number {
  const k = Math.min(1, Math.max(0, (night - GLOW.from) / (1 - GLOW.from)))
  return GLOW.day + (GLOW.night - GLOW.day) * Math.sqrt(k)
}
