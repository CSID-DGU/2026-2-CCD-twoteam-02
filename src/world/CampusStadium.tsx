// 캠퍼스 축구장의 조명탑과 팀 벤치. 배치는 campus.json 의 stadium, 부딪힘 상자는 worldLogic 의 stadiumBoxes
// 밤에만 켜집니다. 그림자 없는 조명 하나 + 잔디에 깐 빛 그림 + 조명 번짐으로 비용을 줄입니다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import type { Pitch } from './ballLogic'
import type { StadiumSpec } from './worldLogic'
import { DUGOUT, MAST_BOX } from './worldLogic'
import { NIGHT_UNIFORM } from './worldMaterials'

// 조명탑 (m): 높이, 기둥 위·아래 반지름, 콘크리트 받침 크기
const MAST = { h: 14, rTop: 0.09, rBottom: 0.2, baseH: 0.5 }
// 조명 머리: 판 크기, 두께, 아래로 숙인 각도(라디안), 등 칸 수, 등 반지름
const HEAD = { w: 2.8, h: 1.3, d: 0.16, tilt: 0.75, cols: 6, rows: 3, led: 0.15 }
const COLOR = { steel: '#8b9096', frame: '#3b3f44', concrete: '#a7a59e', ledOff: '#70757a', ledOn: '#ffffff', light: '#f2f6ff' }
// 밤 밝기: 잔디 빛 세기, 번짐 크기(m)·세기, 실제 조명 세기·높이·닿는 거리
const NIGHT = { pool: 0.2, halo: 6, haloOpacity: 0.8, light: 26, lightY: 11, lightReach: 30 }
const POOL_MARGIN = 7 // 빛이 경기장 밖으로 번지는 거리(m)
// 팀 벤치 (m): 좌석 수, 좌석 폭·높이, 지붕 반지름
const SEAT = { count: 6, w: 0.62, h: 0.45, depth: 0.42, back: 0.5, t: 0.06 }
const SHELL_R = 1.15
const SHELL_SHIFT = 0.2 // 지붕을 좌석보다 앞으로 옮기는 거리
const steel = new THREE.MeshStandardMaterial({ color: COLOR.steel, metalness: 0.7, roughness: 0.4 })
const frame = new THREE.MeshStandardMaterial({ color: COLOR.frame, metalness: 0.6, roughness: 0.5 })
const concrete = new THREE.MeshStandardMaterial({ color: COLOR.concrete, roughness: 0.95 })
const shell = new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.32, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false })
const led = new THREE.MeshBasicMaterial({ color: COLOR.ledOff, toneMapped: false })
const ledOff = new THREE.Color(COLOR.ledOff)
const ledOn = new THREE.Color(COLOR.ledOn)

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 조명 번짐: 가운데가 하얗고 바깥으로 사라지는 원
let haloTex: THREE.Texture | null = null
const haloTexture = () =>
  (haloTex ??= canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.12, 'rgba(235,243,255,0.75)')
    g.addColorStop(0.4, 'rgba(190,215,255,0.14)')
    g.addColorStop(1, 'rgba(160,200,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 128, 128)
  }))

const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 })

