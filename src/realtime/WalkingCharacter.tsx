// 지점을 돌아다니는 다른 참여자의 캐릭터. (앉아 있는 사람은 SeatedCharacter 를 씁니다)
//
// 위치는 0.25초에 한 번씩 오는데 화면은 1초에 60번 그리므로, 받은 값으로 바로 옮기면
// 뚝뚝 끊겨 보입니다. 그래서 받은 위치를 목표로 두고 매 프레임 조금씩 다가가게 합니다.
//
// 그래서 "늦게 보인다" 는 두 가지가 겹친 결과입니다.
//   ① 위치 메시지가 늦게 도착한다        → useParticipants 가 다룬다
//   ② 도착한 뒤에도 FOLLOW 속도로 다가간다 → 여기가 다룬다 (0.3초쯤 걸린다)
// 아래 FOLLOW 를 키우면 ②가 빨라지지만, 대신 뚝뚝 끊겨 보입니다.
//
// 목표 위치(x, z prop)와 실제로 그리는 위치(group.position)는 따로 둡니다.
// position 을 prop 으로 묶으면 메시지가 올 때마다 R3F 가 목표 좌표로 바로 덮어써서
// 보간·걷기 동작·방향 돌리기가 모두 안 되고 순간이동만 합니다. (#130)
// 걷기 판단과 몸 방향은 walkLogic.ts 참고. (#122)
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { TELEPORT_GAP, angleDiff, facingGoal, gaitOf } from './walkLogic'
import type { Gait } from './walkLogic'

const SCALE = 0.6 // Player와 같은 크기
const FOLLOW = 10 // 목표 위치로 다가가는 빠르기
const TURN = 12 // 방향 전환 빠르기 (Player와 같은 값)
const FADE = 0.15 // 동작 전환 시간(초)

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
  const placed = useRef(false) // 처음 한 번은 목표 위치에 바로 놓습니다.
  const { scene, animations } = useGLTF(`/models/character-${model}.glb`)
  // 같은 모델을 여러 사람이 쓸 수 있으므로 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions.idle?.play()
  }, [actions])

  useFrame((_, delta) => {
    const g = ref.current
    const b = body.current
    if (!g || !b) return
    const p = g.position

    // 처음 나타날 때나 멀리 떨어져 있으면(자리에서 일어남 등) 걸어가지 않고 바로 옮깁니다.
    if (!placed.current || Math.hypot(x - p.x, z - p.z) > TELEPORT_GAP) {
      p.set(x, 0, z)
      if (h !== undefined) b.rotation.y = h
      placed.current = true
    }

    // 목표까지 남은 거리로 걷는지 정하고, 그다음 조금 다가갑니다.
    const gapX = x - p.x
    const gapZ = z - p.z
    const goal = facingGoal(gapX, gapZ, h, gait.current !== 'idle')
    if (goal !== null) b.rotation.y += angleDiff(goal, b.rotation.y) * (1 - Math.exp(-TURN * delta))
    const next = gaitOf(gapX, gapZ, b.rotation.y, gait.current !== 'idle')

    // 프레임 수와 무관하게 같은 속도가 되도록 지수로 계산합니다.
    const k = 1 - Math.exp(-FOLLOW * delta)
    p.x += gapX * k
    p.z += gapZ * k

    if (gait.current !== next) {
      const from = gait.current === 'idle' ? 'idle' : 'walk'
      const to = next === 'idle' ? 'idle' : 'walk'
      if (from !== to) {
        actions[from]?.fadeOut(FADE)
        actions[to]?.reset().fadeIn(FADE).play()
      }
      // 뒷걸음은 걷기 동작을 거꾸로 재생합니다. (재생 속도 -1)
      actions.walk?.setEffectiveTimeScale(next === 'backward' ? -1 : 1)
      gait.current = next
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
