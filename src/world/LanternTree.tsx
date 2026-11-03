// 캠퍼스 가운데 등불 나무 광장 (사용자 참고 사진): 뿌리가 넓은 굵은 나무에서 줄 조명이 길게 늘어지고 끝에 유리 등이 달립니다.
// 발밑과 빈백 자리는 잔디(낱장 풀잎)이고 줄기 둘레에 흰 꽃, 그 둘레에 보송보송한 빈백이 불규칙하게 흩어져 놓입니다.
// 빈백은 공부 자리입니다(자리 계산은 worldLogic.courtyardSeats, 앉기·공부는 WorldScene 의 벤치 공부와 같음).
// 나무 모양 계산은 lanternShape (Node 로 검사). 다른 소품처럼 그림 파일 없이 코드로 그립니다.
// 가볍게: 줄기·가지는 한 도형으로 합치고, 잎·꽃·유리 등은 InstancedMesh, 전구 빛은 Points 로 각각 한 번에 그립니다.
// 낮에는 은은하게, 밤에는 줄기가 따뜻하게 물들고 전구가 번져 빛납니다(nightGlow 를 매 프레임 읽음).
// 빈백 천은 부클레(작은 고리 실)처럼 보이게: 캔버스로 그린 작은 점무늬를 울퉁불퉁한 결(bumpMap)로 쓰고,
// 천 표면에 부드러운 빛 번짐(sheen)을 주는 재질(MeshPhysicalMaterial)을 씁니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glowSprite } from '../space/libraryTextures'
import { lanternTreeShape } from './lanternShape'
import { barkTexture, limbTube } from './barkShapes'
import { courtyardSeats } from './worldLogic'
import type { CourtyardSpec, PlazaLayout } from './worldLogic'
import { colorMat, nightGlow, plantMat } from './worldMaterials'
import { groundTextures } from './worldTextures'

const BARK = { color: '#a87f5a', bump: 5, roughness: 0.95, glow: '#c96a24', nightGlow: 0.85 } // 나무껍질: 색, 결 세기, 밤에 물드는 색·세기
const LEAF_TONES = ['#4f8a3a', '#6ea348', '#86b758', '#3e7434']
const FLOWERS = { count: 170, size: [0.07, 0.13], colors: ['#fffdf4', '#fff4d6', '#ffffff', '#f7efd2'], y: 0.12, nightGlow: 0.28 }
// 나무 밑·빈백 둘레 잔디: 넓이(반지름, 가장자리 울퉁불퉁), 풀잎 수, 풀잎 크기·색 (많을수록 무거움)
const GRASS = { r: 6.8, wobble: 0.5, blades: 3800, h: [0.14, 0.34], w: 0.055, tones: ['#5f9440', '#6fa34a', '#7fb153', '#4f8537', '#8ab95c'], ground: '#88ab62', tile: 3, y: 0.05 }
const BULB = { every: 0.14, size: 0.2, color: '#ffc778', day: 0.2, night: 1 } // 전구: 줄 위 간격, 번짐 크기, 색, 낮·밤 밝기
const JAR = { r: 0.075, h: 0.17, halo: 0.75, cap: '#3a3226', day: 0.6, night: 2.4, color: '#ffe1a8' } // 유리 등
const WIRE = { t: 0.008, color: '#3a3226' }
// 유리 등 재질. 세기는 LanternTree 가 매 프레임 밤낮에 맞춰 바꿈 (worldMaterials 의 가로등 재질과 같은 방식)
const JAR_MAT = new THREE.MeshStandardMaterial({ color: JAR.color, emissive: JAR.color, emissiveIntensity: JAR.day, roughness: 0.3 })
const LIGHT = { intensity: 6, distance: 11, y: 4.2 } // 밤에 나무 둘레를 비추는 빛 (세 개)
// 빈백 색 (크림·오트밀·세이지·먼지 분홍·하늘 — 부드러운 파스텔), 부클레 결 그림 반복 수
const BAG_COLORS = ['#efe6d6', '#dccbb0', '#bfcbb0', '#e6c9c2', '#c3d4e2']
const BAG_R = 0.55 // 빈백 반지름 (쿼드의 쉬는 빈백 CampusDecor BEANBAG_R 과 같음)
const BOUCLE = { px: 256, dots: 2600, repeat: 3, bump: 3 }

// 늘 같은 모양이 나오게 정해진 씨앗으로 만든 난수
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

