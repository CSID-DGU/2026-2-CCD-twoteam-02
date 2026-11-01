// 루프탑 카페 그리기 (이끼 루프탑, theme.rooftop). 지점 화면(BranchScene)과 광장의 건물 지붕(world/RoofDeck)이 같이 씁니다.
// 천장·벽·실내 조명 대신: 원목 데크, 콘크리트 + 유리 난간, 앞 난간 바(하이스툴), 퍼걸러 아래 바 카운터(아래 간접등·라탄 펜던트),
// 캔들 테이블(라탄 의자), 전구를 감은 화분 나무, 화분, 지그재그 전구줄.
// 하늘·햇빛은 바깥(world/RooftopWorld)이 비추고, 여기 불빛(전구·캔들·펜던트·간접등)은 해 질 녘부터 밝아집니다(glowOf).
// 자리 위치·각도 규칙은 다른 지점과 같습니다(spotsOf: 의자는 책상 반대쪽, rot 은 책상을 보는 방향). 계산은 rooftopLogic.ts
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import type { BranchLayout } from './layout'
import { spotsOf } from './layout'
import type { Spot } from './layout'
import { ROOFTOP, TALL_STOOL_LEG } from './theme'
import type { Rooftop } from './theme'
import { TREE, candleTables, glowOf, pergolaSlats, treeLights } from './rooftopLogic'
import { woodTexture } from './studyCafeTextures'
import { MY_SEAT_COLOR } from './MySeatMarker'
import { Staircase } from './StudyCafeDecor'
import { MAT, nightGlow } from '../world/worldMaterials'
import { STRING, stringBulbs, wirePoint } from '../world/streetLightLogic'

const HIGHLIGHT = '#f59e0b' // 앉을 수 있는 가까운 자리·앉은 자리 (다른 지점과 같음)
const COLOR = {
  metal: '#1f1f1f', // 다리·기둥·난간 손잡이
  glass: '#d8ecef',
  leather: '#7a4a2c', // 하이스툴 방석
  cushion: '#efe6d6', // 라탄 의자 방석
  pot: '#5b5f63',
  soil: '#3a2a1e',
  leaf: '#4f7a34',
  leafDark: '#3d6128',
  trunk: '#6b4a32',
  concreteTop: '#e6e2da',
  glow: '#ffd59a', // 불빛 색
}
const STOOL_BACK = { w: 0.34, h: 0.22, y: 0.98 } // 하이스툴 등받이 (photo: 원목 등받이)

// 불빛 재질 (캔들·랜턴 안 전구·나무 전구·바 아래 간접등). 세기는 RooftopDeck 이 매 프레임 밤 빛남으로 바꿈
const glowMat = new THREE.MeshStandardMaterial({ color: COLOR.glow, emissive: COLOR.glow, emissiveIntensity: 0.15 })

// ── 질감 (캔버스, 한 번만 그림) ──────────────────────────────

