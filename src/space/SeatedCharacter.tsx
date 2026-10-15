// 좌석에 앉아 있는 다른 참여자의 캐릭터
//
// 그 사람이 보내 온 고개 각도와 눈 감김을 반영합니다. (#129)
// 값은 0.25초마다 띄엄띄엄 오므로 머리는 목표 각도로 부드럽게 따라가게 합니다.
// 고개를 안 보내 왔으면(얼굴을 못 찾음, 예전 버전) 정면으로 천천히 돌아옵니다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { MathUtils } from 'three'
import type { Group } from 'three'
import { showEyes, useEyeSkin } from '../tracking/useEyeSkin'
import type { Spot } from './layout'

const SCALE = 0.6 // Player와 같은 크기
const HEAD_NODE = 'head'
const HEAD_FOLLOW = 8 // 머리가 받은 각도를 따라가는 빠르기 (값이 띄엄띄엄 와서 내 모습 화면보다 조금 느리게)

type Props = {
  spot: Spot
  model: string
  head?: [number, number, number] // 고개 각도 [좌우, 위아래, 갸웃] (캐릭터 기준 라디안)
  eyes?: boolean // 눈을 감고 있는지
}

export function SeatedCharacter({ spot, model, head, eyes = false }: Props) {
  const ref = useRef<Group>(null!)
  const { scene, animations } = useGLTF(`/models/character-${model}.glb`)
  // 같은 모델을 여러 자리에 둘 수 있도록 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)
  // 이 캐릭터만 쓰는 재질. 눈을 감아도 같은 모델의 다른 캐릭터는 그대로입니다. (#113)
  const skin = useEyeSkin(copy, model)

  useEffect(() => {
    actions.sit?.play()
  }, [actions])

  // 앉기 동작(sit)은 머리를 움직이지 않으므로 머리 회전을 직접 정해도 겹치지 않습니다.
  useFrame((_, delta) => {
    showEyes(skin.current, eyes)
    const node = copy.getObjectByName(HEAD_NODE)
    if (!node) return
    const follow = 1 - Math.exp(-HEAD_FOLLOW * delta)
    node.rotation.order = 'YXZ'
    node.rotation.y = MathUtils.lerp(node.rotation.y, head?.[0] ?? 0, follow)
    node.rotation.x = MathUtils.lerp(node.rotation.x, head?.[1] ?? 0, follow)
    node.rotation.z = MathUtils.lerp(node.rotation.z, head?.[2] ?? 0, follow)
  })

  return (
    <group ref={ref} position={[spot.x, 0, spot.z]} rotation={[0, spot.rot, 0]}>
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}
