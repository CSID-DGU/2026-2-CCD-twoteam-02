import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { stepWithObstacles } from './layout'
import type { Box, Spot } from './layout'
import { BASE_MODEL_URL } from '../profile/characters'
import { useSkin } from '../tracking/useSkin'
import { useFace } from '../tracking/useFace'
import { useHair } from '../tracking/useHair'
import { RUN_KEYS, RUN_SPEED, WALK_SPEED } from './moveSpeed'
import { EMOTE_CLIPS, beginEmote, clearEmoteRequest, emoteById, emoteSeconds, endEmote, prepareEmoteAction } from './emotes'
import type { EmoteState } from './emotes'
import { holdStandingPose } from './standStill'
import { getKeymap } from '../menu/keymap'
const R = 0.3 // 충돌 반경
const SCALE = 0.6 // 모델 키(약 2.7)를 공간 크기에 맞춥니다.
const TURN = 12 // 방향 전환 빠르기
const FADE = 0.15 // 동작 전환 시간(초)
const MAX_DT = 0.05 // 탭을 잠깐 떠났다 돌아왔을 때 벽을 뚫지 않도록 한 프레임 이동량을 제한합니다.
const SIT_RANGE = 0.9 // 의자에서 이 거리 안에 있으면 앉을 수 있습니다.
const KIOSK_RANGE = 1.0 // 키오스크 중심에서 이 거리 안에 있으면 사용할 수 있습니다.
// 출입문 중심에서 이 거리 안이면 나갈 수 있습니다. 들어오면 서는 자리(문에서 1m)보다 짧게 둬서
// 들어오자마자 "나가기" 안내가 뜨지 않고, 문 쪽으로 한 걸음 더 가야 뜹니다. (#150)
const EXIT_RANGE = 0.8
const MEETING_RANGE = 0.8 // 회의실 문 앞 자리(meetingDoorFront)에서 이 거리 안이면 들어갈 수 있습니다. (#45)
const ELEVATOR_RANGE = 0.8 // 엘리베이터 문 앞 자리(elevatorFront)에서 이 거리 안이면 층을 고를 수 있습니다. (회의실 문과 같음)
const KEY_TURN_SPEED = 2.2 // 1인칭에서 방향키 ←→ 로 도는 빠르기(초당 라디안)

type Props = {
  model: string // 내 캐릭터 차림(아바타 키, 내 프로필에서 고름 #131·#56)
  obstacles: Box[]
  spawn: { x: number; z: number }
  spawnHeading?: number // 처음 바라보는 방향(라디안, 0이면 +Z). 문을 지나 왔을 때 보던 방향 그대로 (#150)
  spots: Spot[]
  kiosk: { x: number; z: number }
  frozen: boolean // 키오스크 화면처럼 다른 창이 떠 있으면 움직이지 않습니다.
  onNear: (no: number | null) => void // 앉을 수 있는 좌석이 바뀔 때
  onSeat: (no: number | null) => void // 앉거나 일어날 때
  onNearKiosk: (near: boolean) => void // 키오스크를 쓸 수 있는 거리에 들어오거나 벗어날 때
  onKiosk: () => void // 키오스크 앞에서 E를 눌렀을 때
  exit?: { x: number; z: number } // 나가는 출입문 위치. 없으면 문으로 나갈 수 없습니다. (#150)
  onNearExit?: (near: boolean) => void // 출입문 앞에 들어오거나 벗어날 때
  onExit?: () => void // 출입문 앞에서 E를 눌렀을 때
  meeting?: { x: number; z: number } // 회의실 문 앞 자리. 없으면 회의실이 없는 곳입니다. (#45)
  onNearMeeting?: (near: boolean) => void // 회의실 문 앞에 들어오거나 벗어날 때
  onMeeting?: () => void // 회의실 문 앞에서 E를 눌렀을 때
  elevator?: { x: number; z: number } // 엘리베이터 문 앞 자리. 없으면 엘리베이터가 없는 곳입니다. (여러 층 건물)
  onNearElevator?: (near: boolean) => void // 엘리베이터 문 앞에 들어오거나 벗어날 때
  onElevator?: () => void // 엘리베이터 문 앞에서 E를 눌렀을 때
  canSit?: (no: number) => boolean // 앉아도 되는 자리인지. 없으면 모든 자리에 앉을 수 있습니다.
  // 매 프레임 현재 위치와 몸이 바라보는 방향(라디안). 받는 쪽은 ref 에 담아 두고 필요할 때 읽습니다.
  onMove?: (x: number, z: number, heading: number) => void
  // 1인칭으로 걸을 때 바라보는 방향(라디안). 넘기면 W 가 보는 쪽 앞, A·D 가 옆걸음, ←→ 가 회전이 됩니다.
  // 넘기지 않으면 위에서 내려다보는 조작(W 가 화면 위쪽)입니다.
  headingRef?: RefObject<number>
  // 앉을 수 없는 자리(canSit 이 false)에서 E 를 눌렀을 때. 카페는 여기서 DB에 자리를 잡아 봅니다. (#44)
  onSitBlocked?: (no: number) => void
  // 바깥에서 "이 번호 자리에 앉아라" 요청. 그 자리 앞에 서 있으면 다음 프레임에 앉습니다. (카페: 자리를 잡은 뒤)
  sitRef?: RefObject<number | null>
  // 감정표현 (#162). 바깥(EmoteControls)에서 request 를 넣으면 서 있을 때 그 동작을 합니다. 움직이면 멈춥니다.
  emoteRef?: RefObject<EmoteState>
}

