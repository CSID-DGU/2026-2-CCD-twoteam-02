// 캠리단길 전구 줄 (가로등 사이에 거는 줄 조명). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   wirePoint    줄 위 한 점 (t 0 ~ 1). 양 끝은 기둥에 매단 높이, 가운데로 갈수록 포물선으로 처짐
//   stringBulbs  줄마다 STRING.gap 간격으로 단 전구 자리 (양 끝 기둥 자리는 뺌)
// 줄을 거는 가로등 쌍은 world.json 의 strings 에 둡니다.
import type { Point } from './worldLogic'

// top: 기둥에 매단 높이(가로등 머리 3m 바로 아래), sag: 가장 많이 처지는 깊이(긴 줄도 머리 위 2.35m 까지만),
// perMeter: 짧은 줄은 길이에 비례해 덜 처짐, gap: 전구 간격(m)
export const STRING = { top: 2.85, sag: 0.5, perMeter: 0.05, gap: 0.8 }

export type Wire = { from: Point; to: Point }
export type Vec3 = { x: number; y: number; z: number }

export const sagOf = (length: number) => Math.min(STRING.sag, length * STRING.perMeter)

export function wirePoint(a: Point, b: Point, t: number): Vec3 {
  const sag = sagOf(Math.hypot(b.x - a.x, b.z - a.z))
  return { x: a.x + (b.x - a.x) * t, y: STRING.top - sag * 4 * t * (1 - t), z: a.z + (b.z - a.z) * t }
}

export function stringBulbs(wires: Wire[]): Vec3[] {
  const bulbs: Vec3[] = []
  for (const { from, to } of wires) {
    const n = Math.round(Math.hypot(to.x - from.x, to.z - from.z) / STRING.gap)
    for (let i = 1; i < n; i++) bulbs.push(wirePoint(from, to, i / n))
  }
  return bulbs
}
