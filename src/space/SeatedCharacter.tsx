// 좌석에 앉아 있는 다른 참여자의 캐릭터
//
// 그 사람이 보내 온 고개 각도와 눈 감김, 팔 방향, (회의실이면) 입 벌림을 반영합니다. (#129, #61)
// 값은 0.25초마다 띄엄띄엄 오므로 머리는 목표 각도로 부드럽게 따라가게 합니다.
// 고개를 안 보내 왔으면(얼굴을 못 찾음, 예전 버전) 정면으로 천천히 돌아옵니다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { MathUtils } from 'three'
import type { Group } from 'three'
import { showEyes, useEyeSkin } from '../tracking/useEyeSkin'
import { applyArms } from '../tracking/armPose'
import { updateMouth, useMouth } from '../tracking/useMouth'
import { BASE_MODEL_URL } from '../profile/characters'
import type { ArmVector } from '../realtime/participants'
import type { Spot } from './layout'

const SCALE = 0.6 // Player와 같은 크기
const HEAD_NODE = 'head'
const HEAD_FOLLOW = 8 // 머리가 받은 각도를 따라가는 빠르기 (값이 띄엄띄엄 와서 내 모습 화면보다 조금 느리게)
const ARM_FOLLOW = 8 // 팔이 받은 방향을 따라가는 빠르기 (내 모습 화면과 같은 값)

const toDir = (v: ArmVector | null | undefined) => (v ? { x: v[0], y: v[1], z: v[2] } : null)

type Props = {
  spot: Spot
  model: string
  head?: [number, number, number] // 고개 각도 [좌우, 위아래, 갸웃] (캐릭터 기준 라디안)
  eyes?: boolean // 눈을 감고 있는지
  arms?: [ArmVector | null, ArmVector | null] // 팔 방향 [캐릭터 왼팔, 오른팔]. 없으면 팔을 내립니다.
  mouth?: number // 입 벌린 정도(0~1). 회의실에서만 옵니다. 없으면 다문 입 (#61)
}

export function SeatedCharacter({ spot, model, head, eyes = false, arms, mouth = 0 }: Props) {
  const ref = useRef<Group>(null!)
  // 동작의 뿌리: 모델(캐릭터)이 바뀌면 key 로 이 묶음도 새로 만듭니다. drei useAnimations 는 모델이 바뀔 때 예전 관절 연결을
  // 지우지 못해서, 같은 뿌리를 쓰면 새 동작이 화면에서 빠진 옛 모델을 움직이고 새 모델은 가만히 있었습니다. (#259)
  const animRoot = useRef<Group>(null!)
  const { scene, animations } = useGLTF(BASE_MODEL_URL) // 모든 캐릭터가 같은 모델, 스킨만 다름 (#56)
  // 같은 모델을 여러 자리에 둘 수 있도록 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, animRoot)
  // 이 캐릭터만 쓰는 재질. 눈을 감아도 같은 모델의 다른 캐릭터는 그대로입니다. (#113)
  const skin = useEyeSkin(copy, model)
  const mouthMesh = useMouth(copy)

  useEffect(() => {
    actions.sit?.play()
  }, [actions])

  // 앉기 동작(sit)은 머리·팔을 움직이지 않으므로 직접 돌려도 겹치지 않습니다.
  useFrame((_, delta) => {
    showEyes(skin.current, eyes)
    updateMouth(mouthMesh, mouth, delta)
    applyArms(copy, { armLeft: toDir(arms?.[0]), armRight: toDir(arms?.[1]) }, 1 - Math.exp(-ARM_FOLLOW * delta))
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
      <group ref={animRoot} key={model}>
        <primitive object={copy} scale={SCALE} />
      </group>
    </group>
  )
}
