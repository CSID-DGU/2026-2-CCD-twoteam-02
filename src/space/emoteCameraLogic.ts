// 감정표현 카메라가 어디로 얼마나 빠질지 (화면·three.js 와 무관한 순수 로직).
//
// 감정표현을 하면 카메라가 내 앞으로 빠져 돌아서서 나를 비춥니다(WalkCamera). 전에는 무조건 앞으로 2.6m 라서
//   - 벽·건물을 보고 서 있으면 카메라가 벽 속으로 들어가 내가 안 보였고
//   - 앞에 사람이 가까이 서 있으면 카메라가 그 사람 뒤로 가서 그 사람 등에 내가 가려졌습니다.
// 그래서 3인칭 게임 카메라처럼:
//   freeDistance   어떤 방향으로 벽(상자)·사람에 닿기 전까지 갈 수 있는 거리
//   pickEmoteView  앞이 충분히 트였으면 앞, 아니면 옆·뒤 중 가장 트인 방향. 사방이 막혔으면 null(카메라를 빼지 않음)
// 각도 규칙은 캐릭터와 같습니다: 0 = +z, 방향 = (sin 각도, cos 각도)
import type { Box } from './layout'

export type Point = { x: number; z: number }

export const EMOTE_CAMERA = {
  distance: 2.6, // 트여 있을 때 카메라가 빠지는 거리 (m)
  prefer: 2.0, // 앞이 이만큼 트였으면 앞에서 비춤. 아니면 다른 방향을 찾아봄
  min: 1.2, // 이보다 가까우면 캐릭터가 화면에 다 안 들어와서 그 방향은 쓰지 않음
  margin: 0.25, // 벽에서 띄우는 거리. 캐릭터 충돌 반경(0.3)보다 작아야 벽에 붙어 서 있어도 출발점이 벽 여유 안에 안 들어감
  person: 0.45, // 다른 사람이 가리는 반지름 (몸 폭 + 여유). 카메라가 사람 속·뒤로 가지 않게 멈추는 기준
  personView: 0.9, // 방향을 고를 때 사람을 이만큼 넓게 봄. 카메라 선에서 이 안에 선 사람은 화면에서 내 몸(든 팔)과 겹쳐 보임
  overlap: 0.2, // 나와 이만큼 겹쳐 서 있는 사람은 어느 방향으로도 못 피하므로 계산에서 뺌
}

// 살펴보는 순서: 앞 → 앞 대각선 → 옆 → 뒤 대각선 → 뒤 (내가 보는 방향 기준). 같은 각도면 오른쪽(-)이 먼저:
// 한 팔로 하는 동작(손 흔들기·딱밤·발차기)이 모두 오른쪽이라, 왼쪽에서 비추면 움직이는 팔이 몸 뒤로 가려짐
const OFFSETS = [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, -(Math.PI * 3) / 4, (Math.PI * 3) / 4, Math.PI]

// from 에서 angle 방향으로 max 까지 가는 동안 처음 막히는 곳까지의 거리 (안 막히면 max)
// personRadius: 사람을 얼마나 넓게 볼지 (기본은 카메라가 멈추는 기준 EMOTE_CAMERA.person)
export function freeDistance(from: Point, angle: number, boxes: Box[], people: Point[], max: number, personRadius = EMOTE_CAMERA.person): number {
  const dx = Math.sin(angle)
  const dz = Math.cos(angle)
  let free = max
  for (const b of boxes) {
    const t = rayBox(from, dx, dz, b, EMOTE_CAMERA.margin)
    if (t < free) free = t
  }
  for (const p of people) {
    const t = rayCircle(from, dx, dz, p, personRadius)
    if (t < free) free = t
  }
  return Math.max(0, free)
}

// heading: 내가 보는 방향. 돌려주는 angle 은 카메라가 나에게서 빠지는 방향(절대 각도), distance 는 그 방향으로 갈 수 있는 거리
// 먼저 사람을 넓게 보고(personView) 고릅니다: 카메라 선 가까이에 선 사람은 선을 막지 않아도 화면에서 내 몸과 겹칩니다
// (앞 1m 에 사람이 있을 때 대각선에서 비추면 그 사람 머리가 내 든 팔을 가림). 그렇게는 갈 곳이 없을 만큼 붐비면 좁게 보고 다시 고릅니다.
export function pickEmoteView(from: Point, heading: number, boxes: Box[], people: Point[]): { angle: number; distance: number } | null {
  return pickWith(from, heading, boxes, people, EMOTE_CAMERA.personView) ?? pickWith(from, heading, boxes, people, EMOTE_CAMERA.person)
}

function pickWith(from: Point, heading: number, boxes: Box[], people: Point[], personRadius: number): { angle: number; distance: number } | null {
  let best: { angle: number; distance: number } | null = null
  for (const off of OFFSETS) {
    const angle = heading + off
    const distance = freeDistance(from, angle, boxes, people, EMOTE_CAMERA.distance, personRadius)
    if (distance >= EMOTE_CAMERA.prefer) return { angle, distance } // 순서가 앞선 방향 중 충분히 트인 첫 방향
    if (!best || distance > best.distance) best = { angle, distance }
  }
  return best && best.distance >= EMOTE_CAMERA.min ? best : null
}

// 두 각도의 차이를 -π 이상 π 미만으로 (카메라가 가까운 쪽으로 돌게). 정확히 반 바퀴면 -π
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2)
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI
}

// 선이 상자(여유만큼 키운)에 처음 닿는 거리. 안 닿으면 Infinity
function rayBox(o: Point, dx: number, dz: number, b: Box, margin: number): number {
  const hw = b.w / 2 + margin
  const hd = b.d / 2 + margin
  let near = -Infinity
  let far = Infinity
  // x 방향·z 방향 각각 상자 두 면 사이를 지나는 구간을 구해 겹치는 구간을 찾음
  for (const [pos, dir, center, half] of [[o.x, dx, b.x, hw], [o.z, dz, b.z, hd]] as const) {
    if (Math.abs(dir) < 1e-9) {
      if (pos < center - half || pos > center + half) return Infinity // 나란히 가는데 상자 폭 밖
      continue
    }
    const t1 = (center - half - pos) / dir
    const t2 = (center + half - pos) / dir
    near = Math.max(near, Math.min(t1, t2))
    far = Math.min(far, Math.max(t1, t2))
  }
  if (far < Math.max(near, 0)) return Infinity
  return Math.max(near, 0) // 이미 상자 안이면 0
}

// 선이 사람(원)에 처음 닿는 거리. 안 닿으면 Infinity
function rayCircle(o: Point, dx: number, dz: number, c: Point, r: number): number {
  const mx = c.x - o.x
  const mz = c.z - o.z
  const dist2 = mx * mx + mz * mz
  if (dist2 < EMOTE_CAMERA.overlap * EMOTE_CAMERA.overlap) return Infinity // 나와 겹쳐 선 사람
  const along = mx * dx + mz * dz // 그 사람이 이 방향으로 얼마나 앞에 있는지
  if (along <= 0) return Infinity // 뒤쪽
  const disc = along * along - (dist2 - r * r)
  if (disc < 0) return Infinity // 옆으로 비켜 있음
  return Math.max(0, along - Math.sqrt(disc))
}
