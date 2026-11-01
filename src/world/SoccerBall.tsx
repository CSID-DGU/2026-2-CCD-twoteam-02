// 캠퍼스 축구공: 내 캐릭터가 공 쪽으로 걸어가 닿으면 참(뛰면 더 세게). 굴리기·튕기기·골은 ballLogic.ts (순수 로직).
//
// 여러 사람이 같이 보기 (실시간 방 BALL_CHANNEL, DB 없음):
//   마지막에 찬 사람이 공의 "주인"입니다. 주인은 공이 구르는 동안 SEND_MS 마다, 멈출 때 한 번 공 상태를 보냅니다.
//   다른 사람은 받은 상태로 바꾸고 그다음은 같은 물리로 굴립니다(그 사이도 부드럽게). 골도 주인이 정해 같이 보냅니다.
//   새로 들어온 사람은 "공 어디 있어요?"(need)를 보내고, 공 상태를 아는 사람이 답합니다. 아무도 없으면 가운데 점에서 시작.
//   거의 동시에 둘이 차면 나중에 보낸 쪽으로 맞춰집니다.
// 골이 나면 골대 위에 "골!"을 GOAL_SHOW_MS 동안 띄우고, 주인이 공을 가운데 점으로 돌려놓습니다.
// 축구장 밖으로 나가 BALL.outReturnMs 동안 있으면 주인이 가운데 점으로 돌려놓습니다. 주인이 떠났으면 그 두 배 뒤에 아무나.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { supabase } from '../lib/supabase'
import { BALL, kickBall, nudgeBall, outOfPitch, stepBall } from './ballLogic'
import type { BallState, BallWorld, Goal, Pitch } from './ballLogic'
import { ballTexture } from './fieldShapes'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import type { Box } from '../space/layout'

const BALL_CHANNEL = 'campus-ball'
const SEND_MS = 150
const GOAL_SHOW_MS = 2500
const VEL_SMOOTH = 0.3 // 내 걷는 속도를 매 프레임 얼마나 새 값 쪽으로 (튐 줄이기)

type Msg = BallState & { owner: string; goal?: Goal }

