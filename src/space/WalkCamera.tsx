// 1인칭 걸어 다니기 카메라: 서 있는 눈높이에서 내 캐릭터 위치를 따라갑니다.
//
// 마우스로 바라보기(오버워치 방식, #73): 화면을 클릭하면 마우스가 잠기고(Pointer Lock) 커서가 사라집니다.
// 그 상태에서 마우스를 움직이면 좌우·위아래로 바라봅니다. Esc 를 누르면 브라우저가 잠금을 풀어 커서가 돌아옵니다.
// 잠금이 풀린 뒤에는 클릭하거나 걷기 키(WASD·방향키)를 누르면 다시 잠깁니다(#205). 창을 닫고 걷기 시작하면 바로 둘러볼 수 있게.
// 바라보는 좌우 방향(headingRef)은 Player 와 같이 써서, W 를 누르면 보는 쪽으로 걷습니다.
// 위아래(pitch)는 카메라만 기울입니다. 걷는 방향에는 영향이 없습니다.
//
// 감정표현(#162) 중에는 오버워치처럼 카메라가 앞으로 빠져 돌아서서 내 캐릭터를 비추고, 끝나면 돌아옵니다.
// 감정표현 바퀴를 고르는 동안에는 마우스로 시점이 돌지 않습니다(바퀴 고르기에 마우스를 씀).
// 점프하면 눈높이도 캐릭터와 같은 포물선으로 올라갔다 내려옵니다(jumpLogic.ts).
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { MathUtils } from 'three'
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three'
import type { EmoteState } from './emotes'
import { isShortcut } from '../menu/shortcuts'
import { getMouseSensitivity } from '../menu/lookSettings'
import { jumpHeight } from './jumpLogic'

const EYE_HEIGHT = 1.45 // 서 있을 때 눈높이 (캐릭터 키 약 1.6)
const WALK_FOV = 70 // 걸을 때는 앉았을 때보다 조금 넓게 봅니다.
const MOUSE_SPEED = 0.0025 // 마우스를 1픽셀 움직일 때 도는 각도(라디안). 설정 창의 마우스 감도(배율)를 곱합니다(#222).
const PITCH_LIMIT = Math.PI / 3 // 위아래 각 60도까지
const EMOTE_DISTANCE = 2.6 // 감정표현 때 카메라가 내 캐릭터 앞으로 빠지는 거리
const EMOTE_LIFT = 0.15 // 그때 눈높이에서 조금 올림
const EMOTE_PITCH = -0.18 // 그때 살짝 내려다봄
const EMOTE_SWING = 5 // 빠지고 돌아오는 빠르기
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) // 누르면 다시 잠그는 키

type Props = {
  posRef: RefObject<{ x: number; z: number }> // 내 캐릭터 위치
  headingRef: RefObject<number> // 바라보는 좌우 방향(라디안). 0이면 +Z 쪽
  paused?: boolean // 키오스크·프로필 창이 떠 있으면 잠금을 풀고 다시 잠그지 않습니다.
  onLockChange?: (locked: boolean) => void // 안내 문구·조준점 표시용
  emoteRef?: RefObject<EmoteState> // 감정표현 중이면 카메라가 앞으로 빠져 나를 비춤. 점프하면 눈높이를 같이 올림
  suspendLookRef?: RefObject<boolean> // true 인 동안 마우스로 시점을 돌리지 않음 (감정표현 바퀴)
}

export function WalkCamera({ posRef, headingRef, paused = false, onLockChange, emoteRef, suspendLookRef }: Props) {
  const cam = useRef<PerspectiveCameraImpl>(null!)
  const pitch = useRef(0) // 위(+)·아래(-)로 기울인 각도
  const swing = useRef(0) // 0: 1인칭, 1: 감정표현 때 앞에서 나를 비춤
  const pausedRef = useRef(paused)
  const canvas = useThree((s) => s.gl.domElement)

  useEffect(() => {
    pausedRef.current = paused
    if (paused && document.pointerLockElement === canvas) document.exitPointerLock()
  }, [paused, canvas])

  useEffect(() => {
    const isLocked = () => document.pointerLockElement === canvas
    const lock = () => {
      if (isLocked() || pausedRef.current) return
      // 브라우저가 잠금을 거절할 수 있습니다(다른 창에 들어간 화면, Esc 로 푼 직후 등). 그때는 방향키 ←→ 로 돕니다.
      const request = canvas.requestPointerLock() as Promise<void> | undefined
      request?.catch(() => {})
    }
    // 걷기 키로도 다시 잠급니다. 브라우저는 키 누름도 "사용자가 직접 한 동작"으로 쳐서 잠금을 허락합니다.
    // 채팅·입력칸에 글을 쓰는 중이거나 Ctrl 등과 함께 누른 키는 무시합니다.
    const keyDown = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code) && isShortcut(e)) lock()
    }
    const lockChange = () => {
      // 창이 뜨는 순간과 잠금이 겹치면 바로 다시 풉니다.
      if (isLocked() && pausedRef.current) document.exitPointerLock()
      onLockChange?.(isLocked())
    }
    const move = (e: MouseEvent) => {
      if (!isLocked() || suspendLookRef?.current) return
      const speed = MOUSE_SPEED * getMouseSensitivity()
      headingRef.current -= e.movementX * speed // 마우스를 오른쪽으로 → 오른쪽으로 돌기
      pitch.current = MathUtils.clamp(pitch.current - e.movementY * speed, -PITCH_LIMIT, PITCH_LIMIT) // 위로 → 위 보기
    }
    canvas.addEventListener('click', lock)
    window.addEventListener('keydown', keyDown)
    document.addEventListener('pointerlockchange', lockChange)
    document.addEventListener('mousemove', move)
    return () => {
      canvas.removeEventListener('click', lock)
      window.removeEventListener('keydown', keyDown)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('mousemove', move)
      // 앉거나 위에서 보기로 바꾸면 커서를 돌려줍니다.
      if (isLocked()) document.exitPointerLock()
      onLockChange?.(false)
    }
  }, [canvas, headingRef, onLockChange, suspendLookRef])

  useFrame((_, delta) => {
    const { x, z } = posRef.current
    const h = headingRef.current
    // 감정표현 중이면 앞으로 빠져 돌아서고(swing → 1), 끝나면 돌아옵니다(→ 0).
    const target = emoteRef?.current.playing ? 1 : 0
    swing.current += (target - swing.current) * (1 - Math.exp(-EMOTE_SWING * delta))
    const s = swing.current
    const lift = jumpHeight((performance.now() - (emoteRef?.current.jumpAt ?? -Infinity)) / 1000) // 점프 중이면 그만큼 위로
    // 내 앞쪽(보는 방향)으로 s 만큼 빠집니다. 앞 = (sin h, cos h)
    cam.current.position.set(x + Math.sin(h) * EMOTE_DISTANCE * s, EYE_HEIGHT + EMOTE_LIFT * s + lift, z + Math.cos(h) * EMOTE_DISTANCE * s)
    // 좌우를 먼저 돌리고(Y) 그다음 위아래로 기울입니다(X). 카메라는 기본으로 -Z 를 보므로 반 바퀴 더 돕니다.
    // 감정표현 때는 그 반 바퀴를 빼서 나를 마주 봅니다.
    cam.current.rotation.set(pitch.current * (1 - s) + EMOTE_PITCH * s, h + Math.PI * (1 - s), 0, 'YXZ')
  })

  return <PerspectiveCamera ref={cam} makeDefault fov={WALK_FOV} near={0.05} />
}