// 잔디에 깔 빛 그림: 검은 바탕(더하면 그대로) 위에 조명탑마다 겨눈 자리를 밝게
function poolTexture(pitch: Pitch, masts: StadiumSpec['masts'], w: number, d: number) {
  const SCALE = 16 // 1m 당 칸
  return canvasTexture(w * SCALE, d * SCALE, (c) => {
    c.fillStyle = '#000'
    c.fillRect(0, 0, w * SCALE, d * SCALE)
    c.globalCompositeOperation = 'lighter'
    for (const m of masts) {
      // 탑 자리에서 경기장 가운데 쪽으로 옮긴 지점을 비춥니다 (양쪽 빛이 겹쳐 가운데가 고르게 밝음)
      const x = (m.x + (pitch.x - m.x) * 0.55 - pitch.x + w / 2) * SCALE
      const y = (m.z + (pitch.z - m.z) * 0.55 - pitch.z + d / 2) * SCALE
      const r = 13 * SCALE
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(210,225,235,0.75)')
      g.addColorStop(0.55, 'rgba(170,190,205,0.32)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = g
      c.fillRect(0, 0, w * SCALE, d * SCALE)
    }
  })
}

function FloodlightMasts({ pitch, masts }: { pitch: Pitch; masts: StadiumSpec['masts'] }) {
  const leds = useMemo(() => {
    const out: [number, number][] = []
    for (let r = 0; r < HEAD.rows; r++) {
      for (let k = 0; k < HEAD.cols; k++) {
        out.push([((k + 0.5) / HEAD.cols - 0.5) * (HEAD.w - 0.2), ((r + 0.5) / HEAD.rows - 0.5) * (HEAD.h - 0.2)])
      }
    }
    return out
  }, [])
  const heads = useMemo(() => masts.map((m) => ({ ...m, yaw: Math.atan2(pitch.x - m.x, pitch.z - m.z) })), [masts, pitch.x, pitch.z])
  return (
    <>
      {heads.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]}>
          <mesh position-y={MAST.baseH / 2} material={concrete}>
            <cylinderGeometry args={[MAST_BOX / 2, MAST_BOX / 2 + 0.08, MAST.baseH, 12]} />
          </mesh>
          <mesh position-y={(MAST.h + MAST.baseH) / 2} material={steel}>
            <cylinderGeometry args={[MAST.rTop, MAST.rBottom, MAST.h - MAST.baseH, 10]} />
          </mesh>
          <group position-y={MAST.h} rotation-y={m.yaw}>
            <group rotation-x={HEAD.tilt}>
              <mesh material={frame}>
                <boxGeometry args={[HEAD.w, HEAD.h, HEAD.d]} />
              </mesh>
              <Instances limit={leds.length} material={led} frames={1}>
                <circleGeometry args={[HEAD.led, 12]} />
                {leds.map(([x, y], k) => (
                  <Instance key={k} position={[x, y, HEAD.d / 2 + 0.01]} />
                ))}
              </Instances>
            </group>
          </group>
        </group>
      ))}
    </>
  )
}

// 밤에만 보이는 것: 잔디 빛, 조명 번짐, 실제 조명. 세기는 하늘의 밤 값을 매 프레임 따라갑니다.
function NightLighting({ pitch, masts }: { pitch: Pitch; masts: StadiumSpec['masts'] }) {
  const worldW = pitch.across ? pitch.d : pitch.w
  const worldD = pitch.across ? pitch.w : pitch.d
  const w = worldW + POOL_MARGIN * 2
  const d = worldD + POOL_MARGIN * 2
  const night = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const pool = useRef<THREE.MeshBasicMaterial>(null)
  const poolMap = useMemo(() => poolTexture(pitch, masts, w, d), [pitch, masts, w, d])
  useFrame(() => {
    const k = NIGHT_UNIFORM.value
    if (night.current) night.current.visible = k > 0.001
    if (light.current) light.current.intensity = NIGHT.light * k
    if (pool.current) pool.current.opacity = NIGHT.pool * k
    haloMat.opacity = NIGHT.haloOpacity * k
    led.color.copy(ledOff).lerp(ledOn, k)
  })
  return (
    <>
      {/* 조명 개수가 밤낮으로 바뀌면 재질을 다시 만들어 끊기므로 낮에는 세기만 0 */}
      <pointLight ref={light} position={[pitch.x, NIGHT.lightY, pitch.z]} color={COLOR.light} intensity={0} distance={NIGHT.lightReach} decay={1.1} />
      <group ref={night} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position={[pitch.x, 0.024, pitch.z]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial ref={pool} map={poolMap} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0} />
        </mesh>
        {masts.map((m, i) => (
          <sprite key={i} position={[m.x, MAST.h, m.z]} scale={[NIGHT.halo, NIGHT.halo, 1]} material={haloMat} />
        ))}
      </group>
    </>
  )
}

