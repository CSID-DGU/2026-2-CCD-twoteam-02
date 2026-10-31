// 광장 하늘색: 노을·동틀 녘 그라데이션. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 하늘은 머리 위 → 중간 → 지평선 세 색 그라데이션이고(GradientSky), 해가 있는 쪽 지평선은 노을빛(glow)으로 더 물듭니다.
// 지평선 색(horizon)은 해 반대쪽 지평선 색이라 노을 때 분홍빛이고, 주황은 해 쪽 노을빛(glow)이 냅니다.
// 색은 해 고도(°)만으로 정해서 동틀 녘과 해 질 녘이 같은 색입니다. 아래 KEYS 표의 고도 사이는 두 줄을 부드럽게 섞고,
// 표 밖(가장 낮은 줄 아래, 가장 높은 줄 위)은 끝 줄 그대로입니다. 밤 줄은 예전 밤 덮개 색(#316)과 같습니다.
//
//   해      고도가 낮을수록 크고 주황빛. 지평선에 걸리면 GradientSky 가 아래 반쪽을 가림. SUN.hideDeg 아래면 안 보임
//   흐림    구름 양(0~1)만큼 노을빛·해가 약해짐 (CLOUD_FADE)
//   구름    cloud 색 (weatherLogic 의 cloudTint 가 씀. 비·눈이 오면 거기서 회색 쪽으로)
//   주변광  warm 만큼 주변광 색을 노을빛 쪽으로(warmSky). 광장 땅·건물이 노을빛을 받는 느낌
import { mix } from './skyLogic'
import type { SkyState } from './skyLogic'

// 해 고도별 기준 색 (0xrrggbb). glowAmount: 노을빛 세기, warm: 주변광을 노을빛 쪽으로 섞는 정도
type Key = { deg: number; zenith: number; mid: number; horizon: number; glow: number; glowAmount: number; cloud: number; warm: number }
export const KEYS: Key[] = [
  { deg: -14, zenith: 0x0b1630, mid: 0x182650, horizon: 0x24365f, glow: 0x24365f, glowAmount: 0, cloud: 0x2a3350, warm: 0 }, // 밤
  { deg: -8, zenith: 0x111d42, mid: 0x2a2c5c, horizon: 0x4a3a66, glow: 0x8a4050, glowAmount: 0.5, cloud: 0x4a3a5a, warm: 0 }, // 박명
  { deg: -3, zenith: 0x1d2c5e, mid: 0x5a4a82, horizon: 0x9a5a72, glow: 0xe0603a, glowAmount: 0.9, cloud: 0xc07088, warm: 0.3 }, // 해 진 직후
  { deg: 0, zenith: 0x2c4278, mid: 0x8a6a9a, horizon: 0xe0907e, glow: 0xff6a24, glowAmount: 1, cloud: 0xff9a6a, warm: 0.5 }, // 일몰·일출
  { deg: 4, zenith: 0x3a63a8, mid: 0x9fb0d0, horizon: 0xf0b48e, glow: 0xff9040, glowAmount: 0.8, cloud: 0xffb88a, warm: 0.4 }, // 해 낮음
  { deg: 10, zenith: 0x3f78c8, mid: 0x8ab4e0, horizon: 0xf0d0a8, glow: 0xffd090, glowAmount: 0.35, cloud: 0xfff0e0, warm: 0.15 }, // 황금빛
  { deg: 25, zenith: 0x3b7bd4, mid: 0x7fb2ea, horizon: 0xcfe6f7, glow: 0xffffff, glowAmount: 0.15, cloud: 0xffffff, warm: 0 }, // 낮
]

// 해: 색·크기(각 반지름, 라디안. 실제 해 0.0047 보다 크게 그려 보기 좋게)·빛번짐 세기. low 는 지평선, high 는 highDeg 이상
export const SUN = {
  color: { low: 0xffb347, high: 0xfffbe8 },
  size: { low: 0.07, high: 0.04 },
  halo: { low: 1, high: 0.5 },
  highDeg: 25,
  hideDeg: -2, // 해가 이 고도 아래면 해·빛번짐 0 (0° 에서 이 고도까지 서서히 사라짐)
}
export const CLOUD_FADE = { glow: 0.7, sun: 0.9 } // 구름 양 1 이면 노을빛 70%·해 90% 줄어듦
export const WARM_AMBIENT = 0xffb98a // 노을 때 주변광을 섞는 색

export type SkyPalette = {
  zenith: number
  mid: number
  horizon: number
  glow: number
  glowAmount: number
  cloud: number
  warm: number
  sun: number // 해 색
  sunSize: number // 해 각 반지름(라디안)
  sunShow: number // 해·빛번짐 보이는 정도 0~1
  halo: number // 빛번짐 세기
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 해 고도(°)와 구름 양(0~1)으로 하늘색을 정합니다.
export function skyPalette(sunDeg: number, cloud = 0): SkyPalette {
  // 고도가 들어가는 두 줄 a·b 와 그 사이 비율 t
  let i = 0
  while (i < KEYS.length - 2 && sunDeg > KEYS[i + 1].deg) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = smooth(clamp01((sunDeg - a.deg) / (b.deg - a.deg)))
  const c = clamp01(cloud)
  const high = clamp01(sunDeg / SUN.highDeg) // 0 지평선 ~ 1 높이 뜸
  const rise = clamp01((sunDeg - SUN.hideDeg) / -SUN.hideDeg) // 0 (hideDeg 아래) ~ 1 (지평선 위)
  return {
    zenith: mix(a.zenith, b.zenith, t),
    mid: mix(a.mid, b.mid, t),
    horizon: mix(a.horizon, b.horizon, t),
    glow: mix(a.glow, b.glow, t),
    glowAmount: lerp(a.glowAmount, b.glowAmount, t) * (1 - CLOUD_FADE.glow * c),
    cloud: mix(a.cloud, b.cloud, t),
    warm: lerp(a.warm, b.warm, t),
    sun: mix(SUN.color.low, SUN.color.high, high),
    sunSize: lerp(SUN.size.low, SUN.size.high, high),
    sunShow: smooth(rise) * (1 - CLOUD_FADE.sun * c),
    halo: lerp(SUN.halo.low, SUN.halo.high, high),
  }
}

// 해가 낮을 때 주변광 색을 노을빛 쪽으로 섞습니다. 낮·밤(warm 0)에는 그대로입니다.
export function warmSky<T extends SkyState>(sky: T): T {
  const warm = skyPalette((sky.sun.altitude * 180) / Math.PI).warm
  if (warm <= 0) return sky
  return { ...sky, ambient: { ...sky.ambient, color: mix(sky.ambient.color, WARM_AMBIENT, warm) } }
}
