// 1인칭 걸어 다니기 카메라: 서 있는 눈높이에서 내 캐릭터 위치를 따라갑니다.
//
// 마우스로 바라보기(오버워치 방식, #73): 화면을 클릭하면 마우스가 잠기고(Pointer Lock) 커서가 사라집니다.
// 그 상태에서 마우스를 움직이면 좌우·위아래로 바라봅니다. Esc 를 누르면 브라우저가 잠금을 풀어 커서가 돌아옵니다.
// 잠금이 풀린 뒤에는 클릭하거나 걷기 키(WASD·방향키)를 누르면 다시 잠깁니다(#205). 창을 닫고 걷기 시작하면 바로 둘러볼 수 있게.
// 바라보는 좌우 방향(headingRef)은 Player 와 같이 써서, W 를 누르면 보는 쪽으로 걷습니다.
// 위아래(pitch)는 카메라만 기울입니다. 걷는 방향에는 영향이 없습니다.
// 방향키: ←→ 는 좌우로 돌기(Player), ↑↓ 는 위아래 보기(여기). 마우스를 잠그지 않아도 방향키만으로 둘러볼 수 있습니다.
//
// 감정표현(#162) 중에는 오버워치처럼 카메라가 앞으로 빠져 돌아서서 내 캐릭터를 비추고, 끝나면 돌아옵니다.
// 앞이 벽이거나 사람이 가까이 서 있으면 내가 가려지므로, 트인 방향(옆·뒤)을 골라 빠지고 벽·사람 앞에서 멈춥니다(emoteCameraLogic.ts).
// 사방이 막혀 빠질 자리가 없으면 카메라를 그대로 두고 내 몸은 숨깁니다(emotes.ts selfHidden).
// 감정표현 바퀴를 고르는 동안에는 마우스로 시점이 돌지 않습니다(바퀴 고르기에 마우스를 씀).
// 점프하면 눈높이도 캐릭터와 같은 포물선으로 올라갔다 내려옵니다(jumpLogic.ts).
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { MathUtils } from 'three'
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three'
import type { EmoteState } from './emotes'
import { setEmoteSelfHidden } from './emotes'
import { EMOTE_CAMERA, freeDistance, pickEmoteView, wrapAngle } from './emoteCameraLogic'
import type { Point } from './emoteCameraLogic'
import type { Box } from './layout'
import { isShortcut } from '../menu/shortcuts'
import { getMouseSensitivity } from '../menu/lookSettings'
import { jumpHeight } from './jumpLogic'
import { takeLook } from './touchInput'

const EYE_HEIGHT = 1.45 // 서 있을 때 눈높이 (캐릭터 키 약 1.6)
const WALK_FOV = 70 // 걸을 때는 앉았을 때보다 조금 넓게 봅니다.
const MOUSE_SPEED = 0.0025 // 마우스를 1픽셀 움직일 때 도는 각도(라디안). 설정 창의 마우스 감도(배율)를 곱합니다(#222).
const TOUCH_SPEED = 0.006 // 폰에서 화면을 1픽셀 끌 때 도는 각도(라디안, #377). 감도 배율을 같이 곱함
const PITCH_LIMIT = Math.PI / 3 // 위아래 각 60도까지
const KEY_PITCH_SPEED = 1.4 // 방향키 ↑↓ 로 위아래를 보는 빠르기(초당 라디안)
const EMOTE_LIFT = 0.15 // 그때 눈높이에서 조금 올림
const EMOTE_PITCH = -0.18 // 그때 살짝 내려다봄
const EMOTE_SWING = 5 // 빠지고 돌아오는 빠르기
const EMOTE_REACH = 6 // 카메라 거리가 바뀔 때(사람이 지나감 등) 따라가는 빠르기. 줄어드는 쪽은 바로 줄임(벽·사람 속에 들어가지 않게)
const NO_BOXES: Box[] = []
const NO_PEOPLE: Point[] = []
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) // 누르면 다시 잠그는 키

type Props = {
  posRef: RefObject<{ x: number; z: number }> // 내 캐릭터 위치
  headingRef: RefObject<number> // 바라보는 좌우 방향(라디안). 0이면 +Z 쪽
  paused?: boolean // 키오스크·프로필 창이 떠 있으면 잠금을 풀고 다시 잠그지 않습니다.
  onLockChange?: (locked: boolean) => void // 안내 문구·조준점 표시용
  emoteRef?: RefObject<EmoteState> // 감정표현 중이면 카메라가 앞으로 빠져 나를 비춤. 점프하면 눈높이를 같이 올림
  suspendLookRef?: RefObject<boolean> // true 인 동안 마우스로 시점을 돌리지 않음 (감정표현 바퀴)
  blockers?: Box[] // 감정표현 카메라를 가리는 높은 것(벽·건물·나무). 없으면 예전처럼 늘 앞으로 빠짐
  people?: () => Point[] // 지금 다른 사람들의 위치 (감정표현 카메라가 사람 뒤로 가지 않게). 매 프레임 부르므로 가볍게
}

