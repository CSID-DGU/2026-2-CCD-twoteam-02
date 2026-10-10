// 지점을 돌아다니는 다른 참여자의 캐릭터. (앉아 있는 사람은 SeatedCharacter 를 씁니다)
//
// 위치는 0.1초에 한 번씩 오는데 화면은 1초에 60번 그리므로, 받은 값으로 바로 옮기면
// 뚝뚝 끊겨 보입니다. 그래서 받은 위치를 목표로 두고 매 프레임 조금씩 다가가게 합니다.
// 바라보는 방향도 따로 받지 않고, 움직인 방향에서 구해 부드럽게 돌립니다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'

const SCALE = 0.6 // Player와 같은 크기
const FOLLOW = 10 // 목표 위치로 다가가는 빠르기
const TURN = 12 // 방향 전환 빠르기 (Player와 같은 값)
const FADE = 0.15 // 동작 전환 시간(초)
const MOVING = 0.01 // 한 프레임에 이만큼보다 더 움직이면 걷는 것으로 봅니다.

export function WalkingCharacter({ x, z, model }: { x: number; z: number; model: string }) {
  const ref = useRef<Group>(null!)
  const anim = useRef('idle')
  const { scene, animations } = useGLTF(`/models/character-${model}.glb`)
  // 같은 모델을 여러 사람이 쓸 수 있으므로 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions[anim.current]?.play()
  }, [actions])

  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    const p = g.position
    const before = { x: p.x, z: p.z }

    // 목표 위치로 조금씩 다가갑니다. 프레임 수와 무관하게 같은 속도가 되도록 지수로 계산합니다.
    const k = 1 - Math.exp(-FOLLOW * delta)
    p.x += (x - p.x) * k
    p.z += (z - p.z) * k

    const dx = p.x - before.x
    const dz = p.z - before.z
    const moved = Math.hypot(dx, dz)

    const name = moved > MOVING ? 'walk' : 'idle'
    if (anim.current !== name) {
      actions[anim.current]?.fadeOut(FADE)
      actions[name]?.reset().fadeIn(FADE).play()
      anim.current = name
    }

    // 가는 방향을 바라보도록 가까운 쪽으로 돕니다. (모델 정면은 +Z)
    if (moved > MOVING) {
      const diff = Math.atan2(dx, dz) - g.rotation.y
      g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-TURN * delta))
    }
  })

  return (
    <group ref={ref} position={[x, 0, z]}>
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}