let barkMaterial: THREE.MeshStandardMaterial | null = null
function barkMat() {
  if (!barkMaterial) {
    const t = barkTexture()
    barkMaterial = new THREE.MeshStandardMaterial({ color: BARK.color, map: t, bumpMap: t, bumpScale: BARK.bump, roughness: BARK.roughness, emissive: BARK.glow, emissiveMap: t, emissiveIntensity: 0 })
  }
  return barkMaterial
}

// 낱장 잎 모양 (끝이 뾰족한 타원 판)
function leafShape() {
  const P = [[0, -0.5], [0.22, -0.18], [0.26, 0.08], [0.13, 0.32], [0, 0.5], [-0.13, 0.32], [-0.26, 0.08], [-0.22, -0.18]]
  const g = new THREE.BufferGeometry()
  const pos: number[] = []
  for (let i = 1; i < P.length - 1; i++) pos.push(P[0][0], P[0][1], 0, P[i][0], P[i][1], 0, P[i + 1][0], P[i + 1][1], 0)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

export function LanternCourtyard({ courtyard }: { courtyard: CourtyardSpec }) {
  return (
    <group>
      <group position={[courtyard.x, 0, courtyard.z]}>
        <CourtGrass />
        <FlowerRing r={courtyard.r} />
        <LanternTree seed={7} />
      </group>
      <FluffyBeanbags courtyard={courtyard} />
    </group>
  )
}

// 나무 밑과 빈백 자리의 잔디: 울퉁불퉁한 원에 잔디 그림 + 낱장 풀잎 (바람에 흔들림, 한 번에 그림)
function CourtGrass() {
  const G = GRASS
  const ground = useMemo(() => {
    const s = new THREE.Shape()
    const n = 64
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = G.r + G.wobble * (Math.sin(a * 3 + 1) * 0.6 + Math.sin(a * 7) * 0.4)
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    const g = new THREE.ShapeGeometry(s)
    g.rotateX(-Math.PI / 2)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / G.tile, uv.getY(i) / G.tile)
    return g
  }, [G])
  const groundMat = useMemo(() => {
    const t = groundTextures().grass
    return new THREE.MeshStandardMaterial({ color: G.ground, map: t.map, bumpMap: t.bump, bumpScale: 1, roughness: 1 })
  }, [G])
  // 풀잎: 아래가 어둡고 끝이 밝은 뾰족한 판 (풀 재질이 정점색을 곱함)
  const blade = useMemo(() => {
    const W = G.w
    const pos = [-W, 0, 0, W, 0, 0, W * 0.6, 0.5, 0.04, -W * 0.6, 0.5, 0.04, 0, 1, 0.14]
    const shade = [0.55, 0.55, 0.85, 0.85, 1.15]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(shade.flatMap((v) => [v, v, v]), 3))
    g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4])
    g.computeVertexNormals()
    return g
  }, [G])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const rand = seeded(53)
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    for (let i = 0; i < G.blades; i++) {
      const a = rand() * Math.PI * 2
      const d = 0.75 + Math.sqrt(rand()) * (G.r - G.wobble - 0.75)
      const h = G.h[0] + rand() * (G.h[1] - G.h[0])
      o.position.set(Math.sin(a) * d, G.y, Math.cos(a) * d)
      o.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      o.scale.set(h * 3, h, h * 3) // 폭은 높이에 맞춰
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, col.set(G.tones[Math.floor(rand() * G.tones.length)]))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [G])
  return (
    <group>
      <mesh geometry={ground} position-y={G.y} material={groundMat} />
      <instancedMesh ref={ref} args={[blade, plantMat('#ffffff'), G.blades]} frustumCulled={false} />
    </group>
  )
}

