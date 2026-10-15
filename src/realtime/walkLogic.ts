// 다른 참여자 캐릭터의 걷기 판단 (화면·React와 무관한 순수 로직)
//
// 위치는 0.25초마다 띄엄띄엄 오므로, 받은 위치를 "목표"로 두고 그리는 위치가 매 프레임 따라갑니다.
// 그래서 걷는지는 "목표까지 얼마나 남았나(gap)"로 판단합니다. 한 프레임에 움직인 거리로 판단하면
// 목표에 거의 닿는 순간마다 멈춘 것으로 보여 걷기·서기가 깜빡입니다. (#130)
//
// 몸 방향은 그 사람이 보낸 방향(h)을 따릅니다. 1인칭에서 옆걸음·뒷걸음을 하면
// 보는 방향과 가는 방향이 다르기 때문입니다. (#122)
//   앞·옆으로 갈 때: 걷기 동작
//   뒤로 갈 때   : 걷기 동작을 거꾸로 재생 (뒷걸음)
// 예전 버전처럼 방향을 안 보내 온 경우에는 가는 방향을 바라보게 합니다.

export const WALK_START_GAP = 0.05 // 목표까지 이보다 멀어지면 걷기 시작 (m)
export const WALK_STOP_GAP = 0.02 // 이보다 가까워져야 멈춤. 두 값을 달리 둬서 경계에서 깜빡이지 않게 합니다.
export const TELEPORT_GAP = 3 // 이보다 멀면 걸어가지 않고 바로 옮깁니다. (처음 나타날 때, 자리에서 일어날 때 등)
export const BACKWARD_DOT = -0.3 // 가는 방향과 보는 방향의 cos 값이 이보다 작으면 뒷걸음 (약 107도 이상 뒤쪽)

export type Gait = 'idle' | 'forward' | 'backward'

// 각도 차이를 -π ~ π 로 맞춥니다. (가까운 쪽으로 돌기 위해)
export function angleDiff(target: number, current: number): number {
  const d = target - current
  return Math.atan2(Math.sin(d), Math.cos(d))
}

// 몸이 향할 방향. h 가 있으면 그것, 없으면 가는 방향, 둘 다 없으면 null(그대로 둠)
export function facingGoal(gapX: number, gapZ: number, h: number | undefined, walking: boolean): number | null {
  if (h !== undefined) return h
  if (walking) return Math.atan2(gapX, gapZ) // 모델 정면은 +Z
  return null
}

// 걷는 중인지, 앞으로인지 뒤로인지. wasWalking 은 직전 판단입니다.
export function gaitOf(gapX: number, gapZ: number, facing: number, wasWalking: boolean): Gait {
  const gap = Math.hypot(gapX, gapZ)
  const walking = gap > (wasWalking ? WALK_STOP_GAP : WALK_START_GAP)
  if (!walking) return 'idle'
  // 정면 방향 (sin, cos) 과 가는 방향의 내적 = 두 방향 사이 각도의 cos
  const dot = (gapX * Math.sin(facing) + gapZ * Math.cos(facing)) / gap
  return dot < BACKWARD_DOT ? 'backward' : 'forward'
}
