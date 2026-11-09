// 다른 참여자 캐릭터의 위치 보간과 걷기 판단 (화면·React와 무관한 순수 로직)
//
// 위치는 0.25초마다 띄엄띄엄 옵니다. 전에는 받은 위치를 "목표"로 두고 매 프레임 그쪽으로
// 다가가게 했는데(지수 보간), 목표가 0.25초마다 껑충 뛰므로 캐릭터가 확 가속했다가
// 감속하기를 1초에 네 번 반복했습니다. 달리면 한 번에 1.6m 씩 뛰어 더 심했습니다.
//
// 그래서 받은 위치를 버리지 않고 쌓아 두고, 조금 과거 시점을 재생합니다.
// 두 표본 사이를 일정한 속도로 이어 그리므로 보낸 사람의 움직임이 그대로 재생됩니다.
// 메시지는 더 쓰지 않고, 대신 화면이 INTERP_DELAY 만큼 늦습니다.
//
// 몸 방향은 그 사람이 보낸 방향(h)을 따릅니다. 1인칭에서 옆걸음·뒷걸음을 하면
// 보는 방향과 가는 방향이 다르기 때문입니다. (#122)
//   앞·옆으로 갈 때: 걷기 동작
//   뒤로 갈 때   : 걷기 동작을 거꾸로 재생 (뒷걸음)
// 예전 버전처럼 방향을 안 보내 온 경우에는 가는 방향을 바라보게 합니다.

// 얼마나 과거를 재생할지. 메시지 간격(0.25초)보다 넉넉해야 다음 표본이 늘 준비돼 있습니다.
// 재어 보니 도착 지연이 평균 95ms, 95% 155ms 였으므로 흔들림까지 더해 1.3배로 둡니다.
// 줄이면 더 빨리 보이지만 표본이 모자라 끊길 수 있고, 늘리면 매끄럽지만 더 늦게 보입니다.
export const INTERP_DELAY_MS = 325
// 쌓아 둘 표본 수. INTERP_DELAY_MS 를 덮고도 남을 만큼만 있으면 됩니다.
export const SAMPLE_MAX = 8

export const WALK_START_SPEED = 0.2 // 이보다 빠르면 걷기 시작 (m/초)
export const WALK_STOP_SPEED = 0.08 // 이보다 느려져야 멈춤. 경계에서 깜빡이지 않게 두 값을 달리 둡니다.
// 이보다 멀면 걸어가지 않고 바로 옮깁니다. (처음 나타날 때, 자리에서 일어날 때 등)
// 달리면(RUN_SPEED 7.5) 0.25초에 약 1.9m 를 가므로, 메시지 하나가 늦게 와도 걸어가 보이도록 넉넉히 둡니다. (#118)
export const TELEPORT_GAP = 5
export const BACKWARD_DOT = -0.3 // 가는 방향과 보는 방향의 cos 값이 이보다 작으면 뒷걸음 (약 107도 이상 뒤쪽)

export type Gait = 'idle' | 'forward' | 'backward'

// 각도 차이를 -π ~ π 로 맞춥니다. (가까운 쪽으로 돌기 위해)
export function angleDiff(target: number, current: number): number {
  const d = target - current
  return Math.atan2(Math.sin(d), Math.cos(d))
}

// 몸이 향할 방향. h 가 있으면 그것, 없으면 가는 방향, 둘 다 없으면 null(그대로 둠)
export function facingGoal(vx: number, vz: number, h: number | undefined, walking: boolean): number | null {
  if (h !== undefined) return h
  if (walking) return Math.atan2(vx, vz) // 모델 정면은 +Z
  return null
}

// 받은 위치 하나. t 는 받은 시각(performance.now 기준 ms)입니다.
// 중계 서버에서 온 위치는 서버에서 기다린 시간을 빼서, 보낸 간격이 살아 있는 시각을 씁니다 (sampledTime).
export type Sample = { t: number; x: number; z: number; h?: number }

