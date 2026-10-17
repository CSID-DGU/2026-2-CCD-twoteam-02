// 지점을 돌아다니는 다른 참여자의 캐릭터. (앉아 있는 사람은 SeatedCharacter 를 씁니다)
//
// 위치는 0.25초에 한 번씩 오는데 화면은 1초에 60번 그리므로 사이를 메워야 합니다.
//
// 전에는 받은 위치를 "목표"로 두고 매 프레임 그쪽으로 다가가게 했는데(지수 보간),
// 목표가 0.25초마다 껑충 뛰므로 캐릭터가 확 가속했다 감속하기를 1초에 네 번 반복했습니다.
// 달릴 때는 한 번에 1.6m 씩 뛰어 더 두드러졌습니다.
//
// 지금은 받은 위치를 쌓아 두고 INTERP_DELAY_MS 만큼 과거를 재생합니다. 두 표본 사이를
// 일정한 속도로 이으므로 보낸 사람의 움직임이 그대로 나옵니다. 메시지는 더 쓰지 않고,
// 대신 화면이 그만큼 늦습니다. 계산은 walkLogic.ts 의 sampleAt 참고.
//
// 목표 위치(x, z prop)와 실제로 그리는 위치(group.position)는 따로 둡니다.
// position 을 prop 으로 묶으면 메시지가 올 때마다 R3F 가 좌표로 바로 덮어써서
// 보간·걷기 동작·방향 돌리기가 모두 안 되고 순간이동만 합니다. (#130)
// 걷기 판단과 몸 방향은 walkLogic.ts 참고. (#122)
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { INTERP_DELAY_MS, SAMPLE_MAX, TELEPORT_GAP, angleDiff, facingGoal, gaitOf, sampleAt } from './walkLogic'
import { WALK_SPEED } from '../space/moveSpeed'
import type { Gait, Sample } from './walkLogic'

const SCALE = 0.6 // Player와 같은 크기
const TURN = 12 // 방향 전환 빠르기 (Player와 같은 값)
const FADE = 0.15 // 동작 전환 시간(초)
const PACE_MIN = 0.7 // 걷기 동작 재생 빠르기 범위 (걷기 = 1)
const PACE_MAX = 2.2

type Props = {
  x: number
  z: number
  h?: number // 그 사람이 보낸 몸 방향. 없으면 가는 방향을 봅니다.
  model: string
  children?: ReactNode // 캐릭터와 함께 움직일 것 (닉네임·표시등). 몸이 돌아도 따라 돌지 않습니다.
}

export function WalkingCharacter({ x, z, h, model, children }: Props) {
  const ref = useRef<Group>(null!) // 위치만 옮기는 묶음
  const body = useRef<Group>(null!) // 몸 방향만 돌리는 묶음
  const gait = useRef<Gait>('idle')
  const buf = useRef<Sample[]>([]) // 받은 위치들. 여기서 과거를 꺼내 재생합니다.
  const placed = useRef(false) // 처음 한 번은 받은 위치에 바로 놓습니다.
  const { scene, animations } = useGLTF(`/models/character-${model}.glb`)
  // 같은 모델을 여러 사람이 쓸 수 있으므로 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions.idle?.play()
  }, [actions])

  // 새 위치가 올 때마다 받은 시각과 함께 쌓아 둡니다.
  // prop 이 바뀔 때만 도므로, 같은 값이 다시 와도 표본이 늘지 않습니다.
  useEffect(() => {
    const b = buf.current
    b.push({ t: performance.now(), x, z, h })
    if (b.length > SAMPLE_MAX) b.shift()
  }, [x, z, h])

  useFrame((_, delta) => {
    const g = ref.current
    const b = body.current
    if (!g || !b) return
    const p = g.position

    // 조금 과거를 재생합니다. 그 시각을 사이에 둔 두 표본을 잇습니다.
    const at = sampleAt(buf.current, performance.now() - INTERP_DELAY_MS)
    if (!at) return

    // 처음 나타날 때나 멀리 떨어져 있으면(자리에서 일어남 등) 걸어가지 않고 바로 옮깁니다.
    if (!placed.current || Math.hypot(at.x - p.x, at.z - p.z) > TELEPORT_GAP) {
      if (at.h !== undefined) b.rotation.y = at.h
      placed.current = true
    }

    // 보간한 위치를 그대로 씁니다. 쫓아가지 않으므로 가속·감속이 생기지 않습니다.
    p.set(at.x, 0, at.z)

    // 걷는지와 몸 방향은 재생 중인 속도로 정합니다.
    const goal = facingGoal(at.vx, at.vz, at.h, gait.current !== 'idle')
    if (goal !== null) b.rotation.y += angleDiff(goal, b.rotation.y) * (1 - Math.exp(-TURN * delta))
    const next = gaitOf(at.vx, at.vz, b.rotation.y, gait.current !== 'idle')

    if (gait.current !== next) {
      const from = gait.current === 'idle' ? 'idle' : 'walk'
      const to = next === 'idle' ? 'idle' : 'walk'
      if (from !== to) {
        actions[from]?.fadeOut(FADE)
        actions[to]?.reset().fadeIn(FADE).play()
      }
      gait.current = next
    }
    // 걷기 동작 빠르기: 실제로 움직이는 빠르기에 맞추고, 뒷걸음은 거꾸로 재생합니다. (재생 속도가 음수)
    // 보간한 속도는 구간 안에서 일정해 출렁이지 않으므로 따로 고르게 할 필요가 없습니다.
    if (next !== 'idle') {
      const speed = Math.hypot(at.vx, at.vz)
      const rate = Math.min(PACE_MAX, Math.max(PACE_MIN, speed / WALK_SPEED))
      actions.walk?.setEffectiveTimeScale(next === 'backward' ? -rate : rate)
    }
  })

  return (
    <group ref={ref}>
      <group ref={body}>
        <primitive object={copy} scale={SCALE} />
      </group>
      {children}
    </group>
  )
}