// 줄기 발밑의 흰 꽃 (잔디 위)
let flowerMaterial: THREE.MeshStandardMaterial | null = null
const flowerMat = () => (flowerMaterial ??= new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, emissive: '#fff2d0', emissiveIntensity: 0 }))
function FlowerRing({ r }: { r: number }) {
  const F = FLOWERS
  const spots = useMemo(() => {
    const rand = seeded(41)
    return Array.from({ length: F.count }, () => {
      const a = rand() * Math.PI * 2
      const d = (0.25 + Math.sqrt(rand()) * 0.75) * r * 0.9
      return { x: Math.sin(a) * d, z: Math.cos(a) * d, y: F.y + rand() * 0.1, s: F.size[0] + rand() * (F.size[1] - F.size[0]), c: F.colors[Math.floor(rand() * F.colors.length)] }
    })
  }, [r, F])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    spots.forEach((f, i) => {
      o.position.set(f.x, f.y, f.z)
      o.rotation.set(f.x, f.z, f.y)
      o.scale.setScalar(f.s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, col.set(f.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [spots])
  useFrame(() => {
    flowerMat().emissiveIntensity = F.nightGlow * nightGlow()
  })
  return (
    <instancedMesh ref={ref} args={[undefined, flowerMat(), F.count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

const pointMat = (size: number) => new THREE.PointsMaterial({ map: glowSprite(), color: BULB.color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: BULB.day })
let bulbPoints: THREE.PointsMaterial | null = null
const bulbMat = () => (bulbPoints ??= pointMat(BULB.size))
let haloPoints: THREE.PointsMaterial | null = null
const haloMat = () => (haloPoints ??= pointMat(JAR.halo))

// 큰 나무 + 늘어진 줄 조명 + 유리 등 + 낱장 잎
function LanternTree({ seed }: { seed: number }) {
  const shape = useMemo(() => lanternTreeShape(seed), [seed])
  const wood = useMemo(() => {
    const parts = shape.limbs.map((l, i) => limbTube(l, i === 0 ? 22 : i < 3 ? 12 : 7, i === 0 ? 0.42 : 0))
    return mergeGeometries(parts)!
  }, [shape])
  const leafGeo = useMemo(() => leafShape(), [])
  const leafMaterial = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55 }), [])
  // 전구: 줄마다 일정 간격으로 찍은 빛 점 하나의 묶음
  const bulbs = useMemo(() => {
    const pos: number[] = []
    for (const s of shape.strands) for (let y = s.bottom + JAR.h; y < s.top; y += BULB.every) pos.push(s.x, y, s.z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [shape])
  const halos = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(shape.strands.flatMap((s) => [s.x, s.bottom, s.z]), 3))
    return g
  }, [shape])
  useEffect(
    () => () => {
      wood.dispose()
      leafGeo.dispose()
      bulbs.dispose()
      halos.dispose()
    },
    [wood, leafGeo, bulbs, halos],
  )

  const leaves = useRef<THREE.InstancedMesh>(null)
  const jars = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.InstancedMesh>(null)
  const wires = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    const L = leaves.current
    if (L) {
      shape.leaves.forEach((f, i) => {
        o.position.set(f.x, f.y, f.z)
        o.rotation.set(f.rx, f.ry, f.rz)
        o.scale.setScalar(f.s)
        o.updateMatrix()
        L.setMatrixAt(i, o.matrix)
        L.setColorAt(i, col.set(LEAF_TONES[f.tone]))
      })
      L.instanceMatrix.needsUpdate = true
      if (L.instanceColor) L.instanceColor.needsUpdate = true
    }
    o.rotation.set(0, 0, 0)
    shape.strands.forEach((s, i) => {
      o.scale.set(1, 1, 1)
      o.position.set(s.x, s.bottom, s.z)
      o.updateMatrix()
      jars.current?.setMatrixAt(i, o.matrix)
      o.position.set(s.x, s.bottom + JAR.h / 2 + 0.015, s.z)
      o.updateMatrix()
      caps.current?.setMatrixAt(i, o.matrix)
      o.position.set(s.x, (s.top + s.bottom) / 2, s.z)
      o.scale.set(1, s.top - s.bottom, 1)
      o.updateMatrix()
      wires.current?.setMatrixAt(i, o.matrix)
    })
    for (const m of [jars.current, caps.current, wires.current]) if (m) m.instanceMatrix.needsUpdate = true
  }, [shape])

  // 낮에는 은은하게, 밤에는 밝게. 빛 세 개도 같이
  const lights = useRef<(THREE.PointLight | null)[]>([])
  useFrame(() => {
    const g = nightGlow()
    JAR_MAT.emissiveIntensity = JAR.day + (JAR.night - JAR.day) * g
    barkMat().emissiveIntensity = BARK.nightGlow * g
    bulbMat().opacity = BULB.day + (BULB.night - BULB.day) * g
    haloMat().opacity = bulbMat().opacity
    for (const l of lights.current) if (l) l.intensity = LIGHT.intensity * g
  })

  const count = shape.strands.length
  return (
    <group>
      <mesh geometry={wood} material={barkMat()} />
      <instancedMesh ref={leaves} args={[leafGeo, leafMaterial, shape.leaves.length]} frustumCulled={false} />
      <instancedMesh ref={wires} args={[undefined, colorMat(WIRE.color), count]} frustumCulled={false}>
        <boxGeometry args={[WIRE.t, 1, WIRE.t]} />
      </instancedMesh>
      <instancedMesh ref={jars} args={[undefined, JAR_MAT, count]} frustumCulled={false}>
        <cylinderGeometry args={[JAR.r, JAR.r * 0.88, JAR.h, 10]} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, colorMat(JAR.cap), count]} frustumCulled={false}>
        <cylinderGeometry args={[JAR.r * 0.8, JAR.r, 0.03, 10]} />
      </instancedMesh>
      <points geometry={bulbs} material={bulbMat()} frustumCulled={false} />
      <points geometry={halos} material={haloMat()} frustumCulled={false} />
      {/* 밤에 나무 둘레를 비추는 따뜻한 빛 셋 (낮에는 0) */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <pointLight
            key={i}
            ref={(el) => {
              lights.current[i] = el
            }}
            position={[Math.sin(a) * 2.5, LIGHT.y, Math.cos(a) * 2.5]}
            color="#ffd9a0"
            intensity={0}
            distance={LIGHT.distance}
            decay={2}
          />
        )
      })}
    </group>
  )
}