const textures = new Map<string, THREE.CanvasTexture>()
function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat: [number, number]) {
  const full = `${key}|${repeat.join(',')}`
  let tex = textures.get(full)
  if (!tex) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    draw(canvas.getContext('2d')!, size)
    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(...repeat)
    tex.anisotropy = 4
    textures.set(full, tex)
  }
  return tex
}
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// 원목 데크: x 방향으로 놓인 좁은 판(텍스처 한 장 = 2m × 2m, 판 폭 약 14cm), 판마다 색이 조금씩 다르고 사이에 어두운 틈
function deckTexture([light, dark]: [string, string], w: number, d: number) {
  return canvasTexture(`deck|${light}|${dark}`, 512, (ctx, s) => {
    const rnd = seeded(29)
    const rows = 14
    const h = s / rows
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * s * 0.6
      while (x < s) {
        const len = s * (0.45 + rnd() * 0.5)
        ctx.fillStyle = rnd() < 0.5 ? light : dark
        ctx.globalAlpha = 1
        ctx.fillRect(x, r * h, len, h)
        ctx.globalAlpha = 0.18 // 판마다 밝기 차이
        ctx.fillStyle = rnd() < 0.5 ? '#ffffff' : '#000000'
        ctx.fillRect(x, r * h, len, h)
        ctx.globalAlpha = 0.55 // 판 끝 이음매
        ctx.fillStyle = '#2a1d12'
        ctx.fillRect(x + len - 1, r * h, 2, h)
        x += len
      }
      ctx.globalAlpha = 0.07 // 결
      ctx.strokeStyle = '#2a1d12'
      for (let k = 0; k < 4; k++) {
        ctx.beginPath()
        const y = r * h + 3 + rnd() * (h - 6)
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(s * 0.3, y + rnd() * 4 - 2, s * 0.7, y + rnd() * 4 - 2, s, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.8 // 판 사이 틈
      ctx.fillStyle = '#20160e'
      ctx.fillRect(0, r * h + h - 2, s, 2)
    }
    ctx.globalAlpha = 1
  }, [w / 2, d / 2])
}

// 라탄 엮음: 엇갈린 가로·세로 가닥 + 사이 틈 (의자·소파·펜던트)
function weaveTexture(repeat: [number, number]) {
  return canvasTexture('weave', 128, (ctx, s) => {
    ctx.fillStyle = '#4a3420'
    ctx.fillRect(0, 0, s, s)
    const n = 8
    const c = s / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const across = (i + j) % 2 === 0
        const g = across ? ctx.createLinearGradient(i * c, 0, i * c + c, 0) : ctx.createLinearGradient(0, j * c, 0, j * c + c)
        g.addColorStop(0, '#a37a4c')
        g.addColorStop(0.5, '#e2c393')
        g.addColorStop(1, '#a37a4c')
        ctx.fillStyle = g
        ctx.fillRect(i * c + 1, j * c + 1, c - 2, c - 2)
      }
    }
  }, repeat)
}

// 펜던트 라탄 갓: 엮음 무늬 + 은은하게 빛남(세기는 RooftopDeck 이 밤 빛남으로). 처음 쓸 때 한 번 만듦
let lantern: THREE.MeshStandardMaterial | null = null
function lanternMat() {
  if (!lantern) lantern = new THREE.MeshStandardMaterial({ color: '#c9a06a', map: weaveTexture([3, 2]), emissive: COLOR.glow, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.9 })
  return lantern
}

// ── 큰 덩어리 ──────────────────────────────────────────────

function Deck({ w, d, colors }: { w: number; d: number; colors: [string, string] }) {
  const map = useMemo(() => deckTexture(colors, w, d), [colors, w, d])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={0.85} />
    </mesh>
  )
}

