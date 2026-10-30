// 지점을 돌아다니는 다른 참여자의 캐릭터. (앉아 있는 사람은 SeatedCharacter 를 씁니다)
//
// 위치는 0.25초에 한 번씩 오는데 화면은 1초에 60번 그리므로 사이를 메워야 합니다.
//
// 전에는 받은 위치를 "목표"로 두고 매 프레임 그쪽으로 다가가게 했는데(지수 보간),
// 목표가 0.25초마다 껑충 뛰므로 캐릭터가 확 가속했다 감속하기를 1초에 네 번 반복했습니다.
// 달릴 때는 한 번에 1.6m 씩 뛰어 더 두드러졌습니다.
//
// 지금은 받은 위치를 쌓아 두고 INTERP_DELAY_MS 만큼 과거를 재생합니다. 두 표본 사이를
// 일정한 속도로 이으므로 보낸 사람의 움직임이 그대로 나옵니다. 메시지는 더 쓰지 않고,
// 대신 화면이 그만큼 늦습니다. 계산은 walkLogic.ts 의 sampleAt 참고.
//
// 목표 위치(x, z prop)와 실제로 그리는 위치(group.position)는 따로 둡니다.
// position 을 prop 으로 묶으면 메시지가 올 때마다 R3F 가 좌표로 바로 덮어써서
// 보간·걷기 동작·방향 돌리기가 모두 안 되고 순간이동만 합니다. (#130)
// 걷기 판단과 몸 방향은 walkLogic.ts 참고. (#122)
// 서서 감정표현을 하면(emote) 같은 동작을 재생하고, 걷기 시작하면 멈춥니다. (#162)
// 점프 번호(jump)가 바뀌면 받은 순간부터 한 번 폴짝 뜁니다. (높이는 jumpLogic.ts, 보낸 사람 화면과 같은 포물선)
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { INTERP_DELAY_MS, SAMPLE_MAX, TELEPORT_GAP, angleDiff, facingGoal, gaitOf, sampleAt } from './walkLogic'
import { WALK_SPEED } from '../space/moveSpeed'
import type { Gait, Sample } from './walkLogic'
import { EMOTE_CLIPS, emoteById, emoteSeconds, prepareEmoteAction } from '../space/emotes'
import { holdStandingPose } from '../space/standStill'
import { jumpHeight } from '../space/jumpLogic'
import { BASE_MODEL_URL } from '../profile/characters'
import { useSkin } from '../tracking/useSkin'
import { useFace } from '../tracking/useFace'
import { useHair } from '../tracking/useHair'

const SCALE = 0.6 // Player와 같은 크기
const TURN = 12 // 방향 전환 빠르기 (Player와 같은 값)
const FADE = 0.15 // 동작 전환 시간(초)
const PACE_MIN = 0.7 // 걷기 동작 재생 빠르기 범위 (걷기 = 1)
const PACE_MAX = 2.2

type Props = {
  x: number
  z: number
  h?: number // 그 사람이 보낸 몸 방향. 없으면 가는 방향을 봅니다.
  model: string
  children?: ReactNode // 캐릭터와 함께 움직일 것 (닉네임·표시등). 몸이 돌아도 따라 돌지 않습니다.
  emote?: string // 그 사람이 지금 하는 감정표현 (#162)
  emoteSeq?: number // 감정표현을 새로 시작할 때마다 올라가는 번호
  jump?: number // 점프할 때마다 올라가는 번호
}