export function WalkCamera({ posRef, headingRef, paused = false, onLockChange, emoteRef, suspendLookRef, blockers = NO_BOXES, people }: Props) {
  const cam = useRef<PerspectiveCameraImpl>(null!)
  const pitch = useRef(0) // 위(+)·아래(-)로 기울인 각도
  const swing = useRef(0) // 0: 1인칭, 1: 감정표현 때 앞에서 나를 비춤
  // 이번 감정표현에서 카메라가 빠지는 방향(보는 방향 기준 각도)과 지금 거리. 시작할 때 한 번 고름. null: 빠질 자리가 없어 제자리
  const view = useRef<{ rel: number; dist: number } | null>({ rel: 0, dist: EMOTE_CAMERA.distance })
  const wasPlaying = useRef(false)
  const peopleRef = useRef(people) // 쓰는 쪽에서 매 렌더 새 함수를 넘겨도 최신 것을 읽게
  useEffect(() => {
    peopleRef.current = people
  })
  const pausedRef = useRef(paused)
  const tilt = useRef({ up: false, down: false }) // 방향키 ↑↓ 를 누르고 있는지
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
      if (isShortcut(e)) setTilt(tilt.current, e.code, true)
    }
    const keyUp = (e: KeyboardEvent) => setTilt(tilt.current, e.code, false)
    const clearTilt = () => setTilt(tilt.current, null, false)
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
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', clearTilt)
    document.addEventListener('pointerlockchange', lockChange)
    document.addEventListener('mousemove', move)
    return () => {
      canvas.removeEventListener('click', lock)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', clearTilt)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('mousemove', move)
      // 앉거나 위에서 보기로 바꾸면 커서를 돌려줍니다.
      if (isLocked()) document.exitPointerLock()
      onLockChange?.(false)
    }
  }, [canvas, headingRef, onLockChange, suspendLookRef])

  useFrame((_, delta) => {
    // 폰에서 오른쪽 화면을 끈 만큼 돌기 (#377, TouchControls). 손가락을 오른쪽으로 → 오른쪽으로 돌기
    const look = takeLook()
    if ((look.dx || look.dy) && !suspendLookRef?.current) {
      const speed = TOUCH_SPEED * getMouseSensitivity()
      headingRef.current -= look.dx * speed
      pitch.current = MathUtils.clamp(pitch.current - look.dy * speed, -PITCH_LIMIT, PITCH_LIMIT)
    }
    // 방향키 ↑ = 위 보기, ↓ = 아래 보기. 창이 떠 있거나 감정표현 바퀴를 고르는 동안은 멈춤
    const t = +tilt.current.up - +tilt.current.down
    if (t && !pausedRef.current && !suspendLookRef?.current) {
      pitch.current = MathUtils.clamp(pitch.current + t * KEY_PITCH_SPEED * Math.min(delta, 0.05), -PITCH_LIMIT, PITCH_LIMIT)
    }
    const { x, z } = posRef.current
    const h = headingRef.current
    // 감정표현을 시작하는 순간 카메라가 빠질 방향을 고릅니다: 앞이 트였으면 앞, 벽·사람에 막혔으면 옆·뒤 중 트인 쪽.
    const playing = Boolean(emoteRef?.current.playing)
    if (emoteRef && playing !== wasPlaying.current) {
      wasPlaying.current = playing
      if (playing) {
        const pick = pickEmoteView({ x, z }, h, blockers, peopleRef.current?.() ?? NO_PEOPLE)
        view.current = pick ? { rel: pick.angle - h, dist: pick.distance } : null
      }
      setEmoteSelfHidden(emoteRef.current, playing && view.current === null) // 빠질 자리가 없으면 제자리에서 내 몸을 숨김
    }
    const v = view.current
    // 감정표현 중이면 빠져서 돌아서고(swing → 1), 끝나면 돌아옵니다(→ 0). 빠질 자리가 없으면 1인칭 그대로.
    const target = playing && v ? 1 : 0
    swing.current += (target - swing.current) * (1 - Math.exp(-EMOTE_SWING * delta))
    const s = swing.current
    const lift = jumpHeight((performance.now() - (emoteRef?.current.jumpAt ?? -Infinity)) / 1000) // 점프 중이면 그만큼 위로
    // 빠지는 방향은 보는 방향을 따라 돕니다(감정표현 중 마우스로 돌리면 카메라도 내 둘레를 돎). 방향 = (sin a, cos a)
    const a = h + (v?.rel ?? 0)
    if (v && s > 0.001) {
      // 그 방향으로 지금 갈 수 있는 거리. 돌리다 벽에 가까워지거나 사람이 지나가면 그 앞에서 멈춥니다.
      const allowed = freeDistance({ x, z }, a, blockers, peopleRef.current?.() ?? NO_PEOPLE, EMOTE_CAMERA.distance)
      v.dist = Math.min(allowed, v.dist + (allowed - v.dist) * (1 - Math.exp(-EMOTE_REACH * delta)))
    }
    const dist = (v?.dist ?? 0) * s
    cam.current.position.set(x + Math.sin(a) * dist, EYE_HEIGHT + EMOTE_LIFT * s + lift, z + Math.cos(a) * dist)
    // 좌우를 먼저 돌리고(Y) 그다음 위아래로 기울입니다(X). 카메라는 기본으로 -Z 를 보므로 1인칭은 반 바퀴 더 돈 h + π.
    // 감정표현 때는 빠진 자리에서 나를 마주 보는 각도 a 로, 가까운 쪽으로 돌아갑니다(앞으로 빠질 때는 예전처럼 반 바퀴).
    const turn = wrapAngle((v?.rel ?? 0) - Math.PI)
    cam.current.rotation.set(pitch.current * (1 - s) + EMOTE_PITCH * s, h + Math.PI + turn * s, 0, 'YXZ')
  })

  return <PerspectiveCamera ref={cam} makeDefault fov={WALK_FOV} near={0.05} />
}

// 방향키 ↑↓ 누름 상태를 바꿉니다. code 가 null 이면 둘 다 뗌(창을 벗어났을 때).
// 받은 객체를 바꾸는 일이라 컴포넌트 밖에 둡니다(React 규칙 검사).
function setTilt(t: { up: boolean; down: boolean }, code: string | null, pressed: boolean) {
  if (code === null || code === 'ArrowUp') t.up = code === null ? false : pressed
  if (code === null || code === 'ArrowDown') t.down = code === null ? false : pressed
}
