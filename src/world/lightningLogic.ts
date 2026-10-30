// 광장 뇌우 번개 (#328). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// ── 언제 치나: 시간 칸 ──────────────────────────────────────────────
//   실제 시각을 65초 칸으로 나누고 칸마다 한 번 칩니다. 치는 순간은 칸 시작에서 0~25초 뒤이고,
//   칸 번호를 씨앗으로 한 고정 난수로 정해 같은 시각이면 모두 같은 때·같은 방향에서 칩니다(서버 신호 없음).
//   앞뒤 번개 간격 = 65초 + (뒤 칸 치는 순간 − 앞 칸 치는 순간) 이라 늘 40~90초입니다.
//   한 번 치는 데 약 1초라 칸 끝을 넘지 않아, 지금 칸 하나만 보면 됩니다.
//
// ── 깜빡임 ──────────────────────────────────────────────────────────
//   한 번 칠 때 2~3번 깜빡입니다(0초 세기 1, 0.40~0.50초 0.6, 반은 0.90~0.95초에 0.35).
//   깜빡임 사이가 늘 0.35초를 넘어 1초에 3번까지만 깜빡입니다(웹 접근성 WCAG 의 광과민 기준).
//   번개 줄기는 1·2번째 깜빡임 때만 보입니다.
//
// ── 확인용 주소 ─────────────────────────────────────────────────────
//   ?weather=storm 은 뇌우로 고정(weatherLogic), ?weather=storm:fast 는 칸을 8초로 줄여 6~10초마다 칩니다.
import { mix } from './skyLogic'
import type { WeatherSky } from './weatherLogic'

// 시간 칸 (ms). 간격 = SLOT ± JITTER
const SLOT_MS = 65_000
const JITTER_MS = 25_000
const FAST = { slot: 8_000, jitter: 2_000 } // ?weather=storm:fast
const LIGHTNING_SEED = 328
const STRIKE_MS = 1_200 // 한 번 치는 동안 (마지막 깜빡임이 꺼질 때까지 넉넉히)

// 깜빡임: 시작(초, [최소, 최대]), 하늘 세기, 줄기 세기
const PULSES = [
  { at: [0, 0], flash: 1, bolt: 1 },
  { at: [0.4, 0.5], flash: 0.6, bolt: 0.5 },
  { at: [0.9, 0.95], flash: 0.35, bolt: 0 }, // 반만 (THIRD_CHANCE). 2번째와 늘 0.4초 넘게 떨어지도록 0.9초부터
]
const THIRD_CHANCE = 0.5
const RISE_S = 0.03 // 이만큼에 세기까지 오르고
const FALL_S = 0.15 //  이만큼에 걸쳐 0으로 내려감

export const BOLT_SHAPES = 6 // 번개 줄기 모양 가짓수

// 번쩍일 때 색 (flash 1 기준)
const FLASH = { ambient: 1, ambientColor: 0xc8d4ff, overcastColor: 0xb8c4dc, cloud: 0.6 } // ambient: 세기 × (1 + 이 값·flash)

export type Lightning = { flash: number; bolt: number; azimuth: number; shape: number }
//   flash  : 하늘·빛 번쩍임 0~1 (깜빡임 세기 × storm)
//   bolt   : 번개 줄기 투명도 0~1 (줄기 세기 × storm)
//   azimuth: 줄기 방향(라디안, 광장 가운데 기준), shape: 줄기 모양 번호
export const NO_LIGHTNING: Lightning = { flash: 0, bolt: 0, azimuth: 0, shape: 0 }

// 고정 씨앗 의사난수 (mulberry32, weatherLogic 의 seeded 와 같은 식)
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 깜빡임 하나의 밝기 모양: 시작 후 t초. 빨리 오르고 천천히 꺼짐
function pulse(t: number): number {
  if (t < 0) return 0
  if (t < RISE_S) return t / RISE_S
  return Math.max(0, 1 - (t - RISE_S) / FALL_S)
}

// 지금(실제 시각 ms) 번개. storm(뇌우 정도 0~1)만큼 세기를 줄입니다. 뇌우가 아니면 바로 NO_LIGHTNING
export function lightningAt(now: number, storm: number, fast = false): Lightning {
  if (!(storm > 0)) return NO_LIGHTNING
  const slotMs = fast ? FAST.slot : SLOT_MS
  const jitterMs = fast ? FAST.jitter : JITTER_MS
  const slot = Math.floor(now / slotMs)
  const r = seeded(LIGHTNING_SEED ^ slot)
  // 뽑는 순서를 바꾸면 모두의 번개가 바뀌니 그대로 둡니다
  const strike = slot * slotMs + r() * jitterMs
  const azimuth = r() * 2 * Math.PI
  const third = r() < THIRD_CHANCE
  const starts = PULSES.map((p) => p.at[0] + (p.at[1] - p.at[0]) * r())
  const shape = Math.floor(r() * BOLT_SHAPES)
  const dt = now - strike
  if (dt < 0 || dt > STRIKE_MS) return NO_LIGHTNING
  const t = dt / 1000
  let flash = 0
  let bolt = 0
  for (let i = 0; i < PULSES.length; i++) {
    if (i === 2 && !third) break
    const k = pulse(t - starts[i])
    flash = Math.max(flash, PULSES[i].flash * k)
    bolt = Math.max(bolt, PULSES[i].bolt * k)
  }
  return { flash: flash * storm, bolt: bolt * storm, azimuth, shape }
}

