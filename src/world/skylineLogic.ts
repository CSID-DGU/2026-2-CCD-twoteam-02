// 먼 도시 스카이라인 (지평선에 보이는 빌딩 숲). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 우리 동네(캠리단길·캠퍼스)는 낮은 거리라, 멀리 보이는 도심을 따로 둡니다. 건물을 월드 가운데에서
// inner~outer 거리 고리에 흩뿌리고, 한쪽(downtown 방향)은 더 높고 빽빽하게 모아 도심처럼 보이게 합니다.
// 고정 씨앗이라 열 때마다 같은 모양입니다. 밤에만 보입니다(skylineFade): 해 질 녘부터 서서히 나타나 창에 불이 켜짐.
import type { Point } from './worldLogic'

// inner·outer: 고리 반지름(m). 하늘 공(GradientSky 400)·별(350)보다 안쪽이라 하늘에 가려지지 않음, count: 건물 수, h: 높이 범위, w: 폭 범위,
// downtown: 높은 건물이 모이는 방향(라디안, 0 = +z)과 퍼짐, boost: 그쪽 높이 배율
export const SKYLINE = { inner: 230, outer: 370, count: 170, h: [12, 34], w: [12, 30], downtown: { at: -2.2, spread: 0.9 }, boost: 2.6, seed: 51 } as const
export const TALL = 60 // 이보다 높으면 창이 촘촘한 질감 (높은 빌딩)
// 밤 빛남(0 낮 ~ 1 밤)이 from 부터 나타나기 시작해 to 에서 다 보임
export const FADE = { from: 0.15, to: 0.6 }

// 밤 빛남 → 보이는 정도(0 안 보임 ~ 1 다 보임)
export function skylineFade(glow: number): number {
  const t = Math.min(1, Math.max(0, (glow - FADE.from) / (FADE.to - FADE.from)))
  return t * t * (3 - 2 * t) // 부드럽게 (smoothstep)
}

export type Tower = { x: number; z: number; w: number; d: number; h: number; rot: number }

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// 두 각도 차이 (-π ~ π)
const angleGap = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export function skylineTowers(center: Point): Tower[] {
  const S = SKYLINE
  const rnd = seeded(S.seed)
  const out: Tower[] = []
  for (let i = 0; i < S.count; i++) {
    const a = rnd() * Math.PI * 2
    const r = S.inner + rnd() * (S.outer - S.inner)
    const near = Math.max(0, 1 - Math.abs(angleGap(a, S.downtown.at)) / S.downtown.spread) // 도심 쪽일수록 1
    const h = (S.h[0] + rnd() * (S.h[1] - S.h[0])) * (1 + (S.boost - 1) * near * (0.4 + rnd() * 0.6))
    out.push({
      x: center.x + Math.sin(a) * r,
      z: center.z + Math.cos(a) * r,
      w: S.w[0] + rnd() * (S.w[1] - S.w[0]),
      d: S.w[0] + rnd() * (S.w[1] - S.w[0]),
      h: Math.round(h * 10) / 10,
      rot: rnd() * Math.PI,
    })
  }
  return out
}
