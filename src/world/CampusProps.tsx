// 캠퍼스 소품: 깃대, 벽 세로 현수막, 자전거 거치대, 동아리 천막. 자리는 campus.json props (hallLogic).
// 가볍게: 새 조명 없음. 자전거는 도형을 합쳐 색마다 한 번씩만 그립니다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PROP } from './hallLogic'
import type { CampusProps as Props, XZ } from './hallLogic'
import { bannerTexture, flagTexture, tentSignTexture } from './campusSigns'
import { colorMat, nightGlow, shopWindowMat } from './worldMaterials'
import { glowSprite } from '../space/libraryTextures'
import { ORB } from './walkLogic'
import type { Orb } from './walkLogic'

const POLE = '#c9c9c6'
const BIKE_COLORS = ['#c8553d', '#2f5d8a', '#3d8a6b']
const FLAG = { h: 9, r: 0.06, w: 1.8, hh: 1.2 }
const ORB_LOOK = { color: '#ffe0b0', day: 0.55, night: 2.0, pool: '#ffb86b', poolSize: 7, poolY: 0.06, poolNight: 0.7 } // 둥근 조명: 색, 낮·밤 빛남, 바닥 빛 색·크기(반지름 배수)·높이·밤 세기
const BANNER = { w: 0.72, h: 4.9, y: 7.1 }

// side: 깃발이 기둥의 어느 쪽으로 나오는지 (1 오른쪽, -1 왼쪽). 기둥을 돌리면 글자가 뒤집히므로 자리만 옮기고,
// 앞뒤 판을 따로 두어 어느 쪽에서 봐도 글자가 바로 읽힙니다
function FlagPole({ p, side }: { p: XZ; side: number }) {
  const F = FLAG
  const x = side * (F.w / 2 + F.r)
  const y = F.h - F.hh / 2 - 0.25
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position-y={F.h / 2} material={colorMat(POLE)}>
        <cylinderGeometry args={[F.r * 0.7, F.r, F.h, 10]} />
      </mesh>
      <mesh position-y={F.h + 0.08} material={colorMat('#c9a24b')}>
        <sphereGeometry args={[0.11, 12, 10]} />
      </mesh>
      {[0, Math.PI].map((turn) => (
        <mesh key={turn} position={[x, y, 0]} rotation-y={turn} material={shopWindowMat(flagTexture())}>
          <planeGeometry args={[F.w, F.hh]} />
        </mesh>
      ))}
    </group>
  )
}

function Banner({ b }: { b: Props['banners'][number] }) {
  const B = BANNER
  return (
    <group position={[b.x, B.y, b.z]}>
      {/* 밤에도 읽히게 스스로 빛나는 재질 */}
      <mesh material={shopWindowMat(bannerTexture(b.text, b.color))}>
        <planeGeometry args={[B.w, B.h]} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, (s * B.h) / 2, 0.01]} rotation-z={Math.PI / 2} material={colorMat(POLE)}>
          <cylinderGeometry args={[0.025, 0.025, B.w + 0.1, 8]} />
        </mesh>
      ))}
    </group>
  )
}

// 두 점을 잇는 막대
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const dir = b.clone().sub(a)
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 6)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g.toNonIndexed()
}

// 거치대 하나에 자전거 count 대. 앞바퀴가 거치대(뒤쪽 -z)를 향함
function bikeGeometry(count: number, width: number) {
  const R = 0.33
  const dark: THREE.BufferGeometry[] = []
  const frames: THREE.BufferGeometry[][] = BIKE_COLORS.map(() => [])
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  dark.push(rod(V(-width / 2, 0.55, -0.72), V(width / 2, 0.55, -0.72), 0.03))
  for (const s of [-1, 1]) dark.push(rod(V((s * width) / 2, 0, -0.72), V((s * width) / 2, 0.55, -0.72), 0.03))
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / count
    const zf = -0.55
    const zb = 0.5
    for (const z of [zf, zb]) dark.push(new THREE.TorusGeometry(R, 0.026, 6, 20).rotateY(Math.PI / 2).translate(x, R, z).toNonIndexed())
    const seat = V(x, 0.82, zb - 0.28)
    const bars = V(x, 0.88, zf + 0.22)
    const pedal = V(x, 0.36, 0.03)
    const parts = frames[i % frames.length]
    parts.push(rod(V(x, R, zb), pedal, 0.022), rod(pedal, seat, 0.022), rod(V(x, R, zb), V(x, 0.72, zb - 0.26), 0.018), rod(V(x, 0.72, zb - 0.26), bars, 0.022), rod(pedal, V(x, 0.74, zf + 0.25), 0.022), rod(V(x, R, zf), bars, 0.022))
    dark.push(rod(V(x - 0.24, 0.92, zf + 0.2), V(x + 0.24, 0.92, zf + 0.2), 0.016), rod(V(x, 0.82, zb - 0.38), V(x, 0.82, zb - 0.14), 0.04))
  }
  return { dark: mergeGeometries(dark)!, frames: frames.map((f) => mergeGeometries(f)!) }
}

