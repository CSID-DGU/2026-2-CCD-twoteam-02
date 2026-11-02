// 캠프파이어 (캠리단길 광장 서쪽 잔디, world.json campfire): 돌 고리 + 엇갈려 쌓은 장작 + 일렁이는 불꽃 + 올라가는 불티 +
// 깜빡이는 주황 불빛. 둘레 통나무 의자에 앉아 벤치처럼 공부합니다(자리는 campfireLogic, 앉기·공부는 WorldScene 의 벤치 공부와 같음).
// 가까이 가면 장작 타닥타닥 소리 (campfireSound, 크기는 거리로). 채팅의 "소리 끔"이면 소리 없음.
// 옆 마시멜로 가판대(MarshmallowStall): 줄무늬 차양 나무 가판대 + 판매원. 받은 마시멜로는 불 가까이 있으면 구워짐(색이 바뀜).
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMPFIRE, campfireSeats, fireLoudness, stallBarista, toastColor, toastLabel, toastStep } from './campfireLogic'
import type { CampfireSpec, StallSpec } from './campfireLogic'
import { BaristaNpc } from '../space/BaristaNpc'
import { COUNTER } from '../space/baristaLogic'
import { setMarshmallowColor } from '../space/drinkCup'
import { heldItem, heldToast, setHeldToast } from '../space/heldItem'
import { CHALK_FONT } from '../ranking/chalk'
import { setCampfireVolume, stopCampfireSound } from './campfireSound'

const LOG = { r: 0.22, len: 1.15 } // 통나무 의자 (앉는 높이 0.44)
const STONES = 11
const FLAMES = [
  { r: 0.36, h: 1.0, color: '#ff5a1f', speed: 7.1, phase: 0 },
  { r: 0.27, h: 0.8, color: '#ff8c1a', speed: 8.3, phase: 1.7 },
  { r: 0.17, h: 0.55, color: '#ffd23f', speed: 9.7, phase: 3.1 },
]
const TONGUES = 5 // 바깥으로 튀는 작은 불꽃
const EMBERS = 28

// 나무껍질: 세로로 갈라진 짙은 갈색 결 (처음 쓸 때 한 번만 그림)
let bark: THREE.CanvasTexture | null = null
function barkTexture() {
  if (bark) return bark
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#5a3d26'
  g.fillRect(0, 0, 128, 256)
  for (let i = 0; i < 90; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(30,18,10,0.55)' : 'rgba(120,88,58,0.35)'
    g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 70)
  }
  bark = new THREE.CanvasTexture(c)
  bark.colorSpace = THREE.SRGBColorSpace
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping
  return bark
}
// 통나무 단면: 밝은 나무 + 나이테
let rings: THREE.CanvasTexture | null = null
function ringTexture() {
  if (rings) return rings
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#c89a62'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(110,70,35,0.6)'
  for (let r = 8; r < 64; r += 7 + Math.random() * 4) {
    g.lineWidth = 1 + Math.random() * 1.5
    g.beginPath()
    g.arc(64, 64, r, 0, Math.PI * 2)
    g.stroke()
  }
  g.lineWidth = 8
  g.strokeStyle = '#4a321f'
  g.beginPath()
  g.arc(64, 64, 60, 0, Math.PI * 2)
  g.stroke()
  rings = new THREE.CanvasTexture(c)
  rings.colorSpace = THREE.SRGBColorSpace
  return rings
}
// 바닥 불빛 웅덩이: 가운데가 밝은 주황 동그라미
let pool: THREE.CanvasTexture | null = null
function poolTexture() {
  if (pool) return pool
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,150,60,0.9)')
  grad.addColorStop(0.4, 'rgba(255,110,40,0.35)')
  grad.addColorStop(1, 'rgba(255,90,30,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  pool = new THREE.CanvasTexture(c)
  return pool
}

const flameMat = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })

// vendorSay: 판매원 말풍선, onToast: 들고 있는 마시멜로의 굽기 이름이 바뀔 때 (먹기 안내 글자)
export function Campfire({ fire, posRef, muted, vendorSay = null, vendorSeq = 0, onToast }: { fire: CampfireSpec; posRef: RefObject<{ x: number; z: number }>; muted: boolean; vendorSay?: string | null; vendorSeq?: number; onToast?: (label: string) => void }) {
  const seats = useMemo(() => campfireSeats(fire, 0), [fire])
  const flames = useRef<(THREE.Mesh | null)[]>([])
  const tongues = useRef<(THREE.Mesh | null)[]>([])
  const light = useRef<THREE.PointLight>(null)
  const embers = useRef<THREE.Points>(null)
  const mats = useMemo(() => FLAMES.map((f) => flameMat(f.color)), [])
  const tongueMat = useMemo(() => flameMat('#ff9a2a'), [])
  const emberGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
    return g
  }, [])
  // 불티: 처음엔 모두 위(사라진 자리)에 두어 첫 프레임부터 하나씩 불 속에서 다시 날림 (높이를 조금씩 달리해 한꺼번에 나오지 않게)
  const emberState = useRef(Array.from({ length: EMBERS }, (_, i) => ({ x: 0, y: 2.6 + (i / EMBERS) * 2, z: 0, vx: 0, vz: 0, vy: 0.6 })))
  const stones = useMemo(
    () =>
      Array.from({ length: STONES }, (_, i) => {
        const a = (i / STONES) * Math.PI * 2
        return { x: Math.sin(a) * (CAMPFIRE.ring - 0.12), z: Math.cos(a) * (CAMPFIRE.ring - 0.12), s: 0.13 + ((i * 37) % 7) / 70, rot: i * 1.3, shade: ['#8a8680', '#6f6c68', '#9d988f'][i % 3] }
      }),
    [],
  )

  useEffect(() => stopCampfireSound, [])
  const lastLabel = useRef('')
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    // 들고 있는 마시멜로 굽기 (불 가까이서만 익음)
    const p0 = posRef.current
    if (heldItem()?.food === 'marshmallow' && p0) {
      const toast = toastStep(heldToast(), Math.min(dt, 0.1), fire, p0)
      setHeldToast(toast)
      setMarshmallowColor(toastColor(toast))
      const label = toastLabel(toast)
      if (label !== lastLabel.current) {
        lastLabel.current = label
        onToast?.(label)
      }
    }
    flames.current.forEach((m, i) => {
      if (!m) return
      const f = FLAMES[i]
      const k = 0.85 + 0.15 * Math.sin(t * f.speed + f.phase) + 0.08 * Math.sin(t * f.speed * 2.3 + f.phase)
      m.scale.set(1 + 0.06 * Math.sin(t * 5 + i), k, 1 + 0.06 * Math.cos(t * 6 + i))
      m.position.y = 0.12 + (f.h * k) / 2
      m.rotation.y = t * (0.6 + i * 0.3)
      m.rotation.z = 0.06 * Math.sin(t * 3.1 + i)
    })
    tongues.current.forEach((m, i) => {
      if (!m) return
      const life = (t * 1.6 + i / TONGUES) % 1 // 0 → 1 동안 위로 솟으며 작아짐
      const a = i * 2.4
      m.position.set(Math.sin(a) * 0.16, 0.25 + life * 0.75, Math.cos(a) * 0.16)
      m.scale.setScalar(Math.max(0.01, 1 - life))
    })
    if (light.current) light.current.intensity = 6 + 1.6 * Math.sin(t * 11) + 1.1 * Math.sin(t * 17.3) + 0.7 * Math.sin(t * 4.1)
    // 불티: 위로 날리다 사라지면 다시 불 속에서
    const pts = embers.current
    if (pts) {
      const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
      emberState.current.forEach((e, i) => {
        if (e.y > 2.6) Object.assign(e, { x: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4, y: 0.3, vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25, vy: 0.5 + Math.random() * 0.8 })
        e.x += e.vx * 0.016
        e.z += e.vz * 0.016
        e.y += e.vy * 0.016
        arr[i * 3] = e.x + Math.sin(t * 2 + i) * 0.03
        arr[i * 3 + 1] = e.y
        arr[i * 3 + 2] = e.z
      })
      pts.geometry.attributes.position.needsUpdate = true
    }
    const p = posRef.current
    setCampfireVolume(muted || !p ? 0 : fireLoudness(fire, p))
  })

  return (
    <group>
      {fire.stall && <MarshmallowStall stall={fire.stall} say={vendorSay} seq={vendorSeq} />}
      <group position={[fire.x, 0, fire.z]}>
        {/* 재·숯 바닥 */}
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <circleGeometry args={[CAMPFIRE.ring - 0.1, 24]} />
          <meshStandardMaterial color="#2a2420" roughness={1} />
        </mesh>
        {/* 바닥 불빛 웅덩이 */}
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <planeGeometry args={[4.5, 4.5]} />
          <meshBasicMaterial map={poolTexture()} transparent blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.55} />
        </mesh>
        {/* 돌 고리 */}
        {stones.map((s, i) => (
          <mesh key={i} position={[s.x, s.s * 0.55, s.z]} rotation={[s.rot, s.rot * 0.7, 0]} scale={[1, 0.7, 1]}>
            <dodecahedronGeometry args={[s.s, 0]} />
            <meshStandardMaterial color={s.shade} roughness={0.95} flatShading />
          </mesh>
        ))}
        {/* 장작: 원뿔처럼 기대어 세운 장작 5개 + 바닥에 엇갈린 두 개 (탄 끝은 검게) */}
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * 0.2, 0.26, Math.cos(a) * 0.2]} rotation={[Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55]}>
              <cylinderGeometry args={[0.045, 0.06, 0.62, 7]} />
              <meshStandardMaterial map={barkTexture()} color="#6b4a30" emissive="#ff4a10" emissiveIntensity={0.25} roughness={0.9} />
            </mesh>
          )
        })}
        {[0.4, -0.7].map((r, i) => (
          <mesh key={i} position-y={0.07 + i * 0.06} rotation={[0, r, Math.PI / 2]}>
            <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
            <meshStandardMaterial map={barkTexture()} color="#4a3322" roughness={0.95} />
          </mesh>
        ))}
        {/* 불꽃 */}
        {FLAMES.map((f, i) => (
          <mesh
            key={i}
            ref={(m) => {
              flames.current[i] = m
            }}
            material={mats[i]}
          >
            <coneGeometry args={[f.r, f.h, 10, 1, true]} />
          </mesh>
        ))}
        {Array.from({ length: TONGUES }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              tongues.current[i] = m
            }}
            material={tongueMat}
          >
            <coneGeometry args={[0.07, 0.22, 6, 1, true]} />
          </mesh>
        ))}
        <points ref={embers} geometry={emberGeo}>
          <pointsMaterial color="#ffb347" size={0.05} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
        <pointLight ref={light} position-y={0.9} color="#ff8a3d" intensity={6} distance={10} decay={1.4} />
      </group>
      {/* 통나무 의자: 불을 바라보는 자리마다 가로로 누운 통나무 (길이 방향이 불 둘레를 따라감) */}
      {seats.map((s) => (
        <group key={s.no} position={[s.x, LOG.r, s.z]} rotation-y={s.rot}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[LOG.r, LOG.r * 1.04, LOG.len, 14]} />
            <meshStandardMaterial attach="material-0" map={barkTexture()} roughness={0.95} />
            <meshStandardMaterial attach="material-1" map={ringTexture()} roughness={0.8} />
            <meshStandardMaterial attach="material-2" map={ringTexture()} roughness={0.8} />
          </mesh>
          {/* 앉는 면을 살짝 깎아 평평하게 */}
          <mesh position-y={LOG.r - 0.005} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[LOG.len * 0.92, 0.2]} />
            <meshStandardMaterial map={ringTexture()} color="#b78a55" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 마시멜로 가판대: 나무 카운터 + 두 기둥에 빨강·흰 줄무늬 차양 + 간판 + 마시멜로 유리병·꼬챙이 통. 판매원은 카운터 뒤
const STALL = { h: 1.0, d: COUNTER.d, roof: 2.35, lift: 0.14, wheel: 0.32 } // lift: 몸통을 바닥에서 띄운 높이, wheel: 수레바퀴 반지름
const ANGLE: Record<StallSpec['facing'], number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 }

