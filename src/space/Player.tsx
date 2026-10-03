import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'

type Box = { x: number; z: number; w: number; d: number }
const R = 0.3, SPEED = 3

const hit = (x: number, z: number, o: Box) =>
  Math.abs(x - o.x) < o.w / 2 + R && Math.abs(z - o.z) < o.d / 2 + R

export function Player({ obstacles, spawn }: { obstacles: Box[]; spawn: { x: number; z: number } }) {
  const ref = useRef<Mesh>(null!)
  const keys = useRef(new Set<string>())

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  useFrame((_, dt) => {
    const k = keys.current, p = ref.current.position
    const dx = (+(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))) * SPEED * dt
    const dz = (+(k.has('KeyS') || k.has('ArrowDown')) - +(k.has('KeyW') || k.has('ArrowUp'))) * SPEED * dt
    if (!obstacles.some((o) => hit(p.x + dx, p.z, o))) p.x += dx
    if (!obstacles.some((o) => hit(p.x, p.z + dz, o))) p.z += dz
  })

  return (
    <mesh ref={ref} position={[spawn.x, 0.8, spawn.z]}>
      <capsuleGeometry args={[R, 1, 4, 8]} />
      <meshStandardMaterial color="#3b82f6" />
    </mesh>
  )
}