// 팀 벤치 한 동: 둥근 투명 지붕 + 금속 틀 + 플라스틱 좌석 한 줄. 앞면(+Z)이 경기장을 봅니다.
function Dugout({ spec }: { spec: StadiumSpec['dugouts'][number] }) {
  const seatMat = useMemo(() => new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.45 }), [spec.color])
  const seats = useMemo(() => Array.from({ length: SEAT.count }, (_, i) => ((i + 0.5) / SEAT.count - 0.5) * (DUGOUT.w - 0.5)), [])
  const ribs = [-0.5, -0.17, 0.17, 0.5].map((t) => t * (DUGOUT.w - 0.04))
  // 지붕: 가로로 누운 원통의 등·윗부분. 뒤쪽 아래에서 시작해 앞 위까지 덮습니다.
  const arc = { start: Math.PI * 0.28, length: Math.PI * 0.72 }
  const shellY = SHELL_R * 0.92 // 지붕 곡면의 중심 높이 = 뒷벽 높이
  return (
    <group position={[spec.x, 0, spec.z]} rotation-y={spec.rot}>
      {/* 뒷벽과 뒤 기둥 */}
      <mesh position={[0, shellY / 2, -SHELL_R + SHELL_SHIFT]} material={shell}>
        <planeGeometry args={[DUGOUT.w, shellY]} />
      </mesh>
      {ribs.map((x) => (
        <mesh key={x} position={[x, shellY / 2, -SHELL_R + SHELL_SHIFT]} material={frame}>
          <cylinderGeometry args={[0.03, 0.03, shellY, 6]} />
        </mesh>
      ))}
      <group position={[0, shellY, SHELL_SHIFT]}>
        <mesh rotation-z={Math.PI / 2} material={shell}>
          <cylinderGeometry args={[SHELL_R, SHELL_R, DUGOUT.w, 24, 1, true, arc.start, arc.length]} />
        </mesh>
        {ribs.map((x) => (
          <mesh key={x} position-x={x} rotation-y={Math.PI / 2} material={frame}>
            <torusGeometry args={[SHELL_R, 0.03, 6, 20, arc.length]} />
          </mesh>
        ))}
      </group>
      {/* 좌석을 받치는 가로대와 다리 */}
      <mesh position={[0, SEAT.h - 0.05, -0.15]} rotation-z={Math.PI / 2} material={frame}>
        <cylinderGeometry args={[0.03, 0.03, DUGOUT.w - 0.2, 8]} />
      </mesh>
      {[-0.4, 0, 0.4].map((t) => (
        <mesh key={t} position={[t * DUGOUT.w, (SEAT.h - 0.05) / 2, -0.15]} material={frame}>
          <cylinderGeometry args={[0.03, 0.03, SEAT.h - 0.05, 8]} />
        </mesh>
      ))}
      {/* 앉는 판과 등받이 */}
      <Instances limit={seats.length} material={seatMat} frames={1}>
        <boxGeometry args={[SEAT.w - 0.08, SEAT.t, SEAT.depth]} />
        {seats.map((x) => (
          <Instance key={x} position={[x, SEAT.h, 0]} />
        ))}
      </Instances>
      <Instances limit={seats.length} material={seatMat} frames={1}>
        <boxGeometry args={[SEAT.w - 0.08, SEAT.back, SEAT.t]} />
        {seats.map((x) => (
          <Instance key={x} position={[x, SEAT.h + SEAT.back / 2, -SEAT.depth / 2 - 0.02]} rotation={[-0.14, 0, 0]} />
        ))}
      </Instances>
    </group>
  )
}

export function CampusStadium({ pitch, stadium }: { pitch: Pitch; stadium: StadiumSpec }) {
  return (
    <>
      <FloodlightMasts pitch={pitch} masts={stadium.masts} />
      <NightLighting pitch={pitch} masts={stadium.masts} />
      {stadium.dugouts.map((d, i) => (
        <Dugout key={i} spec={d} />
      ))}
    </>
  )
}
