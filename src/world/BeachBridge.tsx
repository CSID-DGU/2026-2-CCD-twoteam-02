// 바다 건너 멀리 보이는 흰 현수교 (사진 참고 IMG_4667): 큰 탑 두 개, 트러스 상판, 주탑을 잇는 큰 줄과 세로 줄, 물 위 받침.
// 건너편 풍경이라 부딪힘은 없습니다. 많은 막대는 인스턴스로 그리고(성능), 밤에는 재질만 빛납니다(실시간 빛 없음).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { nightGlow } from './worldMaterials'

const B = {
  z: -300, // 다리 위치 (바다 쪽, 해변에서 먼 곳)
  half: 520, // 양쪽 끝 (수평선 너머까지 이어져 보이게)
  towerX: 175, // 탑 자리
  towerH: 86, // 탑 높이 (물에서)
  towerW: 12, // 탑 두 다리 사이
  leg: 3.4, // 탑 다리 굵기
  beams: [38, 62, 84], // 탑 가로보 높이
  deckY: 30, // 상판 높이
  deckW: 16, deckH: 1.4, // 상판 폭·두께
  trussH: 5, trussStep: 9, trussBar: 0.45, // 상판 아래 트러스
  cableR: 0.5, cableSag: 8, // 큰 줄 굵기, 가운데 상판 위로 남는 높이
  hanger: 12, hangerR: 0.14, // 세로 줄 간격, 굵기
  sideEnd: 0.92, // 옆 경간에서 큰 줄이 상판까지 내려오는 자리 (half 의 비율)
  pier: { w: 30, h: 3, d: 22 }, // 물 위 받침
  glowDay: 0, glowNight: 1.15, // 밤 불빛 세기
}

const whiteMat = new THREE.MeshStandardMaterial({ color: '#f3f5f4', roughness: 0.55, emissive: '#bcd4ff', emissiveIntensity: B.glowDay })
const cableMat = new THREE.MeshStandardMaterial({ color: '#eef1f0', roughness: 0.5, emissive: '#ffe2a8', emissiveIntensity: B.glowDay })

// 탑 사이 x 에서 큰 줄 높이: 가운데 경간은 포물선으로 처지고, 옆 경간은 끝으로 곧게 내려감
function cableY(x: number) {
  const ax = Math.abs(x)
  const low = B.deckY + B.cableSag
  if (ax <= B.towerX) return low + (B.towerH - low) * (ax / B.towerX) ** 2
  const t = Math.min(1, (ax - B.towerX) / (B.half * B.sideEnd - B.towerX))
  return B.towerH + (B.deckY - B.towerH) * t
}

export function BeachBridge() {
  const hangers = useRef<THREE.InstancedMesh>(null)
  const truss = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const xs: number[] = []
    for (let x = -B.half * B.sideEnd; x <= B.half * B.sideEnd; x += B.hanger) {
      if (Math.abs(Math.abs(x) - B.towerX) > B.hanger / 2) xs.push(x)
    }
    const cables = [-1, 1].map((sz) => {
      const pts: THREE.Vector3[] = []
      for (let x = -B.half * B.sideEnd; x <= B.half * B.sideEnd + 0.01; x += B.hanger) pts.push(new THREE.Vector3(x, cableY(x), sz * B.deckW * 0.5))
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, B.cableR, 5, false)
    })
    const bars = Math.floor((B.half * 2) / B.trussStep)
    return { xs, cables, bars }
  }, [])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const hm = hangers.current
    if (hm) {
      let i = 0
      for (const sz of [-1, 1]) {
        for (const x of data.xs) {
          const top = cableY(x)
          o.position.set(x, (top + B.deckY) / 2, sz * B.deckW * 0.5)
          o.scale.set(1, top - B.deckY, 1)
          o.rotation.set(0, 0, 0)
          o.updateMatrix()
          hm.setMatrixAt(i++, o.matrix)
        }
      }
      hm.instanceMatrix.needsUpdate = true
    }
    const tm = truss.current
    if (tm) {
      const len = Math.hypot(B.trussStep, B.trussH)
      const ang = Math.atan2(B.trussStep, B.trussH)
      for (let i = 0; i < data.bars; i++) {
        const x = -B.half + (i + 0.5) * B.trussStep
        o.position.set(x, B.deckY - B.deckH / 2 - B.trussH / 2, B.deckW / 2)
        o.rotation.set(0, 0, i % 2 ? ang : -ang)
        o.scale.set(1, len, 1)
        o.updateMatrix()
        tm.setMatrixAt(i, o.matrix)
      }
      tm.instanceMatrix.needsUpdate = true
    }
  }, [data])
  useLayoutEffect(() => () => data.cables.forEach((g) => g.dispose()), [data])
  useFrame(() => {
    const g = Math.min(1, nightGlow())
    whiteMat.emissiveIntensity = B.glowDay + (B.glowNight * 0.28 - B.glowDay) * g
    cableMat.emissiveIntensity = B.glowDay + (B.glowNight - B.glowDay) * g
  })
  const hangerCount = data.xs.length * 2
  return (
    <group position={[0, 0, B.z]}>
      {/* 상판과 아래 가로대 */}
      <mesh position-y={B.deckY} material={whiteMat}>
        <boxGeometry args={[B.half * 2, B.deckH, B.deckW]} />
      </mesh>
      <mesh position={[0, B.deckY - B.deckH / 2 - B.trussH, B.deckW / 2]} material={whiteMat}>
        <boxGeometry args={[B.half * 2, B.trussBar, B.trussBar]} />
      </mesh>
      <instancedMesh key={`t${data.bars}`} ref={truss} args={[undefined, whiteMat, data.bars]} frustumCulled={false}>
        <boxGeometry args={[B.trussBar, 1, B.trussBar]} />
      </instancedMesh>
      {/* 탑: 두 다리 + 가로보 + 물 위 받침 */}
      {[-B.towerX, B.towerX].map((x) => (
        <group key={x} position-x={x}>
          {[-1, 1].map((sz) => (
            <mesh key={sz} position={[0, B.towerH / 2, (sz * B.towerW) / 2]} material={whiteMat}>
              <boxGeometry args={[B.leg, B.towerH, B.leg]} />
            </mesh>
          ))}
          {B.beams.map((y) => (
            <mesh key={y} position-y={y} material={whiteMat}>
              <boxGeometry args={[B.leg * 0.8, 2.2, B.towerW]} />
            </mesh>
          ))}
          <mesh position-y={B.pier.h / 2} material={whiteMat}>
            <boxGeometry args={[B.pier.w, B.pier.h, B.pier.d]} />
          </mesh>
        </group>
      ))}
      {/* 큰 줄과 세로 줄 */}
      {data.cables.map((g, i) => (
        <mesh key={i} geometry={g} material={cableMat} />
      ))}
      <instancedMesh key={`h${hangerCount}`} ref={hangers} args={[undefined, cableMat, hangerCount]} frustumCulled={false}>
        <cylinderGeometry args={[B.hangerR, B.hangerR, 1, 4]} />
      </instancedMesh>
    </group>
  )
}
