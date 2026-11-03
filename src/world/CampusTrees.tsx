// 캠퍼스 느티나무 (사용자 요청): 굵은 줄기가 위로 갈라져 넓은 부채꼴 머리를 이룸. 밝은 연두색 잎 덩어리.
// 가볍게: 줄기·가지·잎 덩어리를 각각 InstancedMesh 한 번으로 그립니다. 부딪힘은 원래 나무와 같은 trees 자리(줄기).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import type { Point } from './worldLogic'
import { nightGlow, plantMat } from './worldMaterials'
import { cherryShape } from './lanternShape'
import type { Card } from './lanternShape'
import { barkTexture, limbTube } from './barkShapes'

const TRUNK = { h: 3.1, r0: 0.3, r1: 0.2, color: '#6b5a4a' }
const BRANCH = { count: 5, h: 2.5, r: 0.09, tilt: 0.62 } // 줄기 끝에서 벌어지는 가지
const LEAF = { top: 5.7, spread: 2.7, blobs: 11, colors: ['#8cc768', '#79b95a', '#a0d27a', '#6aac52'] }

function rnd(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// 잎 덩어리: 풀 재질(plantMat)이 정점색을 곱하므로 흰 정점색을 넣음 (없으면 까맣게 나옴). 색은 나무별 instanceColor
function leafBlob() {
  const g = new THREE.IcosahedronGeometry(1, 1)
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3))
  return g
}

export function ZelkovaTrees({ trees }: { trees: Point[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const branches = useRef<THREE.InstancedMesh>(null)
  const leaves = useRef<THREE.InstancedMesh>(null)
  const leafMat = useMemo(() => plantMat('#ffffff', false), [])
  const blob = useMemo(() => leafBlob(), [])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    trees.forEach((t, i) => {
      const r = rnd(i * 97 + 11)
      const size = 0.9 + r() * 0.3
      const turn = r() * Math.PI * 2
      o.position.set(t.x, (TRUNK.h * size) / 2, t.z)
      o.rotation.set(0, turn, 0)
      o.scale.setScalar(size)
      o.updateMatrix()
      trunks.current?.setMatrixAt(i, o.matrix)
      for (let b = 0; b < BRANCH.count; b++) {
        const a = turn + (b / BRANCH.count) * Math.PI * 2
        const lean = BRANCH.tilt
        const baseY = TRUNK.h * size * 0.92
        const half = (BRANCH.h * size) / 2
        o.position.set(t.x + Math.sin(a) * Math.sin(lean) * half, baseY + Math.cos(lean) * half, t.z + Math.cos(a) * Math.sin(lean) * half)
        o.rotation.set(lean * Math.cos(a), 0, -lean * Math.sin(a))
        o.scale.setScalar(size)
        o.updateMatrix()
        branches.current?.setMatrixAt(i * BRANCH.count + b, o.matrix)
      }
      for (let k = 0; k < LEAF.blobs; k++) {
        const a = turn + k * 2.399
        const rad = (k === 0 ? 0 : 0.45 + r() * 0.55) * LEAF.spread * size // 넓은 부채꼴: 가운데는 높고 둘레는 낮게
        const y = (LEAF.top - (rad / (LEAF.spread * size)) * 1.3 + r() * 0.35) * size
        o.position.set(t.x + Math.sin(a) * rad, y, t.z + Math.cos(a) * rad)
        o.rotation.set(r() * 3, r() * 3, r() * 3)
        const s = (0.95 + r() * 0.65) * size
        o.scale.set(s, s * 0.72, s)
        o.updateMatrix()
        const n = i * LEAF.blobs + k
        leaves.current?.setMatrixAt(n, o.matrix)
        leaves.current?.setColorAt(n, col.set(LEAF.colors[Math.floor(r() * LEAF.colors.length)]))
      }
    })
    for (const m of [trunks.current, branches.current, leaves.current]) if (m) m.instanceMatrix.needsUpdate = true
    if (leaves.current?.instanceColor) leaves.current.instanceColor.needsUpdate = true
  }, [trees])
  if (trees.length === 0) return null
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} frustumCulled={false}>
        <cylinderGeometry args={[TRUNK.r1, TRUNK.r0, TRUNK.h, 8]} />
        <meshStandardMaterial color={TRUNK.color} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={branches} args={[undefined, undefined, trees.length * BRANCH.count]} frustumCulled={false}>
        <cylinderGeometry args={[BRANCH.r * 0.6, BRANCH.r, BRANCH.h, 6]} />
        <meshStandardMaterial color={TRUNK.color} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[blob, leafMat, trees.length * LEAF.blobs]} frustumCulled={false} />
    </group>
  )
}

