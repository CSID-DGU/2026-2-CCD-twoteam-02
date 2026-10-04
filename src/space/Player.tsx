import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import type { Box, Spot } from './layout'

const MODEL_URL = '/models/character-a.glb'
const R = 0.3 // 충돌 반경
const SPEED = 3 // 초당 이동 거리
const SCALE = 0.6 // 모델 키(약 2.7)를 공간 크기에 맞춥니다.
const TURN = 12 // 방향 전환 빠르기
const FADE = 0.15 // 동작 전환 시간(초)
const MAX_DT = 0.05 // 탭을 잠깐 떠났다 돌아왔을 때 벽을 뚫지 않도록 한 프레임 이동량을 제한합니다.
const SIT_RANGE = 0.9 // 의자에서 이 거리 안에 있으면 앉을 수 있습니다.
const SIT_KEY = 'KeyE'

const hit = (x: number, z: number, o: Box) =>
  Math.abs(x - o.x) < o.w / 2 + R && Math.abs(z - o.z) < o.d / 2 + R

type Props = {
  obstacles: Box[]
  spawn: { x: number; z: number }
  spots: Spot[]
  onNear: (no: number | null) => void // 앉을 수 있는 좌석이 바뀔 때
  onSeat: (no: number | null) => void // 앉거나 일어날 때
}

export function Player({ obstacles, spawn, spots, onNear, onSeat }: Props) {
  const ref = useRef<Group>(null!)
  const keys = useRef(new Set<string>())
  const toggle = useRef(false) // 앉기/일어나기 키가 눌렸는지
  const anim = useRef('idle')
  const near = useRef<Spot | null>(null)
  const seated = useRef<Spot | null>(null)
  const { scene, animations } = useGLTF(MODEL_URL)
  // 트래킹 화면과 같은 모델을 쓰므로 복사본을 씁니다.
  const model = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions[anim.current]?.play()
  }, [actions])

  useEffect(() => {
    const pressed = keys.current
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code.startsWith('Arrow')) e.preventDefault() // 방향키로 페이지가 스크롤되지 않게
      if (e.code === SIT_KEY && !e.repeat) toggle.current = true
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

    // 앉기/일어나기
    const wantToggle = toggle.current
    toggle.current = false
    if (seated.current) {
      if (!wantToggle) return
      seated.current = null
      g.visible = true
      onSeat(null)
      play('idle')
      return
    }
    if (wantToggle && near.current) {
      const s = near.current
      seated.current = s
      p.x = s.x
      p.z = s.z
      g.rotation.y = s.rot
      g.visible = false // 1인칭 시점에서는 내 캐릭터가 화면을 가리므로 숨깁니다.
      setNear(null)
      onSeat(s.no)
      play('sit')
      return
    }

    const ix = +(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))
    const iz = +(k.has('KeyS') || k.has('ArrowDown')) - +(k.has('KeyW') || k.has('ArrowUp'))
    const moving = ix !== 0 || iz !== 0
    play(moving ? 'walk' : 'idle')

    if (moving) {
      // 대각선도 같은 속도가 되도록 방향을 정규화합니다.
      const step = (SPEED * dt) / Math.hypot(ix, iz)
      const dx = ix * step, dz = iz * step
      // 축별로 따로 판정해서 벽에 비스듬히 닿으면 미끄러지듯 움직입니다.
      if (!obstacles.some((o) => hit(p.x + dx, p.z, o))) p.x += dx
      if (!obstacles.some((o) => hit(p.x, p.z + dz, o))) p.z += dz

      // 가는 방향을 바라보도록 가까운 쪽으로 부드럽게 돕니다. (모델 정면은 +Z)
      const diff = Math.atan2(ix, iz) - g.rotation.y
      g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-TURN * dt))
    }

    // 가장 가까운 의자를 찾아 앉을 수 있는지 알려 줍니다.
    let best: Spot | null = null, bestDist = SIT_RANGE
    for (const s of spots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < bestDist) { best = s; bestDist = d }
    }
    setNear(best)
  })

  return (
    <group ref={ref} position={[spawn.x, 0, spawn.z]}>
      <primitive object={model} scale={SCALE} />
    </group>
  )
}

useGLTF.preload(MODEL_URL)