// 난간: 지점 벽(부딪힘 상자) 자리에 낮은 콘크리트 벽 + 윗면 판 + 유리 + 검은 손잡이
function Parapets({ walls, h, color }: { walls: BranchLayout['walls']; h: number; color: string }) {
  const g = ROOFTOP.glass
  return (
    <group>
      {walls.map((w, i) => (
        <group key={i} position={[w.x, 0, w.z]}>
          <mesh position-y={h / 2}>
            <boxGeometry args={[w.w, h, w.d]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          <mesh position-y={h + 0.02}>
            <boxGeometry args={[w.w + 0.04, 0.04, w.d + 0.06]} />
            <meshStandardMaterial color={COLOR.concreteTop} roughness={0.9} />
          </mesh>
          <mesh position-y={h + 0.04 + g / 2}>
            <boxGeometry args={[w.w > w.d ? w.w : 0.012, g, w.w > w.d ? 0.012 : w.d]} />
            <meshStandardMaterial color={COLOR.glass} transparent opacity={0.22} roughness={0.05} metalness={0.1} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position-y={h + 0.04 + g}>
            <boxGeometry args={[w.w > w.d ? w.w : 0.03, 0.02, w.w > w.d ? 0.03 : w.d]} />
            <meshStandardMaterial color="#6b6f74" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 앞 난간 바: 긴 원목 상판 + 검은 다리 + 작은 탁상 등 (전망 자리)
function RailBar({ bar }: { bar: Rooftop['railBar'] }) {
  const len = bar.x1 - bar.x0
  const x = (bar.x0 + bar.x1) / 2
  const R = ROOFTOP
  const top = useMemo(() => woodTexture('#9b6b45', { x: 1, y: len / 1.5 }), [len])
  const legs = Math.max(2, Math.round(len / 1.8) + 1)
  return (
    <group position={[x, 0, bar.z]}>
      <mesh position-y={R.barH - 0.025} rotation-y={Math.PI / 2}>
        <boxGeometry args={[R.barDepth, 0.05, len]} />
        <meshStandardMaterial map={top} roughness={0.6} />
      </mesh>
      {Array.from({ length: legs }, (_, i) => (
        <mesh key={i} position={[-len / 2 + 0.1 + ((len - 0.2) * i) / (legs - 1), (R.barH - 0.05) / 2, 0]}>
          <boxGeometry args={[0.05, R.barH - 0.05, R.barDepth - 0.1]} />
          <meshStandardMaterial color={COLOR.metal} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* 탁상 등: 가는 기둥 + 작은 갓, 갓 아래가 빛남 */}
      {Array.from({ length: Math.floor(len / 2.4) }, (_, i) => {
        const lx = -len / 2 + 1.2 + i * 2.4
        return (
          <group key={i} position={[lx, R.barH, R.barDepth / 2 - 0.1]}>
            <mesh position-y={0.01}>
              <cylinderGeometry args={[0.05, 0.05, 0.02, 12]} />
              <meshStandardMaterial color={COLOR.metal} />
            </mesh>
            <mesh position-y={0.14}>
              <cylinderGeometry args={[0.008, 0.008, 0.26, 6]} />
              <meshStandardMaterial color={COLOR.metal} />
            </mesh>
            <mesh position-y={0.29}>
              <cylinderGeometry args={[0.02, 0.055, 0.06, 14, 1, true]} />
              <meshStandardMaterial color={COLOR.metal} side={THREE.DoubleSide} />
            </mesh>
            <mesh position-y={0.265} material={glowMat}>
              <sphereGeometry args={[0.02, 8, 6]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// 바 카운터: 콘크리트 몸통 + 원목 상판 + 아래 간접등(자리 쪽 면) + 커피 머신·작은 화분
function Counter({ c }: { c: Rooftop['counter'] }) {
  const R = ROOFTOP
  const top = useMemo(() => woodTexture('#8a5c3a', { x: 1, y: Math.max(c.w, c.d) / 1.5 }), [c.w, c.d])
  const alongZ = c.d >= c.w
  const toward = alongZ ? (c.x > 0 ? -1 : 1) : c.z > 0 ? -1 : 1 // 자리(데크 가운데) 쪽
  const len = alongZ ? c.d : c.w
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position-y={(R.barH - 0.06) / 2}>
        <boxGeometry args={[c.w - 0.06, R.barH - 0.06, c.d - 0.06]} />
        <meshStandardMaterial color="#bdb8ae" roughness={0.95} />
      </mesh>
      <mesh position-y={R.barH - 0.03} rotation-y={alongZ ? 0 : Math.PI / 2}>
        <boxGeometry args={[alongZ ? c.w + 0.08 : c.d + 0.08, 0.06, len + 0.08]} />
        <meshStandardMaterial map={top} roughness={0.55} />
      </mesh>
      {/* 아래 간접등: 자리 쪽 면 아래 끝 빛 띠 + 바닥 빛 웅덩이 */}
      <mesh position={alongZ ? [(toward * (c.w - 0.06)) / 2 + toward * 0.01, 0.1, 0] : [0, 0.1, (toward * (c.d - 0.06)) / 2 + toward * 0.01]} material={glowMat}>
        <boxGeometry args={alongZ ? [0.02, 0.03, len - 0.1] : [len - 0.1, 0.03, 0.02]} />
      </mesh>
      <mesh position={[0, R.barH + 0.17, alongZ ? -len / 2 + 0.35 : 0]}>
        <boxGeometry args={[0.32, 0.34, 0.3]} />
        <meshStandardMaterial color="#c0c3c7" metalness={0.6} roughness={0.35} />
      </mesh>
      {[-1, 1].map((k) => (
        <group key={k} position={alongZ ? [0, R.barH, k * len * 0.3] : [k * len * 0.3, R.barH, 0]}>
          <mesh position-y={0.07}>
            <cylinderGeometry args={[0.06, 0.05, 0.14, 12]} />
            <meshStandardMaterial color="#e9e4da" />
          </mesh>
          <mesh position-y={0.2}>
            <icosahedronGeometry args={[0.1, 0]} />
            <meshStandardMaterial color={COLOR.leaf} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 퍼걸러: 검은 기둥 4개 + 위 보 + 원목 지붕살 + 덩굴 + 라탄 펜던트
function Pergola({ p }: { p: Rooftop['pergola'] }) {
  const H = ROOFTOP.pergolaH
  const slats = useMemo(() => pergolaSlats(p), [p])
  const zLen = p.z1 - p.z0
  const shade = lanternMat()
  return (
    <group>
      {[p.x0, p.x1].flatMap((x) =>
        [p.z0, p.z1].map((z) => (
          <mesh key={`${x}|${z}`} position={[x, H / 2, z]}>
            <boxGeometry args={[ROOFTOP.post, H, ROOFTOP.post]} />
            <meshStandardMaterial color={COLOR.metal} roughness={0.5} />
          </mesh>
        )),
      )}
      {[p.x0, p.x1].map((x) => (
        <mesh key={x} position={[x, H, (p.z0 + p.z1) / 2]}>
          <boxGeometry args={[0.1, 0.14, zLen + 0.3]} />
          <meshStandardMaterial color={COLOR.metal} roughness={0.5} />
        </mesh>
      ))}
      {slats.map((x, i) => (
        <mesh key={i} position={[x, H + 0.1, (p.z0 + p.z1) / 2]}>
          <boxGeometry args={[0.07, 0.06, zLen + 0.5]} />
          <meshStandardMaterial color="#a77b52" roughness={0.8} />
        </mesh>
      ))}
      {/* 지붕살에서 늘어진 덩굴 */}
      {Array.from({ length: 7 }, (_, i) => {
        const x = p.x0 + 0.2 + ((p.x1 - p.x0 - 0.4) * ((i * 5) % 7)) / 6
        const z = p.z0 + (zLen * (i + 0.5)) / 7
        const len = 0.35 + ((i * 3) % 4) * 0.12
        return (
          <mesh key={i} position={[x, H - len / 2 + 0.05, z]} rotation-x={Math.PI}>
            <coneGeometry args={[0.13, len, 6]} />
            <meshStandardMaterial color={i % 2 ? COLOR.leaf : COLOR.leafDark} flatShading />
          </mesh>
        )
      })}
      {p.lamps.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh position-y={(H + 2.15) / 2 + 0.15}>
            <cylinderGeometry args={[0.006, 0.006, H - 2.15, 4]} />
            <meshStandardMaterial color={COLOR.metal} />
          </mesh>
          {/* 라탄 갓: 둥근 바구니 모양 (아래가 뚫림) + 안 전구 */}
          <mesh position-y={2.12} scale={[1, 0.8, 1]} material={shade}>
            <sphereGeometry args={[0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
          </mesh>
          <mesh position-y={2.05} material={glowMat}>
            <sphereGeometry args={[0.06, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 화분 나무: 둥근 콘크리트 화분 + 줄기 + 가지 + 잎 덩이, 전구를 감고 작은 랜턴을 매담
function PotTree({ t }: { t: Rooftop['tree'] }) {
  const lights = useMemo(() => treeLights(), [])
  const potH = 0.55
  return (
    <group position={[t.x, 0, t.z]}>
      <mesh position-y={potH / 2}>
        <cylinderGeometry args={[t.r, t.r * 0.85, potH, 20]} />
        <meshStandardMaterial color={COLOR.pot} roughness={0.95} />
      </mesh>
      <mesh position-y={potH - 0.02}>
        <cylinderGeometry args={[t.r - 0.04, t.r - 0.04, 0.02, 20]} />
        <meshStandardMaterial color={COLOR.soil} />
      </mesh>
      <group position-y={potH}>
        <mesh position-y={TREE.trunkH / 2}>
          <cylinderGeometry args={[0.07, 0.11, TREE.trunkH, 8]} />
          <meshStandardMaterial color={COLOR.trunk} roughness={0.9} />
        </mesh>
        {[0, 2.1, 4.2].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.25, TREE.trunkH + 0.15, Math.sin(a) * 0.25]} rotation={[Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]}>
            <cylinderGeometry args={[0.03, 0.05, 0.7, 6]} />
            <meshStandardMaterial color={COLOR.trunk} />
          </mesh>
        ))}
        {[
          [0, 0, 0, 1],
          [0.55, -0.15, 0.2, 0.7],
          [-0.5, -0.1, 0.3, 0.72],
          [0.1, 0.25, -0.55, 0.68],
          [-0.2, 0.35, 0.1, 0.7],
          [0.35, 0.1, -0.35, 0.6],
        ].map(([x, y, z, s], i) => (
          <mesh key={i} position={[x, TREE.crownY + y, z]} scale={s * TREE.crownR * 0.75}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={i % 2 ? COLOR.leaf : COLOR.leafDark} flatShading roughness={0.9} />
          </mesh>
        ))}
        <Instances limit={lights.length} material={glowMat}>
          <sphereGeometry args={[0.022, 6, 4]} />
          {lights.map((l, i) => (
            <Instance key={i} position={[l.x, l.y, l.z]} />
          ))}
        </Instances>
        {/* 가지 끝에 매단 작은 유리 랜턴 */}
        {[0.6, 2.7, 4.6].map((a, i) => (
          <group key={i} position={[Math.cos(a) * 0.85, TREE.crownY - 0.95, Math.sin(a) * 0.85]}>
            <mesh position-y={0.22}>
              <cylinderGeometry args={[0.004, 0.004, 0.3, 4]} />
              <meshStandardMaterial color={COLOR.metal} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.1, 0.14, 0.1]} />
              <meshStandardMaterial color={COLOR.glass} transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <mesh material={glowMat}>
              <sphereGeometry args={[0.025, 8, 6]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

// 둥근 화분: 화분 + 잎 덩이 (큰 화분은 키 큰 잎을 더함)
function Pots({ pots }: { pots: Rooftop['pots'] }) {
  return (
    <group>
      {pots.map((o, i) => (
        <group key={i} position={[o.x, 0, o.z]}>
          <mesh position-y={0.25}>
            <cylinderGeometry args={[o.r, o.r * 0.8, 0.5, 16]} />
            <meshStandardMaterial color={i % 2 ? '#e7e2d8' : COLOR.pot} roughness={0.95} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[Math.cos(k * 2.1 + i) * o.r * 0.35, 0.62 + k * 0.08, Math.sin(k * 2.1 + i) * o.r * 0.35]} scale={o.r * (0.85 - k * 0.12)}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color={k % 2 ? COLOR.leaf : COLOR.leafDark} flatShading />
            </mesh>
          ))}
          {o.r >= 0.35 &&
            [0, 1.3, 2.6, 3.9, 5.2].map((a, k) => (
              <mesh key={`l${k}`} position={[Math.cos(a) * 0.12, 1.05, Math.sin(a) * 0.12]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]}>
                <coneGeometry args={[0.09, 0.8, 4]} />
                <meshStandardMaterial color={COLOR.leaf} flatShading side={THREE.DoubleSide} />
              </mesh>
            ))}
        </group>
      ))}
    </group>
  )
}

// 전구줄: 기둥 + 처진 줄 + 전구 (광장 전구줄과 같은 규칙·재질)
function Strings({ poles, strings }: { poles: Rooftop['poles']; strings: Rooftop['strings'] }) {
  const tubes = useMemo(
    () =>
      strings.map((w) => {
        const pts = Array.from({ length: 21 }, (_, i) => {
          const p = wirePoint(w.from, w.to, i / 20)
          return new THREE.Vector3(p.x, p.y, p.z)
        })
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.008, 4, false)
      }),
    [strings],
  )
  const bulbs = useMemo(() => stringBulbs(strings), [strings])
  return (
    <group>
      {poles.map((p, i) => (
        <mesh key={i} position={[p.x, (STRING.top + 0.1) / 2, p.z]}>
          <cylinderGeometry args={[0.03, 0.035, STRING.top + 0.1, 8]} />
          <meshStandardMaterial color={COLOR.metal} roughness={0.5} />
        </mesh>
      ))}
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={MAT.iron} />
      ))}
      <Instances limit={bulbs.length} material={MAT.bulb}>
        <sphereGeometry args={[0.045, 8, 6]} />
        {bulbs.map((b, i) => (
          <Instance key={i} position={[b.x, b.y - 0.06, b.z]} />
        ))}
      </Instances>
    </group>
  )
}

// ── 자리 ───────────────────────────────────────────────────

// 하이스툴: 검은 다리 4개 + 발 받침 고리 + 가죽 방석 + 원목 등받이 (등받이는 책상 반대쪽)
function HighStool({ s, color }: { s: Spot; color: string }) {
  const seatY = TALL_STOOL_LEG + 0.07
  return (
    <group position={[s.x, 0, s.z]} rotation-y={s.rot}>
      {[0.785, 2.356, 3.927, 5.498].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.13, seatY / 2, Math.sin(a) * 0.13]} rotation={[Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08]}>
          <cylinderGeometry args={[0.012, 0.014, seatY, 6]} />
          <meshStandardMaterial color={COLOR.metal} />
        </mesh>
      ))}
      <mesh position-y={0.3} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.15, 0.01, 6, 20]} />
        <meshStandardMaterial color={COLOR.metal} />
      </mesh>
      <mesh position-y={seatY}>
        <cylinderGeometry args={[0.19, 0.18, 0.06, 18]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, STOOL_BACK.y, -0.16]} rotation-y={Math.PI}>
        <cylinderGeometry args={[0.2, 0.2, STOOL_BACK.h, 16, 1, true, -0.75, 1.5]} />
        <meshStandardMaterial color="#5e3b22" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 0.13, (seatY + STOOL_BACK.y) / 2 + 0.02, -0.14]}>
          <boxGeometry args={[0.02, STOOL_BACK.y - seatY, 0.02]} />
          <meshStandardMaterial color={COLOR.metal} />
        </mesh>
      ))}
    </group>
  )
}

// 라탄 의자: 엮음 좌판 + 둥근 등받이 + 원목 다리 + 방석
function RattanChair({ s, color }: { s: Spot; color: string }) {
  const weave = useMemo(() => weaveTexture([2, 2]), [])
  return (
    <group position={[s.x, 0, s.z]} rotation-y={s.rot}>
      {[
        [-0.19, -0.18],
        [0.19, -0.18],
        [-0.19, 0.18],
        [0.19, 0.18],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]}>
          <cylinderGeometry args={[0.018, 0.018, 0.4, 6]} />
          <meshStandardMaterial color="#6b4a2e" />
        </mesh>
      ))}
      <mesh position-y={0.42}>
        <boxGeometry args={[0.46, 0.05, 0.44]} />
        <meshStandardMaterial map={weave} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.66, -0.02]} rotation-y={Math.PI}>
        <cylinderGeometry args={[0.25, 0.24, 0.42, 18, 1, true, -1.25, 2.5]} />
        <meshStandardMaterial map={weave} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh position-y={0.46}>
        <boxGeometry args={[0.4, 0.04, 0.38]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  )
}

// 캔들 테이블: 원목 사각 상판 + 검은 기둥 받침 + 유리 캔들
function CandleTable({ x, z }: { x: number; z: number }) {
  const top = useMemo(() => woodTexture('#a06e45'), [])
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.72}>
        <boxGeometry args={[0.78, 0.04, 0.78]} />
        <meshStandardMaterial map={top} roughness={0.6} />
      </mesh>
      <mesh position-y={0.36}>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
        <meshStandardMaterial color={COLOR.metal} />
      </mesh>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position-y={0.02} rotation-y={r + Math.PI / 4}>
          <boxGeometry args={[0.55, 0.03, 0.05]} />
          <meshStandardMaterial color={COLOR.metal} />
        </mesh>
      ))}
      <Candle y={0.74} />
    </group>
  )
}

