// 1인칭 걸어 다니기 카메라: 서 있는 눈높이에서 내 캐릭터 위치를 따라갑니다.
// 화면을 끌면 좌우로 돌고(360도), 위아래로는 보지 않습니다.
// 바라보는 방향(headingRef)은 Player 와 같이 써서, W 를 누르면 보는 쪽으로 걷습니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three'

const EYE_HEIGHT = 1.45 // 서 있을 때 눈높이 (캐릭터 키 약 1.6)
const WALK_FOV = 70 // 걸을 때는 앉았을 때보다 조금 넓게 봅니다.
const LOOK_SPEED = 0.005 // 마우스를 1픽셀 끌 때 도는 각도(라디안). 앉았을 때와 같은 값

type Props = {
  posRef: RefObject<{ x: number; z: number }> // 내 캐릭터 위치
  headingRef: RefObject<number> // 바라보는 방향(라디안). 0이면 +Z 쪽
}

export function WalkCamera({ posRef, headingRef }: Props) {
  const cam = useRef<PerspectiveCameraImpl>(null!)
  const canvas = useThree((s) => s.gl.domElement)

  // 화면을 끌면 끄는 쪽으로 장면이 따라오도록 돕니다. (앉았을 때 둘러보기와 같은 느낌)
  useEffect(() => {
    let dragging = false
    const down = (e: PointerEvent) => {
      dragging = true
      canvas.setPointerCapture(e.pointerId) // 화면 밖으로 나가도 끌기가 이어지게
      canvas.style.setProperty('cursor', 'grabbing')
    }
    const move = (e: PointerEvent) => {
      if (dragging) headingRef.current += e.movementX * LOOK_SPEED
    }
    const up = () => {
      dragging = false
      canvas.style.setProperty('cursor', 'grab')
    }
    canvas.style.setProperty('cursor', 'grab')
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.style.setProperty('cursor', '')
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [canvas, headingRef])

  useFrame(() => {
    const { x, z } = posRef.current
    cam.current.position.set(x, EYE_HEIGHT, z)
    // 카메라는 기본으로 -Z 를 보므로 반 바퀴 돌려 캐릭터 정면(+Z 기준)에 맞춥니다.
    cam.current.rotation.set(0, headingRef.current + Math.PI, 0)
  })

  return <PerspectiveCamera ref={cam} makeDefault fov={WALK_FOV} near={0.05} />
}
