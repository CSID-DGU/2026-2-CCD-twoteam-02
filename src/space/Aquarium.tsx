// 물결 라운지 가운데: 천장까지 이어지는 원통 어항을 둘러싼 원형 바 (사용자 참고 사진: 어항 둘레 바와 하이스툴).
// 어두운 나무 몸통 + 어두운 돌 상판, 상판 아래 따뜻한 빛 띠, 어항 안 바위 기둥, 위에 큰 원통과 차가운 빛 고리. 자리(하이스툴)는 stream.json 25~32번.
// 가볍게: 새 조명 없음. 어항 안쪽 면은 빛 계산 없는 그림(meshBasic)이고, 물고기·수초·바위는 InstancedMesh 라 그리기 호출이 몇 번뿐입니다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, CanvasTexture, Color, InstancedMesh, LatheGeometry, Object3D, SRGBColorSpace, Vector2 } from 'three'
import type { Aquarium as AquariumSpec } from './theme'
import { AQUARIUM, FISH_COUNT, fishPose } from './aquariumLogic'

const FISH_COLORS = ['#f2a65a', '#fff3d6', '#ef8a6b', '#f6d27a']
const PLANT_COUNT = 7
const ROCK_COUNT = 12
const WOOD = '#3a2c22'
const BAR_TOP_COLOR = '#1f2a26' // 어두운 돌 상판
const BAR_T = 0.06 // 상판 두께
const BODY_IN = 0.3 // 몸통이 상판보다 안으로 들어간 거리 (발 둘 자리)
const CAP_OVER = 0.28 // 위 원통이 어항보다 넓은 정도
const dummy = new Object3D()

// 어항 안쪽 면: 위는 밝고 아래는 깊은 청록 + 위에서 내려오는 빛줄기
let tankTex: CanvasTexture | null = null
function tankTexture() {
  if (tankTex) return tankTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#8fdde2')
  grad.addColorStop(0.45, '#3fa3b5')
  grad.addColorStop(1, '#14586c')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 14; i++) {
    const x = (i * 37) % 256
    const w = 6 + (i % 4) * 5
    const ray = g.createLinearGradient(0, 0, 0, 200)
    ray.addColorStop(0, 'rgba(255,255,255,0.18)')
    ray.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = ray
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + w, 0)
    g.lineTo(x + w * 2.2, 200)
    g.lineTo(x - w, 200)
    g.fill()
  }
  tankTex = new CanvasTexture(c)
  tankTex.colorSpace = SRGBColorSpace
  return tankTex
}

function Fish() {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(() => {
    // 코 → 몸통 → 꼬리 옆모습을 돌려 만들고 좌우로 납작하게. 앞이 +z
    const pts = [[0, 0.11], [0.03, 0.08], [0.05, 0.02], [0.035, -0.05], [0.008, -0.09], [0.04, -0.14], [0, -0.145]].map(([r, y]) => new Vector2(r, y))
    const g = new LatheGeometry(pts, 8)
    g.rotateX(Math.PI / 2)
    g.scale(0.55, 1.15, 1.25)
    return g
  }, [])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const col = new Color()
    for (let i = 0; i < FISH_COUNT; i++) m.setColorAt(i, col.set(FISH_COLORS[i % FISH_COLORS.length]))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < FISH_COUNT; i++) {
      const p = fishPose(i, clock.elapsedTime)
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(0, p.yaw, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[geo, undefined, FISH_COUNT]} frustumCulled={false}>
      <meshStandardMaterial roughness={0.5} />
    </instancedMesh>
  )
}

// 수초: 가는 원뿔 여러 개 (움직이지 않음)
function Plants() {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const col = new Color()
    for (let i = 0; i < PLANT_COUNT; i++) {
      const a = i * 2.399
      const R = 0.55 + ((i * 0.37) % 1) * 0.35
      const h = 0.35 + ((i * 0.61) % 1) * 0.45
      dummy.position.set(Math.cos(a) * R, AQUARIUM.barTop + 0.08 + h / 2, Math.sin(a) * R)
      dummy.rotation.set(0, a, ((i % 3) - 1) * 0.08)
      dummy.scale.set(1, h, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, col.set(i % 2 ? '#4f9a63' : '#3b7d57'))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PLANT_COUNT]}>
      <coneGeometry args={[0.04, 1, 5]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  )
}

