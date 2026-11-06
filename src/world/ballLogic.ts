// 캠퍼스 축구공. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   stepBall   한 프레임 굴리기: 마찰로 느려지고, 울타리·건물·골대 등 상자에 튕기고, 골라인을 넘으면 골
//   kickBall   내 캐릭터가 공 쪽으로 걸어가 닿으면 찬 방향·세기 (뛰면 더 세게)
//   nudgeBall  서 있는 캐릭터에 닿아 있으면 겹치지 않게 살짝 밀어냄
//   outOfPitch 축구장 밖으로 나갔는지 (골망 안은 골이라 밖 아님) → Ball.tsx 가 잠시 뒤 가운데로 돌려놓음
//   needReplyDelay  새로 온 사람의 "공 어디 있어요?"(need)에 답하기까지 기다릴 시간 (#473)
// 공은 땅 위를 구르기만 합니다(높이 없음). 여러 사람이 같이 보는 것은 Ball.tsx 가 실시간으로 맞춥니다.

// r: 반지름(m), friction: 1초에 속도가 줄어드는 정도(지수), stop: 이보다 느리면 멈춤, bounce: 튕길 때 남는 속도 비율,
// touch: 캐릭터 가운데에서 공 가운데까지 닿는 거리, kickMin·kickMul: 찰 때 최소 세기와 걷는 속도에 곱하는 값, maxSpeed: 최고 속도,
// netDepth: 골망 깊이(골라인 뒤), cooldown: 한 번 찬 뒤 다시 찰 수 있기까지(초),
// outMargin: 라인에서 이만큼(m) 넘게 나가면 축구장 밖, outReturnMs: 밖에 이만큼 있으면 가운데 점으로 돌아옴
export const BALL = { r: 0.22, friction: 0.9, stop: 0.08, bounce: 0.6, touch: 0.55, kickMin: 4, kickMul: 1.7, maxSpeed: 13, netDepth: 1.2, cooldown: 0.25, outMargin: 1, outReturnMs: 2000 }

export type BallState = { x: number; z: number; vx: number; vz: number }

// 입장 응답 (#473): 예전에는 공 상태를 아는 사람이 모두 바로 답해 입장 1번에 N명 응답 × N명 수신이 나갔습니다.
// 공 주인(마지막에 찬 사람)은 바로 답하고, 나머지는 minMs~minMs+rangeMs 사이 제각각 기다렸다가
// 그사이 누가 먼저 답하면(공 상태를 받으면) 취소합니다. 주인이 있으면 응답은 1번입니다. 주인이 떠났으면 먼저 답한 사람이
// 주인이 되어(가끔 둘셋이 겹침) 다음 입장부터 다시 1번이 됩니다.
// minMs 는 주인의 답이 다른 사람에게 닿을 만큼(실측 지연 약 0.1~0.2초) 넉넉히 둡니다.
export const NEED_REPLY = { minMs: 400, rangeMs: 800 }
export const needReplyDelay = (isOwner: boolean, rand: number) => (isOwner ? 0 : NEED_REPLY.minMs + rand * NEED_REPLY.rangeMs)
// goal: 골대 폭. w 는 골대 쪽 짧은 변, d 는 골대 사이 긴 변. across 면 긴 변이 동서(골대가 왼쪽·오른쪽 끝, 'north'=왼쪽 'south'=오른쪽)
export type Pitch = { x: number; z: number; w: number; d: number; goal: number; across?: boolean }
export type BallWorld = { half: { w: number; d: number }; boxes: { x: number; z: number; w: number; d: number }[]; pitch?: Pitch }
export type Goal = 'north' | 'south'
type P = { x: number; z: number }

// 골망(골라인 뒤 상자 셋: 뒤·양옆)과 골대 기둥. 공만 부딪힘 (기둥은 캐릭터도 부딪힘 → worldLogic)
export function goalBoxes(p: Pitch) {
  const t = 0.12
  const boxes = []
  for (const side of [-1, 1]) {
    const line = (side * p.d) / 2
    const back = line + side * BALL.netDepth
    boxes.push(pitchBox(p, { x: 0, z: back + (side * t) / 2, w: p.goal + 2 * t, d: t })) // 뒤
    for (const sx of [-1, 1]) boxes.push(pitchBox(p, { x: sx * (p.goal / 2 + t / 2), z: (line + back) / 2, w: t, d: BALL.netDepth })) // 옆
  }
  return boxes
}

// 축구장 가운데 기준 상자(z 가 긴 변)를 세상 좌표로. across 면 x·z 를 바꿈
export function pitchBox(p: Pitch, b: { x: number; z: number; w: number; d: number }) {
  return p.across ? { x: p.x + b.z, z: p.z + b.x, w: b.d, d: b.w } : { x: p.x + b.x, z: p.z + b.z, w: b.w, d: b.d }
}

