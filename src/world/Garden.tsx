// 캠리단길 정원: 잔디 위 풀 포기와 화단(관목·장미·라벤더·고사리·들꽃).
//
// 자리는 gardenLogic(막힌 곳을 피해 정해진 난수로), 모양은 plantShapes, 재질·바람은 worldMaterials.
// 종류마다 InstancedMesh 하나로 그려 풀 포기 2600개도 그리기 명령은 한 번입니다.
//   InstancedMesh: 같은 모양을 자리·크기·돌림만 바꿔 한 번에 여러 개 그리는 three 의 그물(mesh)
// 포기마다 색을 조금씩 달리(instanceColor) 해 한 덩어리처럼 보이지 않게 합니다. 캠퍼스에는 그리지 않습니다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { flowerBeds, grassTufts } from './gardenLogic'
import type { Plant, PlantKind, Tuft } from './gardenLogic'
import type { PlacedBuilding, PlazaLayout } from './worldLogic'
import { plantMat, tickWind } from './worldMaterials'
import { bushShape, daisyShape, fernShape, lavenderShape, roseShape, tuftShape } from './plantShapes'

// 종류별 모양·색조 (색조: 초록만 있는 모양은 재질 색이 초록, 꽃이 있는 모양은 흰색)
const KINDS: Record<PlantKind | 'tuft', { shape: () => THREE.BufferGeometry; tint: string; sway: boolean; jitter: number }> = {
  tuft: { shape: tuftShape, tint: '#6fa64f', sway: true, jitter: 0.18 },
  bush: { shape: bushShape, tint: '#4c8a45', sway: false, jitter: 0.15 },
  rose: { shape: roseShape, tint: '#ffffff', sway: false, jitter: 0.08 },
  lavender: { shape: lavenderShape, tint: '#ffffff', sway: true, jitter: 0.08 },
  fern: { shape: fernShape, tint: '#5f9e4a', sway: true, jitter: 0.15 },
  daisy: { shape: daisyShape, tint: '#ffffff', sway: true, jitter: 0.06 },
}

// 정해진 난수 (색 흔들기)
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 자리·크기·돌림과 색 차이를 InstancedMesh 에 채움 (3D 객체를 바꾸는 일은 컴포넌트 밖에서)
function fill(mesh: THREE.InstancedMesh, items: Tuft[], jitter: number) {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const c = new THREE.Color()
  const r = random(items.length * 7 + 3)
  items.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot)
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s))
    mesh.setMatrixAt(i, m)
    const k = 1 - jitter + r() * jitter * 2 // 밝기 차이
    c.setRGB(Math.min(1, k * (0.97 + r() * 0.06)), Math.min(1, k), Math.min(1, k * (0.9 + r() * 0.1)))
    mesh.setColorAt(i, c)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere() // 화면 밖 판단을 전체 자리에 맞춤 (안 하면 모양 하나 크기로 판단해 사라져 보임)
}

function Planted({ kind, items }: { kind: keyof typeof KINDS; items: Tuft[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const k = KINDS[kind]
  const geometry = useMemo(() => k.shape(), [k])
  const material = plantMat(k.tint, k.sway)
  useLayoutEffect(() => {
    if (ref.current) fill(ref.current, items, k.jitter)
  }, [items, k])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />
}

export function Garden({ plaza, buildings }: { plaza: PlazaLayout; buildings: PlacedBuilding[] }) {
  const tufts = useMemo(() => grassTufts(plaza, buildings), [plaza, buildings])
  const beds = useMemo(() => {
    const by: Record<PlantKind, Plant[]> = { bush: [], rose: [], lavender: [], fern: [], daisy: [] }
    for (const p of flowerBeds(plaza, buildings)) by[p.kind].push(p)
    return by
  }, [plaza, buildings])
  useFrame(({ clock }) => tickWind(clock.elapsedTime))
  if (plaza.ground === 'lawn') return null
  return (
    <group>
      <Planted kind="tuft" items={tufts} />
      {(Object.keys(beds) as PlantKind[]).map((kind) => (
        <Planted key={kind} kind={kind} items={beds[kind]} />
      ))}
    </group>
  )
}