// 어항 가운데 바위 기둥: 다면체를 위로 갈수록 작게 쌓음
function Rocks() {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const col = new Color()
    const bottom = AQUARIUM.barTop + 0.1
    const top = AQUARIUM.cap - 0.2
    for (let i = 0; i < ROCK_COUNT; i++) {
      const k = i / (ROCK_COUNT - 1)
      const a = i * 2.399
      const off = 0.1 * (1 - k * 0.5)
      dummy.position.set(Math.cos(a) * off, bottom + (top - bottom) * k, Math.sin(a) * off)
      dummy.rotation.set(i * 1.1, i * 0.7, i * 1.9)
      const s = 0.42 - k * 0.2
      dummy.scale.set(s * 1.1, s * 0.75, s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, col.set(i % 3 === 0 ? '#8f8a78' : i % 3 === 1 ? '#7d7a6a' : '#a09a86'))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ROCK_COUNT]}>
      <dodecahedronGeometry args={[1]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  )
}

export function Aquarium({ spec, height }: { spec: AquariumSpec; height: number }) {
  const A = AQUARIUM
  const tankH = A.cap - A.barTop
  return (
    <group position={[spec.x, 0, spec.z]}>
      {/* 바: 몸통 + 돌 상판 + 상판 아래 따뜻한 빛 띠 */}
      <mesh position-y={(A.barTop - BAR_T) / 2}>
        <cylinderGeometry args={[spec.barR - BODY_IN, spec.barR - BODY_IN, A.barTop - BAR_T, 48]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position-y={A.barTop - BAR_T / 2}>
        <cylinderGeometry args={[spec.barR, spec.barR, BAR_T, 56]} />
        <meshStandardMaterial color={BAR_TOP_COLOR} roughness={0.22} metalness={0.1} />
      </mesh>
      <mesh position-y={A.barTop - BAR_T - 0.012} rotation-x={Math.PI / 2}>
        <torusGeometry args={[spec.barR - 0.05, 0.012, 6, 64]} />
        <meshBasicMaterial color="#ffd9a6" />
      </mesh>
      {/* 위 원통 + 어항과 만나는 차가운 빛 고리 */}
      <mesh position-y={(A.cap + height) / 2}>
        <cylinderGeometry args={[A.r + CAP_OVER, A.r + CAP_OVER, height - A.cap, 48]} />
        <meshStandardMaterial color="#6b6358" roughness={0.9} />
      </mesh>
      <mesh position-y={A.cap - 0.012} rotation-x={Math.PI / 2}>
        <torusGeometry args={[A.r + 0.1, 0.018, 6, 56]} />
        <meshBasicMaterial color="#cfe6ff" />
      </mesh>
      {/* 물: 안쪽 면만 그림 (앞쪽이 비어 있어 안의 물고기가 보임) */}
      <mesh position-y={A.barTop + tankH / 2}>
        <cylinderGeometry args={[A.r, A.r, tankH, 40, 1, true]} />
        <meshBasicMaterial map={tankTexture()} side={BackSide} />
      </mesh>
      {/* 바닥 모래 */}
      <mesh position-y={A.barTop + 0.04}>
        <cylinderGeometry args={[A.r - 0.01, A.r - 0.01, 0.08, 32]} />
        <meshStandardMaterial color="#cfc3a4" roughness={1} />
      </mesh>
      <Rocks />
      <Plants />
      <Fish />
      {/* 앞쪽 유리: 살짝 비치는 막 */}
      <mesh position-y={A.barTop + tankH / 2}>
        <cylinderGeometry args={[A.r + 0.01, A.r + 0.01, tankH, 40, 1, true]} />
        <meshStandardMaterial color="#c8f0f2" transparent opacity={0.14} roughness={0.06} metalness={0.2} depthWrite={false} />
      </mesh>
    </group>
  )
}
