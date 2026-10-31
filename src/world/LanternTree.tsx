// 캠퍼스 가운데 등불 나무 광장: 둥근 원목 화단(아래는 걸터앉는 단, 위는 흙을 담은 벽) 속 큰 나무에
// 동그란 등불이 주렁주렁 달리고, 둘레에 보송보송한 빈백이 불규칙하게 흩어져 놓입니다.
// 빈백은 공부 자리입니다(자리 계산은 worldLogic.courtyardSeats, 앉기·공부는 WorldScene 의 벤치 공부와 같음).
// 다른 소품처럼 그림 파일 없이 코드로 그리고, 여럿인 것(잎 덩어리·등불)은 drei Instances 로 한 번에 그립니다(성능).
// 빈백 천은 부클레(작은 고리 실)처럼 보이게: 캔버스로 그린 작은 점무늬를 울퉁불퉁한 결(bumpMap)로 쓰고,
// 천 표면에 부드러운 빛 번짐(sheen)을 주는 재질(MeshPhysicalMaterial)을 씁니다.
// 등불은 낮에도 은은하게, 밤에는 밝게 빛납니다(nightGlow 를 매 프레임 읽음).
// 화단은 결이 보이는 원목 판자, 줄기·가지는 세로로 갈라진 나무껍질, 잎은 둥글고 얼룩진 덩어리로 보이게
// 모두 캔버스로 그린 그림을 색(map)과 울퉁불퉁한 결(bumpMap)로 같이 씁니다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { courtyardSeats } from './worldLogic'
import type { CourtyardSpec, PlazaLayout } from './worldLogic'
import { colorMat, nightGlow } from './worldMaterials'

// 화단: 아래 앉는 단(반지름 r, 높이 seatH), 위 흙 담는 벽(반지름 r - step, 높이 wallH), 세로 판자 줄 수
const PLANTER = { seatH: 0.45, step: 0.6, wallH: 0.95, plank: 0.28, rim: 0.05, wood: '#c98d55', soil: '#3b2a1d' }
// 나무: 줄기 높이·굵기, 큰 가지 수, 잎 덩어리 수, 등불 수 (많을수록 무거움)
const TREE = { trunkH: 3.3, trunkR: 0.3, branches: 7, leaves: 46, lanterns: 44, bark: '#9a7a62', leaf: '#3c6b34', leafLight: '#5a8a45' }
const LANTERN = { r: 0.24, squash: 0.78, color: '#fff1cf', dayGlow: 0.5, nightGlow: 2.2 }
// 등불 재질 (모든 등불이 같이 씀). 세기는 LanternTree 가 매 프레임 밤낮에 맞춰 바꿈 (worldMaterials 의 가로등 재질과 같은 방식)
const LANTERN_MAT = new THREE.MeshStandardMaterial({ color: LANTERN.color, emissive: LANTERN.color, emissiveIntensity: LANTERN.dayGlow })
const LIGHT = { intensity: 6, distance: 11 } // 밤에 나무 둘레를 비추는 빛 (세 개)
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