function Candle({ y }: { y: number }) {
  return (
    <group position-y={y}>
      <mesh position-y={0.06}>
        <cylinderGeometry args={[0.045, 0.045, 0.12, 12, 1, true]} />
        <meshStandardMaterial color={COLOR.glass} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.035, 0.035, 0.06, 12]} />
        <meshStandardMaterial color="#f4ede0" />
      </mesh>
      <mesh position-y={0.085} material={glowMat}>
        <sphereGeometry args={[0.014, 8, 6]} />
      </mesh>
    </group>
  )
}

// ── 전체 ───────────────────────────────────────────────────

type Props = {
  branch: BranchLayout
  roof: Rooftop
  seat: number | null
  near: number | null
  mySeat: number | null
  nearElevator: boolean
  elevatorLabel: string | null
  glow: boolean // 실제 빛(점광원)을 낼지. 지점 화면에서만 (광장 지붕 위에서는 빛나는 재질만)
}

export function RooftopDeck({ branch, roof, seat, near, mySeat, nearElevator, elevatorLabel, glow }: Props) {
  const spots = useMemo(() => spotsOf(branch), [branch])
  const tables = useMemo(() => candleTables(branch.seats), [branch])
  const deskOf = (no: number) => branch.seats.find((s) => s.no === no)?.desk
  const colorOf = (no: number, base: string) => (no === seat || no === near ? HIGHLIGHT : no === mySeat ? MY_SEAT_COLOR : base)
  const lights = useMemo(
    () => [
      { x: (roof.pergola.x0 + roof.pergola.x1) / 2, y: 2.2, z: (roof.pergola.z0 + roof.pergola.z1) / 2, k: 1 },
      { x: roof.tree.x, y: 2.2, z: roof.tree.z, k: 0.8 },
      { x: 0, y: 2.4, z: 1.2, k: 1 },
    ],
    [roof],
  )
  const lamps = useRef<(THREE.PointLight | null)[]>([])
  // 해 질 녘부터 불빛을 밝힘 (밤 빛남은 하늘(WorldSky)이 매 프레임 정함)
  useFrame(() => {
    const g = glowOf(nightGlow())
    glowMat.emissiveIntensity = g
    lanternMat().emissiveIntensity = g * 0.25
    lights.forEach((l, i) => {
      const light = lamps.current[i]
      if (light) light.intensity = l.k * 2.2 * g
    })
  })
  return (
    <group>
      <Deck w={branch.size.w} d={branch.size.d} colors={roof.deck} />
      <Parapets walls={branch.walls} h={roof.parapet.h} color={roof.parapet.color} />
      <RailBar bar={roof.railBar} />
      <Counter c={roof.counter} />
      <Pergola p={roof.pergola} />
      <PotTree t={roof.tree} />
      <Pots pots={roof.pots} />
      <Strings poles={roof.poles} strings={roof.strings} />
      {tables.map((t) => (
        <CandleTable key={`${t.x}|${t.z}`} x={t.x} z={t.z} />
      ))}
      {spots.map((s) => {
        const desk = deskOf(s.no)
        if (desk === 'rail' || desk === 'counter') return <HighStool key={s.no} s={s} color={colorOf(s.no, COLOR.leather)} />
        if (desk === 'candle') return <RattanChair key={s.no} s={s} color={colorOf(s.no, COLOR.cushion)} />
        return null
      })}
      {branch.elevator && elevatorLabel && branch.stairs && (
        <Staircase box={branch.elevator} height={roof.parapet.h} dir={branch.stairs} near={nearElevator} nearColor={HIGHLIGHT} />
      )}
      {glow &&
        lights.map((l, i) => (
          <pointLight
            key={i}
            ref={(o) => {
              lamps.current[i] = o
            }}
            position={[l.x, l.y, l.z]} color="#ffc98a" intensity={0} distance={7} decay={2} />
        ))}
    </group>
  )
}
