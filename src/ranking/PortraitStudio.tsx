// 순위용 캐릭터 얼굴 사진을 찍는 작은 3D 화면. 광장(WorldScene)에 하나만 둡니다.
//
// portraitStore 의 대기열에서 차림을 하나씩 꺼내, 화면 밖 작은 캔버스에 그 차림의 캐릭터를 세우고
// 스킨·얼굴 판·머리카락이 붙으면 머리 쪽으로 카메라를 맞춰 한 장 찍어 그림(dataURL)으로 저장합니다.
// 사람마다 3D 화면을 만들지 않고 이 화면 하나로 차례대로 찍습니다(브라우저가 여는 3D 화면 수 제한, #137).
// 찍을 것이 없으면 캔버스를 아예 만들지 않습니다.
import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BASE_MODEL_URL } from '../profile/characters'
import { holdStandingPose } from '../space/standStill'
import { useSkin } from '../tracking/useSkin'
import { useFace } from '../tracking/useFace'
import { useHair } from '../tracking/useHair'
import { findPart, parseAvatarKey } from '../avatar/avatarLogic'
import { captureAction, failPortrait, newCaptureStep, nextPortrait, savePortrait, subscribePortraits } from './portraitStore'
import type { CaptureStep } from './portraitStore'

const SIZE = 160 // 찍는 사진 한 변(px)
const FOV = 30
const SCALE = 0.6 // 지점과 같은 캐릭터 크기
const MARGIN = 1.25 // 머리 둘레보다 이만큼 넓게 찍음
const HEAD_NODE = 'head'
const HAIR_NODE = 'hair' // useHair 가 머리에 붙이는 머리카락 이름

export function PortraitStudio() {
  const key = useSyncExternalStore(subscribePortraits, nextPortrait)
  if (!key) return null
  return (
    <div style={{ position: 'fixed', left: -10000, top: 0, width: SIZE, height: SIZE, pointerEvents: 'none' }} aria-hidden>
      <Canvas
        dpr={1}
        gl={{ preserveDrawingBuffer: true, alpha: true }} // 다 그린 화면을 그림으로 읽으려면 필요
        camera={{ fov: FOV, position: [0, 1, 3] }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[2, 4, 4]} intensity={1.2} />
        {/* key: 차림마다 새로 세워 이전 차림의 상태가 남지 않게 */}
        <Suspense fallback={null}>
          <Sitter key={key} model={key} />
        </Suspense>
      </Canvas>
    </div>
  )
}

function Sitter({ model }: { model: string }) {
  const group = useRef<THREE.Group>(null!)
  const { scene, animations } = useGLTF(BASE_MODEL_URL)
  const copy = useMemo(() => scene.clone(true), [scene])
  useSkin(copy, model)
  useHair(copy, model)
  const face = useFace(copy, model)
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    holdStandingPose(actions.idle)
    actions.idle?.play()
  }, [actions])

  const { gl, camera } = useThree()
  const step = useRef<CaptureStep>(newCaptureStep())
  // 머리카락이 있는 차림이면 머리카락까지 붙어야 준비된 것 (안 그러면 대머리로 찍혀 계속 남음)
  const needsHair = useMemo(() => !!findPart('hair', parseAvatarKey(model).hair)?.model, [model])

  useFrame(() => {
    const ready = copy.visible && face.mesh.visible && (!needsHair || !!copy.getObjectByName(HAIR_NODE))
    const action = captureAction(step.current, performance.now(), ready)
    if (action === 'fail') failPortrait(model)
    else if (action === 'aim') aimAtHead(copy, camera as THREE.PerspectiveCamera) // 맞춘 카메라로 한 번 그린 뒤 다음 장면에서 찍음
    else if (action === 'shoot') {
      try {
        savePortrait(model, gl.domElement.toDataURL('image/png'))
      } catch {
        failPortrait(model)
      }
    }
  })

  return (
    <group ref={group}>
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}

// 머리(얼굴 판·머리카락 포함) 둘레 상자를 재서 정면에서 꽉 차게 카메라를 둡니다.
function aimAtHead(root: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  root.updateWorldMatrix(true, true)
  const head = root.getObjectByName(HEAD_NODE) ?? root
  const box = new THREE.Box3().setFromObject(head, true)
  if (box.isEmpty()) box.setFromObject(root, true)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const half = (Math.max(size.x, size.y) / 2) * MARGIN
  const dist = half / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) + size.z / 2
  camera.position.set(center.x, center.y, center.z + dist)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}