// 부클레 천 결: 밝고 어두운 작은 고리(점)를 빽빽하게 흩뿌린 회색 그림. 울퉁불퉁한 결(bumpMap)과 옅은 얼룩(map)으로 같이 씀
let boucle: THREE.CanvasTexture | null = null
function boucleTexture() {
  if (boucle) return boucle
  const c = document.createElement('canvas')
  c.width = c.height = BOUCLE.px
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#b8b8b8'
  ctx.fillRect(0, 0, c.width, c.height)
  const rand = seeded(11)
  for (let i = 0; i < BOUCLE.dots; i++) {
    const v = Math.round(150 + rand() * 105)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.beginPath()
    ctx.arc(rand() * c.width, rand() * c.height, 1.2 + rand() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  boucle = new THREE.CanvasTexture(c)
  boucle.wrapS = boucle.wrapT = THREE.RepeatWrapping
  boucle.repeat.set(BOUCLE.repeat, BOUCLE.repeat)
  return boucle
}

// 색마다 보송보송한 천 재질 하나 (처음 쓸 때 만들어 같이 씀)
const fluffyMats = new Map<string, THREE.MeshPhysicalMaterial>()
function fluffyMat(color: string) {
  let m = fluffyMats.get(color)
  if (!m) {
    const t = boucleTexture()
    m = new THREE.MeshPhysicalMaterial({
      color,
      map: t, // 옅은 얼룩 (색에 곱해져 실 뭉치마다 밝기가 조금씩 다름)
      bumpMap: t,
      bumpScale: BOUCLE.bump,
      roughness: 1,
      sheen: 1, // 천 표면의 부드러운 빛 번짐 (벨벳·부클레처럼)
      sheenRoughness: 0.9,
      sheenColor: new THREE.Color('#ffffff'),
    })
    fluffyMats.set(color, m)
  }
  return m
}

// 빈백 (쉬는 빈백과 같은 크기): 눌린 공(앉는 곳) + 뒤쪽 볼록한 등받이 + 앞쪽 살짝 부푼 턱. 자리 rot 방향이 앞
function FluffyBeanbags({ courtyard }: { courtyard: CourtyardSpec }) {
  const bags = useMemo(() => courtyardSeats({ courtyard } as PlazaLayout), [courtyard])
  const R = BAG_R
  return (
    <group>
      {bags.map((b, i) => {
        const m = fluffyMat(BAG_COLORS[i % BAG_COLORS.length])
        return (
          <group key={b.no} position={[b.x, 0, b.z]} rotation-y={b.rot}>
            <mesh position-y={R * 0.4} scale={[1.05, 0.42, 1.05]} material={m}>
              <sphereGeometry args={[R, 32, 20]} />
            </mesh>
            <mesh position={[0, R * 0.85, -R * 0.62]} scale={[1, 0.82, 0.58]} rotation-x={-0.25} material={m}>
              <sphereGeometry args={[R, 32, 20]} />
            </mesh>
            <mesh position={[0, R * 0.42, R * 0.55]} scale={[0.85, 0.3, 0.45]} material={m}>
              <sphereGeometry args={[R, 24, 14]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