// 크림색 페인트 세로 판자 (판자 사이 홈 + 붓 자국 조금)
let planks: THREE.CanvasTexture | null = null
function plankTexture() {
  if (planks) return planks
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f3e6cf'
  g.fillRect(0, 0, 256, 128)
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(150,110,70,0.06)'
    g.fillRect(i * 25.6, 0, 25.6, 128)
    g.fillStyle = 'rgba(110,75,45,0.45)'
    g.fillRect(i * 25.6, 0, 2, 128)
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(160,120,80,0.08)'
    g.fillRect(Math.random() * 256, Math.random() * 128, 1, 10 + Math.random() * 30)
  }
  planks = new THREE.CanvasTexture(c)
  planks.colorSpace = THREE.SRGBColorSpace
  return planks
}

let stripes: THREE.CanvasTexture | null = null
function stripeTexture() {
  if (stripes) return stripes
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f6efe4' : '#c8382c'
    g.fillRect(i * 32, 0, 32, 32)
  }
  stripes = new THREE.CanvasTexture(c)
  stripes.colorSpace = THREE.SRGBColorSpace
  return stripes
}
// 간판: 짙은 나무판 + 금테, 크림색 "마시멜로"(갈색 테두리) + 작은 영어 한 줄. 글꼴은 index.css 의 @font-face 라
// 받기 전에 그리면 대신 글꼴로 나와서, 받은 뒤 같은 캔버스를 다시 그립니다(간판 글자 facadeTextures 와 같은 방식)
const SIGN_KO = `700 66px ${CHALK_FONT}` // 광장 순위 게시판 "오늘의 공부왕"과 같은 케리스 케듀체
const SIGN_EN = `400 28px ${CHALK_FONT}`
let sign: THREE.CanvasTexture | null = null
function drawSign(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 160)
  g.fillStyle = '#3b2a1e'
  g.fillRect(0, 0, 512, 160)
  g.strokeStyle = '#e9c46a'
  g.lineWidth = 7
  g.strokeRect(8, 8, 496, 144)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = SIGN_KO
  g.lineJoin = 'round'
  g.lineWidth = 10
  g.strokeStyle = '#8a4b2a'
  g.strokeText('마시멜로', 256, 66)
  g.fillStyle = '#fff3e6'
  g.fillText('마시멜로', 256, 66)
  g.font = '34px sans-serif'
  g.fillText('🔥', 92, 66)
  g.fillText('🍡', 420, 66)
  g.font = SIGN_EN
  g.fillStyle = '#f7c9d4'
  g.fillText('roast it by the fire', 256, 124)
}
function signTexture() {
  if (sign) return sign
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  drawSign(c)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  sign = t
  void Promise.all([document.fonts.load(SIGN_KO), document.fonts.load(SIGN_EN)])
    .then(() => {
      drawSign(c)
      t.needsUpdate = true
    })
    .catch(() => {})
  return t
}

