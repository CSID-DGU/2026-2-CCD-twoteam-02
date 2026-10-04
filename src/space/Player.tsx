import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import type { Box } from './layout'

const MODEL_URL = '/models/character-a.glb'
const R = 0.3 // 충돌 반경
const SPEED = 3 // 초당 이동 거리
const SCALE = 0.6 // 모델 키(약 2.7)를 공간 크기에 맞춥니다.
const TURN = 12 // 방향 전환 빠르기
const FADE = 0.15 // 서기 ↔ 걷기 전환 시간(초)
const MAX_DT = 0.05 // 탭을 잠깐 떠났다 돌아왔을 때 벽을 뚫지 않도록 한 프레임 이동량을 제한합니다.

const hit = (x: number, z: number, o: Box) =>
  Math.abs(x - o.x) < o.w / 2 + R && Math.abs(z - o.z) < o.d / 2 + R

export function Player({ obstacles, spawn }: { obstacles: Box[]; spawn: { x: number; z: number } }) {
  const ref = useRef<Group>(null!)
  const keys = useRef(new Set<string>())
  const moving = useRef(false)
  const { scene, animations } = useGLTF(MODEL_URL)
  // 트래킹 화면과 같은 모델을 쓰므로 복사본을 씁니다.
  const model = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    actions.idle?.play()
  }, [actions])

  useEffect(() => {
    const pressed = keys.current
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code.startsWith('Arrow')) e.preventDefault() // 방향키로 페이지가 스크롤되지 않게
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
    const ix = +(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))
    const iz = +(k.has('KeyS') || k.has('ArrowDown')) - +(k.has('KeyW') || k.has('ArrowUp'))
    const now = ix !== 0 || iz !== 0

    if (now !== moving.current) {
      moving.current = now
      actions[now ? 'idle' : 'walk']?.fadeOut(FADE)
      actions[now ? 'walk' : 'idle']?.reset().fadeIn(FADE).play()
    }
    if (!now) return

    // 대각선도 같은 속도가 되도록 방향을 정규화합니다.
    const step = (SPEED * dt) / Math.hypot(ix, iz)
    const dx = ix * step, dz = iz * step
    // 축별로 따로 판정해서 벽에 비스듬히 닿으면 미끄러지듯 움직입니다.
    if (!obstacles.some((o) => hit(p.x + dx, p.z, o))) p.x += dx
    if (!obstacles.some((o) => hit(p.x, p.z + dz, o))) p.z += dz

    // 가는 방향을 바라보도록 가까운 쪽으로 부드럽게 돕니다. (모델 정면은 +Z)
    const diff = Math.atan2(ix, iz) - g.rotation.y
    g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-TURN * dt))
  })

  return (
    <group ref={ref} position={[spawn.x, 0, spawn.z]}>
      <primitive object={model} scale={SCALE} />
    </group>
  )
}

useGLTF.preload(MODEL_URL)