// 원(공)이 상자에 박혔으면 덜 박힌 쪽으로 빼고 그 방향 속도를 뒤집음
function bounceBox(s: BallState, b: { x: number; z: number; w: number; d: number }): BallState {
  const dx = s.x - b.x
  const dz = s.z - b.z
  const ox = b.w / 2 + BALL.r - Math.abs(dx)
  const oz = b.d / 2 + BALL.r - Math.abs(dz)
  if (ox <= 0 || oz <= 0) return s
  if (ox < oz) {
    const sx = dx >= 0 ? 1 : -1
    return { ...s, x: b.x + sx * (b.w / 2 + BALL.r), vx: sx * Math.abs(s.vx) * BALL.bounce }
  }
  const sz = dz >= 0 ? 1 : -1
  return { ...s, z: b.z + sz * (b.d / 2 + BALL.r), vz: sz * Math.abs(s.vz) * BALL.bounce }
}

export function stepBall(ball: BallState, dt: number, world: BallWorld): { ball: BallState; goal: Goal | null } {
  if (ball.vx === 0 && ball.vz === 0) return { ball, goal: null }
  const k = Math.exp(-BALL.friction * dt)
  let s: BallState = { x: ball.x + ball.vx * dt, z: ball.z + ball.vz * dt, vx: ball.vx * k, vz: ball.vz * k }
  // 골: 골대 사이로 골라인을 넘음
  let goal: Goal | null = null
  const p = world.pitch
  if (p) {
    for (const side of [-1, 1] as const) {
      const line = (side * p.d) / 2
      // 긴 축 위치 (앞뒤), 짧은 축 위치 (골대 사이인지)
      const long = (q: P) => (p.across ? q.x - p.x : q.z - p.z)
      const short = (q: P) => (p.across ? q.z - p.z : q.x - p.x)
      const before = (long(ball) - line) * side
      const after = (long(s) - line) * side
      if (before < 0 && after >= 0 && Math.abs(short(s)) < p.goal / 2) goal = side < 0 ? 'north' : 'south'
    }
    for (const b of goalBoxes(p)) s = bounceBox(s, b)
  }
  for (const b of world.boxes) s = bounceBox(s, b)
  // 울타리
  const mx = world.half.w - BALL.r
  const mz = world.half.d - BALL.r
  if (Math.abs(s.x) > mx) s = { ...s, x: Math.sign(s.x) * mx, vx: -s.vx * BALL.bounce }
  if (Math.abs(s.z) > mz) s = { ...s, z: Math.sign(s.z) * mz, vz: -s.vz * BALL.bounce }
  if (Math.hypot(s.vx, s.vz) < BALL.stop) s = { ...s, vx: 0, vz: 0 }
  return { ball: s, goal }
}

// me: 지금 내 자리, vel: 내 걷는 속도(m/s). 닿아 있고 공 쪽으로 움직이면 새 공 상태, 아니면 null
export function kickBall(ball: BallState, me: P, vel: P): BallState | null {
  const dx = ball.x - me.x
  const dz = ball.z - me.z
  const dist = Math.hypot(dx, dz)
  const speed = Math.hypot(vel.x, vel.z)
  if (dist > BALL.touch || dist < 1e-6 || speed < 0.5) return null
  const toBall = { x: dx / dist, z: dz / dist }
  const facing = { x: vel.x / speed, z: vel.z / speed }
  if (toBall.x * facing.x + toBall.z * facing.z <= 0.2) return null // 공을 향해 가는 중이 아님
  // 찬 방향: 공 쪽과 걷는 쪽을 섞음 (걷는 방향으로 차는 느낌)
  const mx = toBall.x * 0.5 + facing.x * 0.5
  const mz = toBall.z * 0.5 + facing.z * 0.5
  const m = Math.hypot(mx, mz)
  const power = Math.min(BALL.maxSpeed, Math.max(BALL.kickMin, speed * BALL.kickMul))
  return { x: me.x + toBall.x * BALL.touch, z: me.z + toBall.z * BALL.touch, vx: (mx / m) * power, vz: (mz / m) * power }
}

export function nudgeBall(ball: BallState, me: P): BallState {
  const dx = ball.x - me.x
  const dz = ball.z - me.z
  const dist = Math.hypot(dx, dz)
  if (dist >= BALL.touch) return ball
  const ux = dist < 1e-6 ? 0 : dx / dist
  const uz = dist < 1e-6 ? -1 : dz / dist
  return { ...ball, x: me.x + ux * BALL.touch, z: me.z + uz * BALL.touch }
}

export function outOfPitch(ball: { x: number; z: number }, p: Pitch): boolean {
  const dx = Math.abs(p.across ? ball.z - p.z : ball.x - p.x) // 짧은 축
  const dz = Math.abs(p.across ? ball.x - p.x : ball.z - p.z) // 긴 축
  const inNet = dx < p.goal / 2 + 0.2 && dz <= p.d / 2 + BALL.netDepth + 0.2
  if (inNet) return false
  return dx > p.w / 2 + BALL.outMargin || dz > p.d / 2 + BALL.outMargin
}