// ── 캔버스 무늬 (한 번 그려 같이 씀) ────────────────────────────────
const patterns = new Map<string, THREE.CanvasTexture>()
function pattern(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void, repeat: [number, number]) {
  const k = `${key}|${repeat.join(',')}`
  let t = patterns.get(k)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!, seeded(key.length * 97 + 13))
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
    patterns.set(k, t)
  }
  return t
}
const PLANK_PX = 64 // 판자 한 장 폭(픽셀). 그림 한 장에 판자 8장
// 원목 판자: 판자마다 밝기를 조금씩 달리하고, 판자 사이 어두운 틈 + 물결치는 세로 나뭇결
function drawPlanks(ctx: CanvasRenderingContext2D, rand: () => number) {
  const { width: w, height: h } = ctx.canvas
  for (let x = 0; x < w; x += PLANK_PX) {
    const v = Math.round(215 + rand() * 40)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(x, 0, PLANK_PX, h)
    ctx.strokeStyle = 'rgba(90,60,30,0.35)'
    ctx.lineWidth = 1
    for (let g = 0; g < 7; g++) {
      const gx = x + 6 + rand() * (PLANK_PX - 12)
      ctx.beginPath()
      for (let y = 0; y <= h; y += 8) ctx.lineTo(gx + Math.sin(y / 18 + g) * 2.5, y)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(60,35,15,0.75)' // 판자 사이 틈
    ctx.fillRect(x, 0, 2, h)
  }
}
// 나무껍질: 세로로 길게 갈라진 밝고 어두운 줄
function drawBark(ctx: CanvasRenderingContext2D, rand: () => number) {
  const { width: w, height: h } = ctx.canvas
  ctx.fillStyle = '#c8c8c8'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) {
    const v = Math.round(110 + rand() * 120)
    ctx.strokeStyle = `rgb(${v},${v},${v})`
    ctx.lineWidth = 1 + rand() * 3
    const x = rand() * w
    const y = rand() * h
    const len = 20 + rand() * 70
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + (rand() - 0.5) * 6, y + len / 3, x + (rand() - 0.5) * 6, y + (len * 2) / 3, x + (rand() - 0.5) * 4, y + len)
    ctx.stroke()
  }
}
// 잎 덩어리: 밝은 잎·그늘진 잎이 얼룩진 무늬
function drawLeaves(ctx: CanvasRenderingContext2D, rand: () => number) {
  const { width: w, height: h } = ctx.canvas
  ctx.fillStyle = '#c4c4c4'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 900; i++) {
    const v = Math.round(130 + rand() * 125)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.beginPath()
    ctx.ellipse(rand() * w, rand() * h, 3 + rand() * 5, 2 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
}
const texMats = new Map<string, THREE.MeshStandardMaterial>()
// 무늬를 색(map)과 결(bumpMap)로 같이 쓰는 재질 (key 마다 하나)
function texMat(key: string, color: string, tex: THREE.Texture, bump: number, roughness: number) {
  let m = texMats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: tex, bumpMap: tex, bumpScale: bump, roughness })
    texMats.set(key, m)
  }
  return m
}
// 원통 둘레 길이에 맞춰 판자가 PLANTER.plank 폭으로 보이게 반복 수를 정함
const woodMat = (radius: number, height: number) =>
  texMat(
    `wood|${radius}|${height}`,
    PLANTER.wood,
    pattern('planks', PLANK_PX * 8, 256, drawPlanks, [(Math.PI * 2 * radius) / (PLANTER.plank * 8), height]),
    1.5,
    0.7,
  )
const barkMat = () => texMat('bark', TREE.bark, pattern('bark', 256, 256, drawBark, [2, 2]), 4, 0.95)
const leafMat = (light: boolean) => texMat(`leaf|${light}`, light ? TREE.leafLight : TREE.leaf, pattern('leaves', 256, 256, drawLeaves, [2, 2]), 3, 0.9)

// 두 점 사이를 잇는 원기둥(가지)의 위치·회전
function between(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return { mid: a.clone().add(b).multiplyScalar(0.5), q, len }
}

export function LanternCourtyard({ courtyard }: { courtyard: CourtyardSpec }) {
  return (
    <group>
      <group position={[courtyard.x, 0, courtyard.z]}>
        <Planter r={courtyard.r} />
        <LanternTree seed={7} />
      </group>
      <FluffyBeanbags courtyard={courtyard} />
    </group>
  )
}

// 둥근 원목 화단: 두 단 원통(결이 보이는 판자) + 위 모서리를 둥글게 감싼 테 + 흙
function Planter({ r }: { r: number }) {
  const P = PLANTER
  const inner = r - P.step
  return (
    <group>
      <mesh position-y={P.seatH / 2} material={woodMat(r, P.seatH)}>
        <cylinderGeometry args={[r, r, P.seatH, 72]} />
      </mesh>
      <mesh position-y={P.wallH / 2} material={woodMat(inner, P.wallH)}>
        <cylinderGeometry args={[inner, inner, P.wallH, 72]} />
      </mesh>
      {/* 모서리를 둥글게: 두 단 위 가장자리에 둥근 원목 테 */}
      {[
        [r, P.seatH],
        [inner, P.wallH],
      ].map(([rad, y]) => (
        <mesh key={rad} position-y={y} rotation-x={Math.PI / 2} material={woodMat(rad, P.seatH)}>
          <torusGeometry args={[rad - P.rim * 0.4, P.rim, 10, 96]} />
        </mesh>
      ))}
      <mesh position-y={P.wallH + 0.001} rotation-x={-Math.PI / 2} material={colorMat(P.soil)}>
        <circleGeometry args={[inner - 0.08, 48]} />
      </mesh>
    </group>
  )
}