// ── 벚나무 ──────────────────────────────────────────────
const CHERRY = { bark: '#6b4f43', barkNight: '#7a5a4c', barkGlow: 0.45, tones: ['#ffd9e4', '#ffc4d6', '#fbe3ea', '#f9b4cb'], glowNight: 0.22, petals: 45, petalR: 3, petalSize: 0.055 }

// 꽃 뭉치 그림: 투명한 바탕에 다섯 잎 꽃을 빽빽이, 꽃마다 진한 가운데와 잎 결 (색은 나무별 instanceColor 와 곱함)
let blossomTex: THREE.CanvasTexture | null = null
function blossomTexture() {
  if (blossomTex) return blossomTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = rnd(77)
  for (let i = 0; i < 120; i++) {
    const d = Math.sqrt(r()) * S * 0.46 // 둥근 뭉치 안에
    const a = r() * Math.PI * 2
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d
    const size = 7 + r() * 6
    const tone = 225 + r() * 30
    g.save()
    g.translate(x, y)
    g.rotate(r() * Math.PI)
    for (let p = 0; p < 5; p++) {
      g.rotate((Math.PI * 2) / 5)
      g.fillStyle = `rgb(255,${tone},${tone})`
      g.beginPath()
      g.ellipse(0, -size * 0.62, size * 0.42, size * 0.62, 0, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(200,110,140,0.35)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(0, -size * 0.2)
      g.lineTo(0, -size)
      g.stroke()
    }
    g.fillStyle = '#c9536f'
    g.beginPath()
    g.arc(0, 0, size * 0.17, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  blossomTex = new THREE.CanvasTexture(c)
  blossomTex.colorSpace = THREE.SRGBColorSpace
  blossomTex.anisotropy = 4
  return blossomTex
}
let blossomMaterial: THREE.MeshStandardMaterial | null = null
const blossomMat = () => (blossomMaterial ??= new THREE.MeshStandardMaterial({ map: blossomTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: '#ffc6d6', emissiveMap: blossomTexture(), emissiveIntensity: 0 }))
let cherryBarkMaterial: THREE.MeshStandardMaterial | null = null
function cherryBarkMat() {
  if (!cherryBarkMaterial) {
    const t = barkTexture()
    cherryBarkMaterial = new THREE.MeshStandardMaterial({ color: CHERRY.bark, map: t, bumpMap: t, bumpScale: 4, roughness: 0.9, emissive: CHERRY.barkNight, emissiveMap: t, emissiveIntensity: 0 })
  }
  return cherryBarkMaterial
}

// 연두 잎 뭉치 그림 (벚나무 모양에 잎만 다른 나무, 입구 두 그루)
const FRESH_TONES = ['#a8d86a', '#96cc5c', '#b9e27c', '#86bf52']
let leafTex: THREE.CanvasTexture | null = null
function freshLeafTexture() {
  if (leafTex) return leafTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = rnd(83)
  for (let i = 0; i < 110; i++) {
    const d = Math.sqrt(r()) * S * 0.45
    const a = r() * Math.PI * 2
    const size = 11 + r() * 8
    const tone = Math.round(205 + r() * 50)
    g.save()
    g.translate(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d)
    g.rotate(r() * Math.PI * 2)
    g.fillStyle = `rgb(${tone},${tone},${tone})`
    g.beginPath()
    g.moveTo(0, -size)
    g.quadraticCurveTo(size * 0.55, 0, 0, size)
    g.quadraticCurveTo(-size * 0.55, 0, 0, -size)
    g.fill()
    g.strokeStyle = 'rgba(70,110,40,0.5)' // 잎맥
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, -size)
    g.lineTo(0, size)
    g.stroke()
    g.restore()
  }
  leafTex = new THREE.CanvasTexture(c)
  leafTex.colorSpace = THREE.SRGBColorSpace
  leafTex.anisotropy = 4
  return leafTex
}
let freshLeafMaterial: THREE.MeshStandardMaterial | null = null
const freshLeafMat = () => (freshLeafMaterial ??= new THREE.MeshStandardMaterial({ map: freshLeafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, emissive: '#b9e27c', emissiveMap: freshLeafTexture(), emissiveIntensity: 0 }))

// 가지는 모두 합쳐 한 번에, 꽃 뭉치·떨어진 꽃잎은 InstancedMesh 로 각각 한 번에 그립니다
// fresh: 꽃 대신 연두 잎 (떨어진 꽃잎 없음)
export function CherryTrees({ trees, fresh = false }: { trees: Point[]; fresh?: boolean }) {
  const data = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const cards: (Card & { tx: number; tz: number })[] = []
    trees.forEach((t, i) => {
      const s = cherryShape(i * 31 + (fresh ? 11 : 3))
      for (const [k, l] of s.limbs.entries()) parts.push(limbTube(l, k === 0 ? 14 : 7, k === 0 ? 0.3 : 0).translate(t.x, 0, t.z))
      for (const c of s.cards) cards.push({ ...c, tx: t.x, tz: t.z })
    })
    return { wood: parts.length ? mergeGeometries(parts) : null, cards }
  }, [trees, fresh])
  useEffect(() => () => data.wood?.dispose(), [data])
  const flowers = useRef<THREE.InstancedMesh>(null)
  const petals = useRef<THREE.InstancedMesh>(null)
  const petalCount = fresh ? 0 : trees.length * CHERRY.petals
  const tones = fresh ? FRESH_TONES : CHERRY.tones
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    data.cards.forEach((c, i) => {
      o.position.set(c.tx + c.x, c.y, c.tz + c.z)
      o.rotation.set(c.rx, c.ry, c.rz)
      o.scale.setScalar(c.s)
      o.updateMatrix()
      flowers.current?.setMatrixAt(i, o.matrix)
      flowers.current?.setColorAt(i, col.set(tones[c.tone]))
    })
    const r = rnd(19)
    if (!fresh) trees.forEach((t, i) => {
      for (let k = 0; k < CHERRY.petals; k++) {
        const a = r() * Math.PI * 2
        const d = Math.sqrt(r()) * CHERRY.petalR
        o.position.set(t.x + Math.sin(a) * d, 0.05, t.z + Math.cos(a) * d)
        o.rotation.set(-Math.PI / 2, 0, r() * 6)
        o.scale.set(CHERRY.petalSize, CHERRY.petalSize * 0.7, 1)
        o.updateMatrix()
        petals.current?.setMatrixAt(i * CHERRY.petals + k, o.matrix)
      }
    })
    for (const m of [flowers.current, petals.current]) if (m) m.instanceMatrix.needsUpdate = true
    if (flowers.current?.instanceColor) flowers.current.instanceColor.needsUpdate = true
  }, [data, trees, fresh, tones])
  useFrame(() => {
    const leafy = fresh ? freshLeafMat() : blossomMat()
    leafy.emissiveIntensity = CHERRY.glowNight * nightGlow() // 밤에 까맣지 않게
    cherryBarkMat().emissiveIntensity = CHERRY.barkGlow * nightGlow()
  })
  if (!data.wood) return null
  return (
    <group>
      <mesh geometry={data.wood} material={cherryBarkMat()} />
      <instancedMesh ref={flowers} args={[undefined, fresh ? freshLeafMat() : blossomMat(), data.cards.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      {petalCount > 0 && (
        <instancedMesh ref={petals} args={[undefined, undefined, petalCount]} frustumCulled={false}>
          <circleGeometry args={[1, 6]} />
          <meshStandardMaterial color={CHERRY.tones[1]} roughness={0.9} />
        </instancedMesh>
      )}
    </group>
  )
}

// 캠퍼스 나무: 종류별로 나눠 그림 (느티나무·벚나무)
export function CampusTrees({ trees }: { trees: (Point & { kind?: 'cherry' | 'fresh' })[] }) {
  const zelkova = useMemo(() => trees.filter((t) => !t.kind), [trees])
  const cherry = useMemo(() => trees.filter((t) => t.kind === 'cherry'), [trees])
  const fresh = useMemo(() => trees.filter((t) => t.kind === 'fresh'), [trees])
  return (
    <>
      <ZelkovaTrees trees={zelkova} />
      <CherryTrees trees={cherry} />
      <CherryTrees trees={fresh} fresh />
    </>
  )
}