export function SoccerBall({ pitch, size, obstacles, posRef }: { pitch: Pitch; size: { w: number; d: number }; obstacles: Box[]; posRef: RefObject<{ x: number; z: number }> }) {
  const [me] = useState(() => Math.random().toString(36).slice(2)) // 이 탭 구분 (주인 표시용)
  const world = useMemo<BallWorld>(() => ({ half: { w: size.w / 2 - 0.3, d: size.d / 2 - 0.3 }, boxes: obstacles, pitch }), [size, obstacles, pitch])
  const ball = useRef<BallState>({ x: pitch.x, z: pitch.z, vx: 0, vz: 0 })
  const owner = useRef<string | null>(null)
  const known = useRef(false) // 공 상태를 아는지 (need 에 답할 수 있는지)
  const lastSent = useRef(0)
  const lastKick = useRef(0)
  const prevPos = useRef<{ x: number; z: number } | null>(null)
  const vel = useRef({ x: 0, z: 0 })
  const mesh = useRef<THREE.Mesh>(null)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const outSince = useRef<number | null>(null) // 축구장 밖으로 나간 시각
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.6 }), [])

  const send = (extra: Partial<Msg> = {}) => {
    lastSent.current = performance.now()
    void channel.current?.send({ type: 'broadcast', event: 'ball', payload: { ...ball.current, owner: owner.current ?? me, ...extra } })
  }
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })

  // 골: 골대 위에 잠깐 띄우고, 주인이면 공을 가운데로 돌려놓음
  const showGoal = (side: Goal, mine: boolean) => {
    setGoal(side)
    window.setTimeout(() => {
      setGoal(null)
      if (mine && owner.current === me) {
        ball.current = { x: pitch.x, z: pitch.z, vx: 0, vz: 0 }
        sendRef.current()
      }
    }, GOAL_SHOW_MS)
  }
  const showGoalRef = useRef(showGoal)
  useEffect(() => {
    showGoalRef.current = showGoal
  })

  useEffect(() => {
    const ch = supabase.channel(BALL_CHANNEL, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'ball' }, ({ payload }) => {
      const m = payload as Msg
      if (typeof m?.x !== 'number' || typeof m.vx !== 'number') return
      ball.current = { x: m.x, z: m.z, vx: m.vx, vz: m.vz }
      owner.current = m.owner
      known.current = true
      if (m.goal) showGoalRef.current(m.goal, false)
    })
      .on('broadcast', { event: 'need' }, () => {
        if (known.current) sendRef.current()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.send({ type: 'broadcast', event: 'need', payload: {} })
      })
    channel.current = ch
    return () => {
      channel.current = null
      void supabase.removeChannel(ch)
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now()
    // 내 걷는 속도 (위치 변화로)
    const p = posRef.current
    if (p && prevPos.current && dt > 0) {
      const vx = (p.x - prevPos.current.x) / dt
      const vz = (p.z - prevPos.current.z) / dt
      vel.current = { x: vel.current.x + (vx - vel.current.x) * VEL_SMOOTH, z: vel.current.z + (vz - vel.current.z) * VEL_SMOOTH }
    }
    if (p) prevPos.current = { x: p.x, z: p.z }
    // 차기 / 닿아 있으면 밀어내기
    if (p && now - lastKick.current > BALL.cooldown * 1000) {
      const kicked = kickBall(ball.current, p, vel.current)
      const pushed = kicked ? null : nudgeBall(ball.current, p)
      if (kicked || (pushed && pushed !== ball.current)) {
        ball.current = kicked ?? pushed!
        owner.current = me
        known.current = true
        lastKick.current = now
        sendRef.current()
      }
    }
    // 굴리기
    const moving = ball.current.vx !== 0 || ball.current.vz !== 0
    const r = stepBall(ball.current, dt, world)
    const dx = r.ball.x - ball.current.x
    const dz = r.ball.z - ball.current.z
    ball.current = r.ball
    // 축구장 밖에 오래 있으면 가운데 점으로 (골이 난 뒤 돌아오는 중이면 그대로)
    if (!goal && outOfPitch(ball.current, pitch)) {
      outSince.current ??= now
      const wait = owner.current === me ? BALL.outReturnMs : BALL.outReturnMs * 2
      if (now - outSince.current > wait) {
        outSince.current = null
        ball.current = { x: pitch.x, z: pitch.z, vx: 0, vz: 0 }
        owner.current = me
        known.current = true
        sendRef.current()
      }
    } else outSince.current = null
    if (owner.current === me) {
      if (r.goal) {
        sendRef.current({ goal: r.goal })
        showGoalRef.current(r.goal, true)
      } else if (moving && (now - lastSent.current > SEND_MS || (r.ball.vx === 0 && r.ball.vz === 0))) sendRef.current()
    }
    // 공 모양: 자리 + 구르는 회전
    const m = mesh.current
    if (m) {
      m.position.set(ball.current.x, BALL.r, ball.current.z)
      const dist = Math.hypot(dx, dz)
      if (dist > 0) m.rotateOnWorldAxis(new THREE.Vector3(dz / dist, 0, -dx / dist), dist / BALL.r)
    }
  })

  const goalZ = goal ? pitch.z + ((goal === 'north' ? -1 : 1) * pitch.d) / 2 : 0
  return (
    <>
      <mesh ref={mesh} material={material} castShadow position={[pitch.x, BALL.r, pitch.z]}>
        <sphereGeometry args={[BALL.r, 24, 16]} />
      </mesh>
      {goal && (
        <Billboard position={[pitch.x, 3.2, goalZ]}>
          <mesh>
            <planeGeometry args={[2.4, (2.4 * LABEL_PX.h) / LABEL_PX.w]} />
            <meshBasicMaterial map={labelTexture('⚽ 골!', '#d9353a')} transparent />
          </mesh>
        </Billboard>
      )}
    </>
  )
}
