// 카페에서 받은 음료 컵 (내 화면에만). 손에 든 컵은 Player 가 오른팔에 붙이고, 여기서는 그 밖의 두 경우를 그립니다.
//   DrinkInView  1인칭으로 걸을 때: 내 캐릭터가 숨겨져 손의 컵도 안 보이므로, 화면 오른쪽 아래에 컵을 띄웁니다.
//   DeskDrink    자리에 앉았을 때: 앉은 자리 책상 위(내 쪽 오른편)에 컵을 내려놓습니다. 일어나면 다시 손에 듭니다.
// 책상 높이는 지점·테마마다 달라서, 위에서 아래로 광선을 쏴 처음 닿는 면을 상판으로 씁니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { EmoteState } from './emotes'
import { CUP_WORLD_SCALE, makeHeld } from './drinkCup'
import type { MenuItem } from './baristaLogic'

const VIEW_OFFSET = new THREE.Vector3(0.24, -0.26, -0.55) // 카메라 기준 오른쪽 아래 앞
const DESK_SIDE = { right: 0.35, toward: 0.12 } // 책상 가운데에서 오른쪽·내 쪽으로 (m)
const RAY_FROM = 1.6 // 광선 시작 높이 (높은 책상 1.05 보다 위, 매단 조명보다 아래)

const offset = new THREE.Vector3()

export function DrinkInView({ item, emoteRef }: { item: MenuItem; emoteRef?: RefObject<EmoteState> }) {
  const cup = useMemo(() => makeHeld(item), [item])
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g) return
    g.visible = !emoteRef?.current.playing // 감정표현 중엔 카메라가 빠져 손의 컵이 보임
    offset.copy(VIEW_OFFSET).applyQuaternion(camera.quaternion)
    g.position.copy(camera.position).add(offset)
  })
  return (
    <group ref={ref} scale={CUP_WORLD_SCALE}>
      <primitive object={cup} position-y={-0.12} />
    </group>
  )
}

// desk: 앉은 자리의 책상 가운데, rot: 앉아서 보는 방향 (layout.spotsOf 와 같은 뜻)
export function DeskDrink({ item, desk, rot }: { item: MenuItem; desk: { x: number; z: number }; rot: number }) {
  const cup = useMemo(() => makeHeld(item), [item])
  const scene = useThree((s) => s.scene)
  const ref = useRef<THREE.Group>(null)
  const [top, setTop] = useState<number | null>(null)
  // 오른쪽 = (-cos h, sin h), 내 쪽 = -(sin h, cos h)
  const x = desk.x - Math.cos(rot) * DESK_SIDE.right - Math.sin(rot) * DESK_SIDE.toward
  const z = desk.z + Math.sin(rot) * DESK_SIDE.right - Math.cos(rot) * DESK_SIDE.toward
  useEffect(() => {
    // 실내가 다 그려진 다음 프레임에 잼
    const id = requestAnimationFrame(() => setTop(deskTopAt(scene, x, z, ref.current)))
    return () => cancelAnimationFrame(id)
  }, [scene, x, z])
  return (
    <group ref={ref} position={[x, top ?? 0, z]} visible={top !== null} scale={CUP_WORLD_SCALE}>
      <primitive object={cup} />
    </group>
  )
}

// (x, z) 바로 위에서 아래로 쏴 처음 닿는 면의 높이. 아무것도 없으면 바닥(0)
function deskTopAt(scene: THREE.Object3D, x: number, z: number, skip: THREE.Object3D | null) {
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(x, RAY_FROM, z), new THREE.Vector3(0, -1, 0), 0, RAY_FROM + 0.1)
  const hit = ray.intersectObject(scene, true).find((h) => h.object.visible && (h.object as THREE.Mesh).isMesh && !isInside(h.object, skip))
  return hit ? hit.point.y : 0
}

function isInside(o: THREE.Object3D, root: THREE.Object3D | null) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true
  return false
}