function MarshmallowStall({ stall, say, seq }: { stall: StallSpec; say: string | null; seq: number }) {
  const vendor = useMemo(() => stallBarista(stall), [stall])
  const w = stall.w
  return (
    <>
      <BaristaNpc barista={vendor} bubble={say} greetSeq={seq} />
      {/* 가판대 기준: 길이는 x, 손님 쪽이 +z */}
      <group position={[stall.x, 0, stall.z]} rotation-y={ANGLE[stall.facing]}>
        {/* 몸통: 크림색 페인트 나무 판자 (바닥에서 조금 띄움) + 원목 틀(모서리 기둥·위아래 띠) + 밝은 원목 상판 */}
        <mesh position-y={(STALL.h + STALL.lift) / 2}>
          <boxGeometry args={[w, STALL.h - STALL.lift, STALL.d]} />
          <meshStandardMaterial map={plankTexture()} roughness={0.85} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[(sx * (w - 0.06)) / 2, (STALL.h + STALL.lift) / 2, (sz * (STALL.d - 0.06)) / 2]}>
              <boxGeometry args={[0.08, STALL.h - STALL.lift + 0.02, 0.08]} />
              <meshStandardMaterial color="#7a5232" roughness={0.8} />
            </mesh>
          )),
        )}
        {[STALL.lift + 0.03, STALL.h - 0.04].map((y) => (
          <mesh key={y} position-y={y}>
            <boxGeometry args={[w + 0.02, 0.06, STALL.d + 0.02]} />
            <meshStandardMaterial color="#7a5232" roughness={0.8} />
          </mesh>
        ))}
        <mesh position-y={STALL.h + 0.025}>
          <boxGeometry args={[w + 0.14, 0.05, STALL.d + 0.14]} />
          <meshStandardMaterial map={ringTexture()} color="#e3c18f" roughness={0.7} />
        </mesh>
        {/* 양옆 수레바퀴 (테 + 바퀴살 + 가운데 축) */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[(sx * w) / 2 + sx * 0.04, STALL.wheel, 0]} rotation-y={Math.PI / 2}>
            <mesh>
              <torusGeometry args={[STALL.wheel - 0.03, 0.03, 8, 24]} />
              <meshStandardMaterial color="#5a3a22" roughness={0.8} />
            </mesh>
            {Array.from({ length: 6 }, (_, k) => (
              <mesh key={k} rotation-z={(k * Math.PI) / 6}>
                <boxGeometry args={[0.025, (STALL.wheel - 0.03) * 2, 0.02]} />
                <meshStandardMaterial color="#7a5232" />
              </mesh>
            ))}
            <mesh rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
              <meshStandardMaterial color="#c9a24a" metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        ))}
        {/* 앞쪽 바닥에 장작 바구니 */}
        <group position={[w * 0.34, 0, STALL.d / 2 + 0.28]}>
          <mesh position-y={0.13}>
            <cylinderGeometry args={[0.2, 0.16, 0.26, 14, 1, true]} />
            <meshStandardMaterial color="#b98a52" side={THREE.DoubleSide} roughness={0.95} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.sin(k * 1.6) * 0.07, 0.26, Math.cos(k * 1.6) * 0.07]} rotation={[0.15 * k, k, Math.PI / 2 - 0.25]}>
              <cylinderGeometry args={[0.035, 0.035, 0.34, 7]} />
              <meshStandardMaterial map={barkTexture()} color="#7a5232" />
            </mesh>
          ))}
        </group>
        {/* 차양 앞 끝 꼬마전구 */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-w / 2 + ((i + 0.5) * w) / 7, STALL.roof - 0.33 - Math.sin(((i + 0.5) / 7) * Math.PI) * 0.06, (STALL.d + 0.55) / 2 + 0.1]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshBasicMaterial color="#ffd98a" />
          </mesh>
        ))}
        {/* 앞판 간판 */}
        <mesh position={[0, STALL.h * 0.55, STALL.d / 2 + 0.006]}>
          <planeGeometry args={[w * 0.82, (w * 0.82 * 160) / 512]} />
          <meshBasicMaterial map={signTexture()} />
        </mesh>
        {/* 두 기둥 + 줄무늬 차양 (앞으로 살짝 기울어짐) */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[(sx * (w - 0.08)) / 2, STALL.roof / 2, -STALL.d / 2 + 0.05]}>
            <cylinderGeometry args={[0.035, 0.035, STALL.roof, 8]} />
            <meshStandardMaterial color="#6b4a30" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, STALL.roof - 0.05, 0.05]} rotation-x={0.28}>
          <boxGeometry args={[w + 0.3, 0.04, STALL.d + 0.55]} />
          <meshStandardMaterial map={stripeTexture()} roughness={0.85} />
        </mesh>
        {/* 차양 앞 늘어진 물결 천 */}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[-w / 2 - 0.1 + ((i + 0.5) * (w + 0.2)) / 8, STALL.roof - 0.22, (STALL.d + 0.55) / 2 + 0.12]} rotation-x={0.28}>
            <circleGeometry args={[(w + 0.2) / 16, 12, Math.PI, Math.PI]} />
            <meshStandardMaterial color={i % 2 ? '#f6efe4' : '#c8382c'} side={THREE.DoubleSide} roughness={0.85} />
          </mesh>
        ))}
        {/* 마시멜로 유리병 셋 + 꼬챙이 통 */}
        {[-0.55, -0.2, 0.15].map((x, i) => (
          <group key={i} position={[x * (w / 1.8), STALL.h + 0.05, -0.05]}>
            <mesh position-y={0.14}>
              <cylinderGeometry args={[0.11, 0.11, 0.28, 16]} />
              <meshStandardMaterial color="#dff3ff" transparent opacity={0.3} roughness={0.05} />
            </mesh>
            {Array.from({ length: 6 }, (_, k) => (
              <mesh key={k} position={[((k % 3) - 1) * 0.055, 0.04 + Math.floor(k / 3) * 0.05, ((k * 7) % 3) * 0.02 - 0.02]}>
                <cylinderGeometry args={[0.025, 0.025, 0.04, 10]} />
                <meshStandardMaterial color={['#fbf7f0', '#f7d6e0', '#fbf7f0'][k % 3]} roughness={0.9} />
              </mesh>
            ))}
            <mesh position-y={0.29}>
              <cylinderGeometry args={[0.1, 0.1, 0.03, 16]} />
              <meshStandardMaterial color="#b8935f" />
            </mesh>
          </group>
        ))}
        <group position={[w * 0.33, STALL.h + 0.05, -0.05]}>
          <mesh position-y={0.09}>
            <cylinderGeometry args={[0.07, 0.06, 0.18, 12]} />
            <meshStandardMaterial color="#6b4a30" />
          </mesh>
          {Array.from({ length: 7 }, (_, k) => (
            <mesh key={k} position={[Math.sin(k) * 0.03, 0.3, Math.cos(k) * 0.03]} rotation-z={Math.sin(k * 2) * 0.12}>
              <cylinderGeometry args={[0.004, 0.004, 0.42, 5]} />
              <meshStandardMaterial color="#d9bf8c" />
            </mesh>
          ))}
        </group>
      </group>
    </>
  )
}
