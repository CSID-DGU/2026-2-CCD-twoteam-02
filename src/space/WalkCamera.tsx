// 1인칭 걸어 다니기 카메라: 서 있는 눈높이에서 내 캐릭터 위치를 따라갑니다.
//
// 마우스로 바라보기(오버워치 방식, #73): 화면을 클릭하면 마우스가 잠기고(Pointer Lock) 커서가 사라집니다.
// 그 상태에서 마우스를 움직이면 좌우·위아래로 바라봅니다. Esc 를 누르면 브라우저가 잠금을 풀어 커서가 돌아옵니다.
// 바라보는 좌우 방향(headingRef)은 Player 와 같이 써서, W 를 누르면 보는 쪽으로 걷습니다.
// 위아래(pitch)는 카메라만 기울입니다. 걷는 방향에는 영향이 없습니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { MathUtils } from 'three'
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three'

const EYE_HEIGHT = 1.45 // 서 있을 때 눈높이 (캐릭터 키 약 1.6)
const WALK_FOV = 70 // 걸을 때는 앉았을 때보다 조금 넓게 봅니다.
const MOUSE_SPEED = 0.0025 // 마우스를 1픽셀 움직일 때 도는 각도(라디안)
const PITCH_LIMIT = Math.PI / 3 // 위아래 각 60도까지

type Props = {
  posRef: RefObject<{ x: number; z: number }> // 내 캐릭터 위치
  headingRef: RefObject<number> // 바라보는 좌우 방향(라디안). 0이면 +Z 쪽
  paused?: boolean // 키오스크·프로필 창이 떠 있으면 잠금을 풀고 다시 잠그지 않습니다.
  onLockChange?: (locked: boolean) => void // 안내 문구·조준점 표시용
}

export function WalkCamera({ posRef, headingRef, paused = false, onLockChange }: Props) {
  const cam = useRef<PerspectiveCameraImpl>(null!)
  const pitch = useRef(0) // 위(+)·아래(-)로 기울인 각도
  const pausedRef = useRef(paused)
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    pausedRef.current = paused
    if (paused && document.pointerLockElement === canvas) document.exitPointerLock()
  }, [paused, canvas])

  useEffect(() => {
    const isLocked = () => document.pointerLockElement === canvas
    const click = () => {
      if (isLocked() || pausedRef.current) return
      // 브라우저가 잠금을 거절할 수 있습니다(다른 창에 들어간 화면 등). 그때는 방향키 ←→ 로 돕니다.
      const request = canvas.requestPointerLock() as Promise<void> | undefined
      request?.catch(() => {})
    }
    const lockChange = () => {
      // 창이 뜨는 순간과 잠금이 겹치면 바로 다시 풉니다.
      if (isLocked() && pausedRef.current) document.exitPointerLock()
      onLockChange?.(isLocked())
    }
    const move = (e: MouseEvent) => {
      if (!isLocked()) return
      headingRef.current -= e.movementX * MOUSE_SPEED // 마우스를 오른쪽으로 → 오른쪽으로 돌기
      pitch.current = MathUtils.clamp(pitch.current - e.movementY * MOUSE_SPEED, -PITCH_LIMIT, PITCH_LIMIT) // 위로 → 위 보기
    }
    canvas.addEventListener('click', click)
    document.addEventListener('pointerlockchange', lockChange)
    document.addEventListener('mousemove', move)
    return () => {
      canvas.removeEventListener('click', click)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('mousemove', move)
      // 앉거나 위에서 보기로 바꾸면 커서를 돌려줍니다.
      if (isLocked()) document.exitPointerLock()
      onLockChange?.(false)
    }
  }, [canvas, headingRef, onLockChange])

  useFrame(() => {
    const { x, z } = posRef.current
    cam.current.position.set(x, EYE_HEIGHT, z)
    // 좌우를 먼저 돌리고(Y) 그다음 위아래로 기울입니다(X). 카메라는 기본으로 -Z 를 보므로 반 바퀴 더 돕니다.
    cam.current.rotation.set(pitch.current, headingRef.current + Math.PI, 0, 'YXZ')
  })

  return <PerspectiveCamera ref={cam} makeDefault fov={WALK_FOV} near={0.05} />
}