export function WalkingCharacter({ x, z, h, model, children, emote, emoteSeq, jump }: Props) {
  const ref = useRef<Group>(null!) // 위치만 옮기는 묶음
  const body = useRef<Group>(null!) // 몸 방향만 돌리는 묶음
  // 동작의 뿌리: 모델(캐릭터)이 바뀌면 key 로 이 묶음도 새로 만듭니다. drei useAnimations 는 모델이 바뀔 때 예전 관절 연결을
  // 지우지 못해서, 같은 뿌리를 쓰면 새 동작이 화면에서 빠진 옛 모델을 움직이고 새 모델은 가만히 있었습니다. (#259)
  const animRoot = useRef<Group>(null!)
  const gait = useRef<Gait>('idle')
  const buf = useRef<Sample[]>([]) // 받은 위치들. 여기서 과거를 꺼내 재생합니다.
  const placed = useRef(false) // 처음 한 번은 받은 위치에 바로 놓습니다.
  const { scene, animations } = useGLTF(BASE_MODEL_URL)
  // 같은 모델을 여러 사람이 쓰므로 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  useSkin(copy, model) // 그 사람이 고른 차림의 스킨을 입힘 (#56)
  useFace(copy, model) // 눈썹·눈·입 (#293)
  useHair(copy, model) // 입체 머리카락 (#296)
  // 캐릭터에 들어 있는 동작 + 직접 만든 감정표현 동작
  const clips = useMemo(() => [...animations, ...EMOTE_CLIPS], [animations])
  const { actions } = useAnimations(clips, animRoot)
  const emoteClip = useRef<string | null>(null) // 지금 재생 중인 감정표현 동작
  const emoteUntil = useRef(0)
  const emoteStarted = useRef(0) // 마지막으로 재생을 시작한 감정표현 번호 (같은 번호는 다시 시작하지 않음)
  const jumpSeen = useRef<number | undefined>(undefined) // 마지막으로 본 점프 번호. 처음 받은 번호로는 뛰지 않음(들어오자마자 뛰지 않게)
  const jumpStart = useRef(-Infinity) // 뛰기 시작한 시각(ms)

  useEffect(() => {
    holdStandingPose(actions.idle) // 서 있을 때는 흔들지 않고 가만히 (#244)
    actions.idle?.play()
    // 캐릭터가 바뀌어 동작을 새로 만들었으면 서 있는 상태부터 다시 맞춥니다. 걷는 중이면 다음 프레임에 걷기로 바뀝니다. (#259)
    gait.current = 'idle'
    emoteClip.current = null
  }, [actions])

  // 새 위치가 올 때마다 받은 시각과 함께 쌓아 둡니다.
  // prop 이 바뀔 때만 도므로, 같은 값이 다시 와도 표본이 늘지 않습니다.
  useEffect(() => {
    const b = buf.current
    b.push({ t: performance.now(), x, z, h })
    if (b.length > SAMPLE_MAX) b.shift()
  }, [x, z, h])

  // 점프 번호가 바뀌면 지금부터 한 번 뜁니다. 처음 받은 번호는 기준으로만 삼습니다.
  useEffect(() => {
    if (jumpSeen.current !== undefined && jump !== undefined && jump !== jumpSeen.current) jumpStart.current = performance.now()
    jumpSeen.current = jump ?? 0
  }, [jump])

  useFrame((_, delta) => {
    const g = ref.current
    const b = body.current
    if (!g || !b) return
    const p = g.position

    // 조금 과거를 재생합니다. 그 시각을 사이에 둔 두 표본을 잇습니다.
    const at = sampleAt(buf.current, performance.now() - INTERP_DELAY_MS)
    if (!at) return

    // 처음 나타날 때나 멀리 떨어져 있으면(자리에서 일어남 등) 걸어가지 않고 바로 옮깁니다.
    if (!placed.current || Math.hypot(at.x - p.x, at.z - p.z) > TELEPORT_GAP) {
      if (at.h !== undefined) b.rotation.y = at.h
      placed.current = true
    }

    // 보간한 위치를 그대로 씁니다. 쫓아가지 않으므로 가속·감속이 생기지 않습니다.
    // 높이는 점프 중이면 포물선대로. 닉네임·표시등(children)도 같은 묶음이라 몸과 같이 뜁니다.
    p.set(at.x, jumpHeight((performance.now() - jumpStart.current) / 1000), at.z)

    // 걷는지와 몸 방향은 재생 중인 속도로 정합니다.
    const goal = facingGoal(at.vx, at.vz, at.h, gait.current !== 'idle')
    if (goal !== null) b.rotation.y += angleDiff(goal, b.rotation.y) * (1 - Math.exp(-TURN * delta))
    const next = gaitOf(at.vx, at.vz, b.rotation.y, gait.current !== 'idle')

    // 감정표현: 서 있을 때 새 번호가 오면 시작, 걷거나 그 사람이 멈추거나 시간이 지나면 끝냅니다.
    const now = performance.now()
    if (emoteClip.current && (next !== 'idle' || !emote || now > emoteUntil.current)) {
      actions[emoteClip.current]?.fadeOut(FADE)
      actions[next === 'idle' ? 'idle' : 'walk']?.reset().fadeIn(FADE).play()
      emoteClip.current = null
    }
    const def = emoteById(emote)
    if (def && next === 'idle' && !emoteClip.current && emoteSeq !== undefined && emoteSeq !== emoteStarted.current) {
      const action = actions[def.clip]
      if (action) {
        actions[gait.current === 'idle' ? 'idle' : 'walk']?.fadeOut(FADE)
        prepareEmoteAction(action, def)
        action.reset().fadeIn(FADE).play()
        emoteClip.current = def.clip
        emoteUntil.current = now + emoteSeconds(def, action.getClip().duration) * 1000
        emoteStarted.current = emoteSeq
      }
    }

    if (gait.current !== next) {
      const from = gait.current === 'idle' ? 'idle' : 'walk'
      const to = next === 'idle' ? 'idle' : 'walk'
      // 감정표현 중에는 서기 동작으로 덮지 않습니다.
      if (from !== to && !emoteClip.current) {
        actions[from]?.fadeOut(FADE)
        actions[to]?.reset().fadeIn(FADE).play()
      }
      gait.current = next
    }
    // 걷기 동작 빠르기: 실제로 움직이는 빠르기에 맞추고, 뒷걸음은 거꾸로 재생합니다. (재생 속도가 음수)
    // 보간한 속도는 구간 안에서 일정해 출렁이지 않으므로 따로 고르게 할 필요가 없습니다.
    if (next !== 'idle') {
      const speed = Math.hypot(at.vx, at.vz)
      const rate = Math.min(PACE_MAX, Math.max(PACE_MIN, speed / WALK_SPEED))
      actions.walk?.setEffectiveTimeScale(next === 'backward' ? -rate : rate)
    }
  })

  return (
    <group ref={ref}>
      <group ref={body}>
        <group ref={animRoot} key={model}>
          <primitive object={copy} scale={SCALE} />
        </group>
      </group>
      {children}
    </group>
  )
}
