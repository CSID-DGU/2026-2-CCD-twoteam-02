// 좌석에 앉아 있는 다른 참여자의 캐릭터
import { useEffect, useMemo, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import type { Spot } from './layout'

const SCALE = 0.6 // Player와 같은 크기

export function SeatedCharacter({ spot, model }: { spot: Spot; model: string }) {
  const ref = useRef<Group>(null!)
  const { scene, animations } = useGLTF(`/models/character-${model}.glb`)
  // 같은 모델을 여러 자리에 둘 수 있도록 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions.sit?.play()
  }, [actions])

  return (
    <group ref={ref} position={[spot.x, 0, spot.z]} rotation={[0, spot.rot, 0]}>
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}