// 중계 서버는 붐비는 방에서 받은 위치를 0.1초(relay/src/relayLogic.ts 의 TICK_MS) 단위로 묶어 내보냅니다.
// 그래서 0.25초마다 보낸 위치가 0.2초·0.3초 간격으로 섞여 도착하고, 받은 시각대로 이으면
// 같은 거리를 0.2초와 0.3초에 번갈아 가서 속도가 0.84배·1.26배로 출렁였습니다(19명 측정, #504).
// 서버가 위치마다 기다린 시간을 알려 주므로, 받은 시각에서 그만큼 빼면 보낸 간격(0.25초)이 돌아옵니다.
//
// 다만 빼기만 하면 표본 시각이 최대 0.1초 앞당겨져 INTERP_DELAY_MS 안에 다음 표본이 못 올 수 있습니다.
// 그래서 묶음 간격의 절반만큼 되돌립니다. 붐비는 방에서는 평균 대기(0.05초)와 같아 지연이 예전과 같고,
// 한가한 방(기다림 0)에서는 0.05초 늦게 보입니다.
export const RELAY_WAIT_MAX_MS = 100 // 서버의 묶음 간격. 이보다 긴 기다림은 잘못 온 값으로 보고 줄입니다
export const RELAY_WAIT_OFFSET_MS = 50

// 표본 시각. receivedAt 은 받은 시각, waitedMs 는 서버가 알려 준 기다린 시간(옛 서버는 없음)
export function sampledTime(receivedAt: number, waitedMs: unknown): number {
  const waited = typeof waitedMs === 'number' && Number.isFinite(waitedMs) ? Math.min(Math.max(waitedMs, 0), RELAY_WAIT_MAX_MS) : 0
  return receivedAt - waited + RELAY_WAIT_OFFSET_MS
}

// 쌓을 표본의 시각. 시각이 앞 표본보다 이르면(통신 흔들림) 앞 표본 바로 뒤로 둡니다. 시각이 거꾸로 가면 보간이 깨집니다.
export function nextSampleTime(t: number, prev: number | undefined): number {
  return prev !== undefined && t <= prev ? prev + 1 : t
}

// 그 시각의 위치와 속도. 두 표본 사이를 일정한 속도로 잇습니다.
export type Placed = { x: number; z: number; h?: number; vx: number; vz: number }

// at 시각에 보여 줄 위치를 구합니다.
//
//   표본이 하나뿐이거나 at 이 표본 범위 밖이면 가장 가까운 표본에 멈춰 있습니다.
//   뒤쪽(미래)으로는 넘겨 짚지 않습니다. 넘겨 짚으면 멈춘 사람이 미끄러져 보입니다.
export function sampleAt(buf: readonly Sample[], at: number): Placed | null {
  if (buf.length === 0) return null
  const first = buf[0]
  const last = buf[buf.length - 1]
  // at 이 첫 표본 시각과 같으면 아래 구간 계산으로 넘깁니다. 같다고 멈춘 것으로 보면
  // 경계에 걸린 프레임에서 한 번 멈춰 보입니다.
  if (buf.length === 1 || at < first.t) return { x: first.x, z: first.z, h: first.h, vx: 0, vz: 0 }
  if (at >= last.t) return { x: last.x, z: last.z, h: last.h, vx: 0, vz: 0 }

  // at 을 사이에 둔 두 표본을 찾습니다.
  let i = buf.length - 1
  while (i > 0 && buf[i - 1].t > at) i--
  const a = buf[i - 1]
  const b = buf[i]
  const span = b.t - a.t
  if (span <= 0) return { x: b.x, z: b.z, h: b.h, vx: 0, vz: 0 }

  const r = (at - a.t) / span
  const dx = b.x - a.x
  const dz = b.z - a.z
  return {
    x: a.x + dx * r,
    z: a.z + dz * r,
    // 방향은 둘 중 뒤쪽 값을 씁니다. 각도는 -π~π 를 넘나들어 그냥 섞으면 한 바퀴 돌 수 있습니다.
    h: b.h ?? a.h,
    // 속도는 m/초. 걷기 판단과 동작 재생 빠르기에 씁니다.
    vx: (dx / span) * 1000,
    vz: (dz / span) * 1000,
  }
}

// 걷는 중인지, 앞으로인지 뒤로인지. wasWalking 은 직전 판단입니다.
// 보간 전에는 "목표까지 남은 거리"로 판단했지만, 이제는 재생 중인 속도로 판단합니다.
// 보간하면 그리는 위치가 늘 표본 위에 있어 남은 거리가 0 이기 때문입니다.
export function gaitOf(vx: number, vz: number, facing: number, wasWalking: boolean): Gait {
  const speed = Math.hypot(vx, vz)
  const walking = speed > (wasWalking ? WALK_STOP_SPEED : WALK_START_SPEED)
  if (!walking) return 'idle'
  // 정면 방향 (sin, cos) 과 가는 방향의 내적 = 두 방향 사이 각도의 cos
  const dot = (vx * Math.sin(facing) + vz * Math.cos(facing)) / speed
  return dot < BACKWARD_DOT ? 'backward' : 'forward'
}
