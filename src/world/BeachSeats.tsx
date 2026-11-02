// 비치체어와 파라솔 (자리 계산은 beachLogic). 모양은 하나를 인스턴스로 그립니다(성능).
// 앉기·공부는 WorldScene 의 벤치 공부와 같습니다. 비치체어 앞은 -z(바다) 쪽.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BENCH_SEAT_BASE } from './worldLogic'
import { PARASOL, beachSeats, parasolSpots } from './beachLogic'
import type { BeachSpec } from './beachLogic'
import { MAT } from './worldMaterials'

const CHAIR = {
  w: 0.56,
  seat: { z0: -0.62, z1: 0.08, y: 0.27 }, // 눕는 다리 쪽 천: 앞뒤, 높이
  back: { z1: 0.62, y1: 0.86 }, // 등받이 끝
  t: 0.03, // 천 두께
  frame: 0.035, // 틀 굵기
}
const FABRIC = ['#e8604c', '#f2b84b', '#3f9fb5', '#f5efe0'] // 줄마다 번갈아 쓰는 천 색
const PARASOL_COLOR = ['#e8604c', '#2f8fb5', '#f2b84b', '#3fa98a']
const STRIPES = 8 // 파라솔 천 조각 수
const BULBS = 6 // 파라솔 끝 전구 수
const BULB_R = 0.035

// 두 점을 잇는 막대·판
function bar(a: THREE.Vector3, b: THREE.Vector3, w: number, t: number) {
  const len = a.distanceTo(b)
  const g = new THREE.BoxGeometry(w, t, len)
  const o = new THREE.Object3D()
  o.position.copy(a).add(b).multiplyScalar(0.5)
  o.lookAt(b)
  o.updateMatrix()
  g.applyMatrix4(o.matrix)
  return g.toNonIndexed()
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function chairShapes() {
  const { seat: S, back: B, w, t, frame: F } = CHAIR
  const fabric = mergeGeometries([bar(V(0, S.y, S.z0), V(0, S.y, S.z1), w, t), bar(V(0, S.y, S.z1), V(0, B.y1, B.z1), w, t)])!
  const rails = [-1, 1].flatMap((sx) => {
    const x = (sx * (w + F)) / 2
    return [
      bar(V(x, S.y - t, S.z0), V(x, S.y - t, S.z1), F, F),
      bar(V(x, S.y - t, S.z1), V(x, B.y1, B.z1), F, F),
      bar(V(x, 0, S.z0 + 0.04), V(x, S.y - t, S.z0 + 0.04), F, F),
      bar(V(x, 0, S.z1 + 0.05), V(x, S.y - t, S.z1), F, F),
      bar(V(x, 0, B.z1 - 0.02), V(x, (S.y + B.y1) / 2, (S.z1 + B.z1) / 2 + 0.02), F, F),
    ]
  })
  return { fabric, frame: mergeGeometries(rails)! }
}

// 파라솔 천: 조각마다 밝고 어두운 색이 번갈아 드는 원뿔. 인스턴스 색이 곱해져 줄무늬가 됨
function canopyShape() {
  const g = new THREE.ConeGeometry(PARASOL.r, PARASOL.poleY - PARASOL.rimY, STRIPES * 2, 1, true).toNonIndexed()
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  const tri = 3 // 조각 하나의 삼각형 정점 수
  for (let i = 0; i < n; i++) {
    const v = Math.floor(i / tri) % 2 === 0 ? 1 : 0.28
    col.fill(v, i * 3, i * 3 + 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.translate(0, (PARASOL.poleY + PARASOL.rimY) / 2, 0)
  g.computeVertexNormals()
  return g
}

const fabricMat = new THREE.MeshStandardMaterial({ roughness: 0.9 })
const frameMat = new THREE.MeshStandardMaterial({ color: '#b98b5b', roughness: 0.7 })
const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
const poleMat = new THREE.MeshStandardMaterial({ color: '#e9e2d3', roughness: 0.6 })

// at: 인스턴스마다 자리, colors: 인스턴스 색 (없으면 그대로)
function Instanced({ geo, mat, at, colors }: { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4[]; colors?: string[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    at.forEach((x, i) => m.setMatrixAt(i, x))
    m.instanceMatrix.needsUpdate = true
    if (colors) {
      const c = new THREE.Color()
      colors.forEach((hex, i) => m.setColorAt(i, c.set(hex)))
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [at, colors])
  return <instancedMesh key={at.length} ref={ref} args={[geo, mat, at.length]} frustumCulled={false} />
}

export function BeachSeats({ beach }: { beach: BeachSpec }) {
  const shapes = useMemo(() => ({ ...chairShapes(), canopy: canopyShape(), pole: new THREE.CylinderGeometry(PARASOL.pole / 2, PARASOL.pole / 2, PARASOL.poleY, 8), bulb: new THREE.SphereGeometry(BULB_R, 8, 6) }), [])
  useEffect(() => () => Object.values(shapes).forEach((g) => g.dispose()), [shapes])
  const data = useMemo(() => {
    const seats = beachSeats(beach, BENCH_SEAT_BASE)
    const paras = parasolSpots(beach)
    const m = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)
    const bulbs: THREE.Matrix4[] = []
    for (const p of paras) {
      for (let i = 0; i < BULBS; i++) {
        const a = (i / BULBS) * Math.PI * 2
        bulbs.push(m(p.x + Math.sin(a) * PARASOL.r * 0.97, PARASOL.rimY - 0.04, p.z + Math.cos(a) * PARASOL.r * 0.97))
      }
    }
    return {
      chairs: seats.map((s) => m(s.x, 0, s.z)),
      fabric: seats.map((_, i) => FABRIC[Math.floor(i / 2) % FABRIC.length]),
      canopy: paras.map((p) => m(p.x, 0, p.z)),
      canopyColor: paras.map((_, i) => PARASOL_COLOR[i % PARASOL_COLOR.length]),
      pole: paras.map((p) => m(p.x, PARASOL.poleY / 2, p.z)),
      bulbs,
    }
  }, [beach])
  return (
    <group>
      <Instanced geo={shapes.fabric} mat={fabricMat} at={data.chairs} colors={data.fabric} />
      <Instanced geo={shapes.frame} mat={frameMat} at={data.chairs} />
      <Instanced geo={shapes.canopy} mat={canopyMat} at={data.canopy} colors={data.canopyColor} />
      <Instanced geo={shapes.pole} mat={poleMat} at={data.pole} />
      {/* 밤에 켜지는 전구: 캠리단길 줄 전구와 같은 재질이라 같이 켜지고 꺼짐 */}
      <Instanced geo={shapes.bulb} mat={MAT.bulb} at={data.bulbs} />
    </group>
  )
}