// 큰 나무 + 등불. 줄기 위에서 가지가 사방으로 뻗고, 가지 끝 둘레에 잎 덩어리, 가지 사이에 등불이 매달림
function LanternTree({ seed }: { seed: number }) {
  const T = TREE
  const shape = useMemo(() => {
    const rand = seeded(seed)
    const base = new THREE.Vector3(0, PLANTER.wallH + T.trunkH, 0)
    const limbs: { mid: THREE.Vector3; q: THREE.Quaternion; len: number; r: number }[] = []
    const tips: THREE.Vector3[] = []
    for (let i = 0; i < T.branches; i++) {
      const a = (i / T.branches) * Math.PI * 2 + rand() * 0.5
      const tip = new THREE.Vector3(Math.sin(a) * (2.8 + rand() * 1.2), base.y + 2.6 + rand() * 1.4, Math.cos(a) * (2.8 + rand() * 1.2))
      limbs.push({ ...between(base, tip), r: 0.13 })
      tips.push(tip)
      // 끝에서 갈라지는 작은 가지 둘
      for (const turn of [-0.5, 0.5]) {
        const b = a + turn
        const end = new THREE.Vector3(tip.x + Math.sin(b) * 1.3, tip.y + 0.8 + rand() * 0.6, tip.z + Math.cos(b) * 1.3)
        limbs.push({ ...between(tip, end), r: 0.06 })
        tips.push(end)
      }
    }
    // 잎 덩어리: 가지 끝 둘레에 흩뿌림
    const leaves = Array.from({ length: T.leaves }, (_, i) => {
      const t = tips[i % tips.length]
      return {
        p: [t.x + (rand() - 0.5) * 2.2, t.y + (rand() - 0.2) * 1.2, t.z + (rand() - 0.5) * 2.2] as [number, number, number],
        s: 0.9 + rand() * 0.7,
        light: rand() < 0.35,
      }
    })
    // 등불: 줄기에서 반지름 1.2~5.2, 높이 화단 위 2.6~6 사이 (줄기·가지와 너무 붙지 않게 바깥쪽)
    const lanterns = Array.from({ length: T.lanterns }, () => {
      const a = rand() * Math.PI * 2
      const d = 1.2 + rand() * 4
      return [Math.sin(a) * d, PLANTER.wallH + 2.6 + rand() * 3.4, Math.cos(a) * d] as [number, number, number]
    })
    return { limbs, leaves, lanterns }
  }, [seed, T.branches, T.leaves, T.lanterns, T.trunkH])

  // 등불은 낮에도 은은하게, 밤에는 밝게 (재질은 파일 위쪽 LANTERN_MAT 하나를 같이 씀). 빛 세 개도 같이
  const lights = useRef<(THREE.PointLight | null)[]>([])
  useFrame(() => {
    const g = nightGlow()
    LANTERN_MAT.emissiveIntensity = LANTERN.dayGlow + (LANTERN.nightGlow - LANTERN.dayGlow) * g
    for (const l of lights.current) if (l) l.intensity = LIGHT.intensity * g
  })

  const bark = barkMat()
  return (
    <group>
      {/* 줄기 (아래가 굵음) + 기대어 받친 나무 버팀목 둘 */}
      <mesh position-y={PLANTER.wallH + T.trunkH / 2} material={bark}>
        <cylinderGeometry args={[T.trunkR * 0.75, T.trunkR, T.trunkH, 20]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.45, PLANTER.wallH + 0.7, 0.15]} rotation-z={sx * 0.35} material={woodMat(0.1, 1.5)}>
          <boxGeometry args={[0.08, 1.5, 0.08]} />
        </mesh>
      ))}
      {shape.limbs.map((l, i) => (
        <mesh key={i} position={l.mid} quaternion={l.q} material={bark}>
          <cylinderGeometry args={[l.r * 0.7, l.r, l.len, 10]} />
        </mesh>
      ))}
      {/* 잎 덩어리: 짙은 초록·밝은 초록 두 가지. 둥글게 보이게 잘게 나눈 공 + 얼룩진 잎 무늬 */}
      {[false, true].map((light) => (
        <Instances key={String(light)} limit={T.leaves} material={leafMat(light)}>
          <sphereGeometry args={[1, 20, 14]} />
          {shape.leaves
            .filter((f) => f.light === light)
            .map((f, i) => (
              <Instance key={i} position={f.p} scale={[f.s, f.s * 0.7, f.s]} />
            ))}
        </Instances>
      ))}
      {/* 등불: 납작한 공 + 위로 가는 줄 */}
      <Instances limit={T.lanterns} material={LANTERN_MAT}>
        <sphereGeometry args={[LANTERN.r, 16, 12]} />
        {shape.lanterns.map((p, i) => (
          <Instance key={i} position={p} scale={[1, LANTERN.squash, 1]} />
        ))}
      </Instances>
      <Instances limit={T.lanterns} material={colorMat('#2a2a2a')}>
        <boxGeometry args={[0.01, 0.5, 0.01]} />
        {shape.lanterns.map((p, i) => (
          <Instance key={i} position={[p[0], p[1] + LANTERN.r + 0.22, p[2]]} />
        ))}
      </Instances>
      {/* 밤에 나무 둘레를 비추는 따뜻한 빛 셋 (낮에는 0) */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <pointLight
            key={i}
            ref={(el) => {
              lights.current[i] = el
            }}
            position={[Math.sin(a) * 2.5, PLANTER.wallH + 3.6, Math.cos(a) * 2.5]}
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
