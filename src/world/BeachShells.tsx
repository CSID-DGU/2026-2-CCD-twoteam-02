// 해변 바닥 소품: 산책로 가장자리 작은 원통 말뚝과 모래 위 조개껍질. 자리는 beachLogic, 많아서 인스턴스로 그립니다.
// 둘 다 낮게 깔려 걸어 지나갈 수 있습니다(부딪힘 없음).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { POST, boardwalkPosts, shellSpots } from './beachLogic'
import type { BeachSpec, ShellSpot } from './beachLogic'

const SHELL_COUNT = 170
const TINTS = ['#fff4e6', '#f6cfc0', '#e9dcc4', '#d9c2d8'] // 크림, 분홍, 모래, 연보라
const SCALLOP = { r: 0.11, ribs: 9, rings: 4, spread: 2.4, dome: 0.045, ribH: 0.006 } // 부채꼴 조개: 크기, 골 수, 펼침 각도(라디안), 볼록함
const CONCH = { r: 0.04, h: 0.16, turns: 3 } // 소라: 크기, 감긴 수

const postMat = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.9 })
const shellMat = new THREE.MeshStandardMaterial({ roughness: 0.55 })

// 부채꼴 조개: 경첩에서 펼쳐지는 볼록한 판에 골이 파임
function scallopGeometry() {
  const { r, ribs, rings, spread, dome, ribH } = SCALLOP
  const segs = ribs * 4
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    for (let j = 0; j <= segs; j++) {
      const a = -spread / 2 + (j / segs) * spread
      const edge = 1 + 0.05 * Math.cos((j / segs) * ribs * Math.PI * 2) // 끝이 물결
      const rr = r * t * edge
      const y = Math.sin(t * Math.PI * 0.85) * dome * Math.cos(a * 0.6) + Math.cos((j / segs) * ribs * Math.PI * 2) * ribH * t
      pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr)
    }
  }
  const row = segs + 1
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// 소라: 끝으로 갈수록 가늘어지는 나선 관을 옆으로 눕힘
function conchGeometry() {
  const { r, h, turns } = CONCH
  const pts: THREE.Vector3[] = []
  const n = 20
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = t * turns * Math.PI * 2
    const rr = r * (1 - t * 0.85)
    pts.push(new THREE.Vector3(Math.cos(a) * rr, r * 0.9 + Math.sin(a) * rr, t * h - h / 2))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, r * 0.42, 6, false)
}

function Shells({ spots, geo }: { spots: ShellSpot[]; geo: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    spots.forEach((s, i) => {
      o.position.set(s.x, 0.02, s.z)
      o.rotation.y = s.rot
      o.scale.setScalar(s.scale)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c.set(TINTS[s.tint % TINTS.length]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [spots])
  return <instancedMesh key={spots.length} ref={ref} args={[geo, shellMat, spots.length]} frustumCulled={false} />
}

export function BeachShells({ beach, size }: { beach: BeachSpec; size: { w: number; d: number } }) {
  const postRef = useRef<THREE.InstancedMesh>(null)
  const posts = useMemo(() => boardwalkPosts(size), [size])
  const spots = useMemo(() => shellSpots(beach, size, SHELL_COUNT), [beach, size])
  const geos = useMemo(() => ({ scallop: scallopGeometry(), conch: conchGeometry(), post: new THREE.CylinderGeometry(POST.r, POST.r * 1.15, POST.h, 8) }), [])
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])
  useLayoutEffect(() => {
    const m = postRef.current
    if (!m) return
    const o = new THREE.Object3D()
    posts.forEach((p, i) => {
      o.position.set(p.x, POST.h / 2, p.z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [posts])
  const fans = useMemo(() => spots.filter((s) => s.kind === 0), [spots])
  const conches = useMemo(() => spots.filter((s) => s.kind === 1), [spots])
  return (
    <group>
      <instancedMesh key={posts.length} ref={postRef} args={[geos.post, postMat, posts.length]} frustumCulled={false} />
      <Shells spots={fans} geo={geos.scallop} />
      <Shells spots={conches} geo={geos.conch} />
    </group>
  )
}
