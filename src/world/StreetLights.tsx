// 캠리단길 밤 조명 (캠퍼스에는 없음)
//
//   StringLights  가로등 사이에 거는 전구 줄 (world.json 의 strings). 전구는 빛나는 재질만이라 가볍습니다(점광원 아님)
//   NightFill     밤에만 켜지는 따뜻한 채움광. 캠리단길 밤이 너무 어둡지 않게 거리 전체를 살짝 밝힘
// 줄·전구 자리는 streetLightLogic.ts (순수 로직)
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import type { PlazaLayout } from './worldLogic'
import { MAT, nightGlow } from './worldMaterials'
import { stringBulbs, wirePoint } from './streetLightLogic'
import type { Wire } from './streetLightLogic'

const WIRE = { r: 0.012, segments: 24 } // 줄 굵기(m), 줄 하나를 몇 마디로 휘게 그릴지
const BULB_R = 0.07
// 채움광: 하늘 쪽은 전구색, 땅 쪽은 돌바닥 반사 느낌. intensity × 밤 빛남
const FILL = { sky: '#ffd9a0', ground: '#6b5a48', intensity: 0.9 }

// 줄 전부를 튜브 하나로 합쳐 그립니다 (줄마다 물체를 만들지 않게)
function wireGeometry(wires: Wire[]) {
  const parts = wires.map((w) => {
    const pts = Array.from({ length: WIRE.segments + 1 }, (_, i) => {
      const p = wirePoint(w.from, w.to, i / WIRE.segments)
      return new THREE.Vector3(p.x, p.y, p.z)
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), WIRE.segments, WIRE.r, 4, false)
  })
  return parts
}

export function StringLights({ plaza }: { plaza: PlazaLayout }) {
  const wires = useMemo(() => plaza.strings ?? [], [plaza.strings])
  const tubes = useMemo(() => wireGeometry(wires), [wires])
  const bulbs = useMemo(() => stringBulbs(wires), [wires])
  if (wires.length === 0) return null
  return (
    <group>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={MAT.iron} />
      ))}
      <Instances limit={bulbs.length} material={MAT.bulb}>
        <sphereGeometry args={[BULB_R, 8, 6]} />
        {bulbs.map((p, i) => (
          <Instance key={i} position={[p.x, p.y - BULB_R, p.z]} />
        ))}
      </Instances>
    </group>
  )
}

export function NightFill() {
  const light = useRef<THREE.HemisphereLight>(null)
  useFrame(() => {
    if (light.current) light.current.intensity = FILL.intensity * nightGlow()
  })
  return <hemisphereLight ref={light} args={[FILL.sky, FILL.ground, 0]} />
}
