// 물결 라운지 가운데 원통 어항. 물고기 움직임 계산만 둔 순수 로직입니다. (Node 로 검사)
// 좌표는 어항 가운데 기준. 물고기는 +z 를 보는 모양이라 yaw 만큼 y 축으로 돌리면 진행 방향을 봅니다.

// r: 어항 반지름, barTop: 바 상판 높이(어항이 여기서 시작), waterBottom·waterTop: 물고기가 다니는 높이, cap: 위 원통이 시작되는 높이
export const AQUARIUM = { r: 1.0, barTop: 1.02, waterBottom: 1.25, waterTop: 3.15, cap: 3.3 }
export const FISH_COUNT = 12
const FISH_RINGS = [0.86, 0.74, 0.62] // 도는 반지름 (m). 가운데 바위 기둥을 피해 둘레로
const FISH_SPEED = 0.28 // 각속도 기준 (rad/s). 차분하게 천천히
const BOB = 0.1 // 위아래로 떠오르는 폭 (m)

export type FishPose = { x: number; y: number; z: number; yaw: number }

export function fishPose(i: number, t: number): FishPose {
  const R = FISH_RINGS[i % FISH_RINGS.length]
  const dir = i % 2 ? -1 : 1 // 반은 반대 방향으로
  const omega = dir * FISH_SPEED * (1 + (i % 4) * 0.18)
  const a = i * 2.399 + omega * t // 황금각으로 흩어 놓음
  const span = AQUARIUM.waterTop - AQUARIUM.waterBottom - BOB * 2
  const y = AQUARIUM.waterBottom + BOB + span * ((i * 0.381) % 1) + Math.sin(t * 0.5 + i) * BOB
  // 위치 (R cos a, R sin a) 의 진행 방향 = dir × (-sin a, cos a)
  return { x: R * Math.cos(a), y, z: R * Math.sin(a), yaw: Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) }
}