export function Player({ model: character, obstacles, spawn, spawnHeading = 0, spots, kiosk, frozen, onNear, onSeat, onNearKiosk, onKiosk, exit, onNearExit, onExit, meeting, onNearMeeting, onMeeting, elevator, onNearElevator, onElevator, canSit, onMove, headingRef, onSitBlocked, sitRef, emoteRef }: Props) {
  const ref = useRef<Group>(null!)
  // 동작의 뿌리: 모델(캐릭터)이 바뀌면 key 로 이 묶음도 새로 만듭니다. drei useAnimations 는 모델이 바뀔 때 예전 관절 연결을
  // 지우지 못해서, 같은 뿌리를 쓰면 새 동작이 화면에서 빠진 옛 모델을 움직이고 새 모델은 가만히 있었습니다. (#259)
  const animRoot = useRef<Group>(null!)
  const keys = useRef(new Set<string>())
  const toggle = useRef(false) // 앉기/일어나기 키가 눌렸는지
  const anim = useRef('idle')
  const near = useRef<Spot | null>(null)
  const nearKiosk = useRef(false)
  const nearExit = useRef(false)
  const nearMeeting = useRef(false)
  const nearElevator = useRef(false)
  const seated = useRef<Spot | null>(null)
  const { scene, animations } = useGLTF(BASE_MODEL_URL)
  // 트래킹 화면과 같은 모델을 쓰므로 복사본을 씁니다.
  const model = useMemo(() => scene.clone(true), [scene])
  useSkin(model, character) // 고른 차림의 스킨을 입힘 (#56)
  useFace(model, character) // 눈썹·눈·입 (#293)
  useHair(model, character) // 입체 머리카락 (#296)
  // 캐릭터에 들어 있는 동작 + 직접 만든 감정표현 동작 (#162)
  const clips = useMemo(() => [...animations, ...EMOTE_CLIPS], [animations])
  const { actions } = useAnimations(clips, animRoot)

  useEffect(() => {
    holdStandingPose(actions.idle) // 서 있을 때는 흔들지 않고 가만히 (#244)
    actions[anim.current]?.play()
  }, [actions])

  useEffect(() => {
    const pressed = keys.current
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code.startsWith('Arrow')) e.preventDefault() // 방향키로 페이지가 스크롤되지 않게
      if (e.code === getKeymap().interact && !e.repeat) toggle.current = true // 앉기·일어나기·입장 (기본 E, 설정에서 바꿈 #250)
      pressed.add(e.code)
    }
    const up = (e: KeyboardEvent) => pressed.delete(e.code)
    const clear = () => pressed.clear() // 창을 벗어나면 눌린 키를 모두 뗀 것으로 봅니다.
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useFrame((_, delta) => {
    const k = keys.current, g = ref.current, p = g.position
    const dt = Math.min(delta, MAX_DT)
    // Shift 를 누르고 있으면 달립니다. (#118)
    const running = RUN_KEYS.some((key) => k.has(key))
    const speed = running ? RUN_SPEED : WALK_SPEED

    // 앉아 있든 멈춰 있든 위치와 방향은 알려 줍니다. 다른 참여자 화면에 내가 그려지는 데 씁니다.
    // 방향은 지난 프레임에 정해진 몸 방향입니다. 1인칭이면 보는 방향, 위에서 볼 때는 가는 방향입니다. (#122)
    onMove?.(p.x, p.z, g.rotation.y)

    const play = (name: string) => {
      if (anim.current === name) return
      actions[anim.current]?.fadeOut(FADE)
      actions[name]?.reset().fadeIn(FADE).play()
      anim.current = name
    }
    const setNear = (spot: Spot | null) => {
      if (near.current === spot) return
      near.current = spot
      onNear(spot?.no ?? null)
    }
    const setNearKiosk = (v: boolean) => {
      if (nearKiosk.current === v) return
      nearKiosk.current = v
      onNearKiosk(v)
    }
    const setNearExit = (v: boolean) => {
      if (nearExit.current === v) return
      nearExit.current = v
      onNearExit?.(v)
    }
    const setNearMeeting = (v: boolean) => {
      if (nearMeeting.current === v) return
      nearMeeting.current = v
      onNearMeeting?.(v)
    }
    const setNearElevator = (v: boolean) => {
      if (nearElevator.current === v) return
      nearElevator.current = v
      onNearElevator?.(v)
    }

    // 감정표현: 지금 하던 것을 멈춥니다(움직이거나 앉거나 창이 뜰 때).
    const em = emoteRef?.current
    const stopEmote = () => {
      if (!em?.playing) return
      endEmote(em)
      play('idle')
    }

    // 다른 창이 떠 있는 동안에는 키 입력을 무시하고 제자리에 서 있습니다.
    if (frozen) {
      if (em) clearEmoteRequest(em)
      stopEmote()
      toggle.current = false
      if (!seated.current) play('idle') // 앉아 있을 때는 앉은 자세를 그대로 둡니다.
      return
    }

    // 앉기/일어나기
    const wantToggle = toggle.current
    toggle.current = false
    if (seated.current) {
      if (em) clearEmoteRequest(em) // 앉아 있을 때는 감정표현을 하지 않습니다 (다리 자세·트래킹과 겹침)
      if (!wantToggle) return
      // 단 위 자리(강의실)면 단 뒤 통로로 내려섭니다
      const standAt = seated.current.standAt
      if (standAt) {
        p.x = standAt.x
        p.z = standAt.z
      }
      seated.current = null
      g.visible = true
      onSeat(null)
      play('idle')
      return
    }
    // 가까이 가면 안내는 뜨지만, 앉아도 되는 자리일 때만 앉습니다. (예: 키오스크에서 배정받은 내 자리)
    // 바깥에서 앉으라고 요청한 자리(sitRef) 앞이면 E 없이 앉습니다.
    const requested = sitRef?.current ?? null
    const forced = requested !== null && near.current?.no === requested
    if (forced && sitRef) sitRef.current = null
    if (wantToggle && near.current && !forced && !(canSit?.(near.current.no) ?? true)) {
      onSitBlocked?.(near.current.no)
      return
    }
    if (near.current && (forced || (wantToggle && (canSit?.(near.current.no) ?? true)))) {
      stopEmote()
      const s = near.current
      seated.current = s
      p.x = s.x
      p.z = s.z
      g.rotation.y = s.rot
      if (headingRef) headingRef.current = s.rot // 일어났을 때 책상 쪽을 보고 있도록 맞춥니다.
      g.visible = false // 1인칭 시점에서는 내 캐릭터가 화면을 가리므로 숨깁니다.
      setNear(null)
      onSeat(s.no)
      play('sit')
      return
    }
    if (wantToggle && nearKiosk.current) {
      play('idle')
      onKiosk()
      return
    }
    if (wantToggle && nearMeeting.current) {
      play('idle')
      onMeeting?.()
      return
    }
    if (wantToggle && nearElevator.current) {
      play('idle')
      onElevator?.()
      return
    }
    if (wantToggle && nearExit.current) {
      play('idle')
      onExit?.()
      return
    }

    let dx = 0, dz = 0
    if (headingRef) {
      // 1인칭: 보는 방향 기준으로 움직입니다. 내 캐릭터는 카메라를 가리므로 숨깁니다.
      // 감정표현 중에는 카메라가 앞으로 빠져 나를 비추므로 보이게 합니다. (WalkCamera)
      g.visible = Boolean(em?.playing)
      const turn = +k.has('ArrowRight') - +k.has('ArrowLeft')
      headingRef.current -= turn * KEY_TURN_SPEED * dt // 오른쪽 방향키 = 오른쪽으로 돌기
      const h = headingRef.current
      g.rotation.y = h
      const f = +(k.has('KeyW') || k.has('ArrowUp')) - +(k.has('KeyS') || k.has('ArrowDown')) // 앞뒤
      const r = +k.has('KeyD') - +k.has('KeyA') // 옆걸음
      if (f || r) {
        const step = (speed * dt) / Math.hypot(f, r)
        // 앞 = (sin h, cos h), 오른쪽 = (-cos h, sin h)
        dx = (f * Math.sin(h) - r * Math.cos(h)) * step
        dz = (f * Math.cos(h) + r * Math.sin(h)) * step
      }
    } else {
      g.visible = true
      const ix = +(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))
      const iz = +(k.has('KeyS') || k.has('ArrowDown')) - +(k.has('KeyW') || k.has('ArrowUp'))
      if (ix || iz) {
        // 대각선도 같은 속도가 되도록 방향을 정규화합니다.
        const step = (speed * dt) / Math.hypot(ix, iz)
        dx = ix * step
        dz = iz * step
        // 가는 방향을 바라보도록 가까운 쪽으로 부드럽게 돕니다. (모델 정면은 +Z)
        const diff = Math.atan2(ix, iz) - g.rotation.y
        g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-TURN * dt))
      }
    }
    const moving = dx !== 0 || dz !== 0

    // 감정표현: 움직이면 멈추고, 서 있을 때 고른 것이 있으면 시작합니다. 하는 동안은 걷기·서기 동작을 바꾸지 않습니다.
    if (em) {
      if (moving) stopEmote()
      else if (em.request && !em.playing) {
        const def = emoteById(em.request)
        const action = def ? actions[def.clip] : null
        if (def && action) {
          actions[anim.current]?.fadeOut(FADE)
          prepareEmoteAction(action, def)
          action.reset().fadeIn(FADE).play()
          anim.current = def.clip
          beginEmote(em, def.id, emoteSeconds(def, action.getClip().duration))
        }
      }
      clearEmoteRequest(em)
      if (em.playing && performance.now() > em.until) stopEmote()
    }
    if (!em?.playing) play(moving ? 'walk' : 'idle')
    // 달릴 때는 걷기 동작을 빠르기에 맞춰 빨리 재생합니다. (다리가 미끄러져 보이지 않게)
    actions.walk?.setEffectiveTimeScale(speed / WALK_SPEED)
    if (moving) {
      // 축별로 따로 판정해서 벽에 비스듬히 닿으면 미끄러지듯 움직입니다. 일어난 자리에서 겹친 상자는 빠져나갈 수 있습니다.
      const next = stepWithObstacles(p, dx, dz, obstacles, R)
      p.x = next.x
      p.z = next.z
    }

    // 가장 가까운 의자를 찾아 앉을 수 있는지 알려 줍니다.
    let best: Spot | null = null, bestDist = SIT_RANGE
    for (const s of spots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < bestDist) { best = s; bestDist = d }
    }
    setNear(best)
    // 의자가 가까우면 앉기가 먼저이고, 아닐 때만 키오스크를 쓸 수 있습니다. 회의실 문, 엘리베이터, 출입문은 그다음입니다.
    const kioskNear = !best && Math.hypot(kiosk.x - p.x, kiosk.z - p.z) < KIOSK_RANGE
    setNearKiosk(kioskNear)
    const meetingNear = !best && !kioskNear && !!meeting && Math.hypot(meeting.x - p.x, meeting.z - p.z) < MEETING_RANGE
    setNearMeeting(meetingNear)
    const elevatorNear = !best && !kioskNear && !meetingNear && !!elevator && Math.hypot(elevator.x - p.x, elevator.z - p.z) < ELEVATOR_RANGE
    setNearElevator(elevatorNear)
    setNearExit(!best && !kioskNear && !meetingNear && !elevatorNear && !!exit && Math.hypot(exit.x - p.x, exit.z - p.z) < EXIT_RANGE)
  })

  return (
    <group ref={ref} position={[spawn.x, 0, spawn.z]} rotation={[0, spawnHeading, 0]}>
      <group ref={animRoot} key={character}>
        <primitive object={model} scale={SCALE} />
      </group>
    </group>
  )
}

useGLTF.preload(BASE_MODEL_URL)