function Bikes({ p }: { p: XZ }) {
  const B = PROP.bikes
  const geo = useMemo(() => bikeGeometry(B.count, B.w), [B.count, B.w])
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh geometry={geo.dark} material={colorMat('#2b2c30')} />
      {geo.frames.map((g, i) => (
        <mesh key={i} geometry={g} material={colorMat(BIKE_COLORS[i])} />
      ))}
    </group>
  )
}

// 천막: 앞(간판·탁자)이 중정 쪽(-z)을 봄
function Tent({ t }: { t: Props['tents'][number] }) {
  const S = PROP.tent.size
  const T = PROP.tent.table
  const h = 2.35
  return (
    <group position={[t.x, 0, t.z]} rotation-y={Math.PI}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * (S - 0.1)) / 2, h / 2, (sz * (S - 0.1)) / 2]} material={colorMat(POLE)}>
            <cylinderGeometry args={[0.035, 0.035, h, 8]} />
          </mesh>
        )),
      )}
      <mesh position-y={h + 0.45} rotation-y={Math.PI / 4} material={colorMat(t.color)}>
        <coneGeometry args={[(S / 2) * Math.SQRT2 + 0.05, 0.9, 4]} />
      </mesh>
      <mesh position-y={h - 0.1} material={colorMat(t.color)}>
        <boxGeometry args={[S + 0.04, 0.2, S + 0.04]} />
      </mesh>
      <mesh position={[0, h - 0.1, S / 2 + 0.03]}>
        <planeGeometry args={[S - 0.5, (S - 0.5) * (96 / 512) * 0.9]} />
        <meshBasicMaterial map={tentSignTexture(t.text, t.color)} />
      </mesh>
      <mesh position={[0, 0.38, T.z]} material={colorMat('#f4efe3')}>
        <boxGeometry args={[T.w, 0.76, T.d]} />
      </mesh>
    </group>
  )
}

export function CampusProps({ props }: { props: Props }) {
  return (
    <group>
      {props.flags.map((f, i) => (
        <FlagPole key={i} p={f} side={f.x > 0 ? -1 : 1} />
      ))}
      {props.banners.map((b) => (
        <Banner key={b.text} b={b} />
      ))}
      <Bikes p={props.bikes} />
      {props.tents.map((t) => (
        <Tent key={t.text} t={t} />
      ))}
    </group>
  )
}

// 모든 조명이 같이 쓰는 재질 (세기는 매 프레임 밤낮에 맞춰 바꿈)
let orbBall: THREE.MeshStandardMaterial | null = null
const orbBallMat = () => (orbBall ??= new THREE.MeshStandardMaterial({ color: ORB_LOOK.color, emissive: ORB_LOOK.color, emissiveIntensity: ORB_LOOK.day, roughness: 0.4 }))
let orbPool: THREE.MeshBasicMaterial | null = null
const orbPoolMat = () => (orbPool ??= new THREE.MeshBasicMaterial({ map: glowSprite(), color: ORB_LOOK.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))

// 길가 둥근 조명 (사용자 참고 사진): 잔디에 살짝 묻힌 빛나는 공 + 밤에 바닥에 번지는 빛. 새 조명 없음
export function GardenOrbs({ orbs }: { orbs: Orb[] }) {
  const balls = useRef<THREE.InstancedMesh>(null)
  const pools = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    orbs.forEach((b, i) => {
      o.rotation.set(0, 0, 0)
      o.position.set(b.x, b.r * ORB.lift, b.z)
      o.scale.setScalar(b.r)
      o.updateMatrix()
      balls.current?.setMatrixAt(i, o.matrix)
      o.position.set(b.x, ORB_LOOK.poolY, b.z)
      o.rotation.set(-Math.PI / 2, 0, 0)
      o.scale.setScalar(b.r * ORB_LOOK.poolSize)
      o.updateMatrix()
      pools.current?.setMatrixAt(i, o.matrix)
    })
    for (const m of [balls.current, pools.current]) if (m) m.instanceMatrix.needsUpdate = true
  }, [orbs])
  useFrame(() => {
    const g = nightGlow()
    const ballMat = orbBallMat()
    const poolMat = orbPoolMat()
    ballMat.emissiveIntensity = ORB_LOOK.day + (ORB_LOOK.night - ORB_LOOK.day) * g
    poolMat.opacity = ORB_LOOK.poolNight * g
    if (pools.current) pools.current.visible = g > 0.01 // 낮에는 그리지 않음
  })
  if (orbs.length === 0) return null
  return (
    <group>
      <instancedMesh ref={balls} args={[undefined, orbBallMat(), orbs.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 20, 14]} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, orbPoolMat(), orbs.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </group>
  )
}