// 확인용 주소가 ?weather=storm:fast 인지 (번개를 6~10초마다)
export function parseLightningFast(search: string): boolean {
  return new URLSearchParams(search).get('weather') === 'storm:fast'
}

// 번쩍인 하늘 값: 주변광을 올리고 푸른 흰색 쪽으로, 흐림 덮개를 밝은 회청색 쪽으로.
// 방향광(해·달)은 그대로 둡니다(그림자 방향이 튀지 않게). flash 0 이면 그대로
export function applyLightning(sky: WeatherSky, flash: number): WeatherSky {
  if (!(flash > 0)) return sky
  return {
    ...sky,
    ambient: { intensity: sky.ambient.intensity * (1 + FLASH.ambient * flash), color: mix(sky.ambient.color, FLASH.ambientColor, flash) },
    overcastColor: mix(sky.overcastColor, FLASH.overcastColor, flash),
  }
}

// 번쩍일 때 구름 색(0xrrggbb)을 흰색 쪽으로
export function flashCloudTint(tint: number, flash: number): number {
  return flash > 0 ? mix(tint, 0xffffff, FLASH.cloud * flash) : tint
}

// 줄기 판(앞면 +z)이 카메라 쪽을 보도록 세로축(y)으로 돌릴 각도(라디안). 판은 똑바로 선 채 수평으로만 돕니다.
// (drei Billboard 는 카메라 회전을 복사한 뒤 x·z 를 지워서, 카메라가 90도 넘게 돌면 판이 옆으로 섭니다)
export function boltFacing(boltX: number, boltZ: number, camX: number, camZ: number): number {
  return Math.atan2(camX - boltX, camZ - boltZ)
}

// ── 번개 줄기 모양 ──────────────────────────────────────────────────────
// 거리·폭 m. 줄기는 위(구름 높이)에서 땅까지 지그재그, 곁가지는 줄기 중간에서 한쪽으로 기울어 내려감
const BOLT = {
  top: 110,
  segments: 12,
  sway: 0.5, // 마디 끝을 좌우로 (마디 높이 × 이 값) 안에서 흔듦
  width: 1.6,
  taper: 0.6, // 바닥 폭 = 위 폭 × 이 값 (아래로 갈수록 가늘게)
  branches: [1, 2], // 곁가지 수
  branchFrom: [3, 8], // 곁가지가 시작하는 줄기 마디 끝 번호
  branchSegments: [4, 6],
  branchWidth: 0.8,
  branchStep: { dx: [3, 5], dy: [4.5, 6] }, // 곁가지 마디마다 옆·아래로
}

// 점 목록을 이어 폭 있는 띠로 만듦. 마디마다 사각형 = 삼각형 2개, 폭은 가로로만 벌림(높이가 0~top 을 벗어나지 않게)
function ribbon(out: number[], pts: [number, number][], width: (y: number) => number) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const h0 = width(y0) / 2
    const h1 = width(y1) / 2
    out.push(x0 - h0, y0, 0, x0 + h0, y0, 0, x1 + h1, y1, 0)
    out.push(x0 - h0, y0, 0, x1 + h1, y1, 0, x1 - h1, y1, 0)
  }
}

// 모양 번호 n 의 번개 줄기: 평면(z = 0) 위 삼각형 꼭짓점 (x, y, z 반복). 같은 n 이면 늘 같은 모양.
// WebGL 은 선 굵기가 늘 1픽셀이라 멀리서 안 보여, 얇은 띠(삼각형)로 만듭니다.
export function boltShape(n: number): Float32Array {
  const r = seeded(LIGHTNING_SEED + 1 + n)
  const between = ([a, b]: number[]) => a + (b - a) * r()
  const segH = BOLT.top / BOLT.segments
  const trunk: [number, number][] = [[0, BOLT.top]]
  for (let i = 1; i <= BOLT.segments; i++) {
    const x = trunk[i - 1][0] + (r() * 2 - 1) * segH * BOLT.sway
    trunk.push([x, i === BOLT.segments ? 0 : BOLT.top - i * segH])
  }
  const out: number[] = []
  const taper = (y: number) => BOLT.taper + (1 - BOLT.taper) * (y / BOLT.top)
  ribbon(out, trunk, (y) => BOLT.width * taper(y))
  const count = Math.round(between(BOLT.branches))
  for (let b = 0; b < count; b++) {
    const side = r() < 0.5 ? -1 : 1
    const pts: [number, number][] = [trunk[Math.round(between(BOLT.branchFrom))]]
    const segs = Math.round(between(BOLT.branchSegments))
    for (let i = 0; i < segs; i++) {
      const [x, y] = pts[pts.length - 1]
      pts.push([x + side * between(BOLT.branchStep.dx), Math.max(0, y - between(BOLT.branchStep.dy))])
    }
    ribbon(out, pts, (y) => BOLT.branchWidth * taper(y))
  }
  return new Float32Array(out)
}
