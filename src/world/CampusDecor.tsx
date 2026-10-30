// 캠빛 대학교 캠퍼스를 그리는 부품: 담쟁이 정문, 쿼드의 돗자리·빈백, 벽돌 건물 장식(흰 코니스·담쟁이·도서관 시계탑).
// 아이비리그가 떠오르는 화사한 미국 대학 느낌(설계: docs/superpowers/specs/2026-10-31-cambit-campus-design.md).
// 지금 광장 소품처럼 그림 파일 없이 코드로 그립니다. 잎처럼 여럿인 것은 drei Instances 로 한 번에 그립니다(성능).
// 담쟁이 잎은 동그라미가 아니라 끝이 뾰족한 세 갈래 잎 모양 판입니다(사용자 요구).
import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import { checkerTexture } from '../space/patternTexture'
import { GATE_POST } from './worldLogic'
import type { PlacedBuilding, PlacedGate, RestSpec } from './worldLogic'
import { colorMat } from './worldMaterials'

// 색
const C = {
  brick: '#a8473a',
  cap: '#efe9dd', // 기둥 갓돌·코니스(흰 돌)
  iron: '#2f2f33',
  ivyDark: '#2f7a3a',
  ivyLight: '#4f9c46',
  grass: '#4f9c46',
  signBg: '#1f3b2d',
  signText: '#f3e6b3',
  clockFace: '#f7f3ea',
}
// 크기 (m)
const GATE = { postH: 3.4, capT: 0.22, archTube: 0.06, signW: 2.4 }
const LEAF = 0.24 // 담쟁이 잎 한 장 크기
const WALL_H = 3.6 // 광장 건물 한 층 벽 높이 (WorldDecor 의 BUILDING_H 와 같게)
const TOWER = { w: 3, h: 5, roofH: 2.6, clockR: 0.8 }
const MAT_SIZE = { w: 1.8, d: 1.4, t: 0.03 } // 돗자리
const BEANBAG_R = 0.55
const MAT_COLORS: [string, string][] = [['#d9534f', '#f7f2ea'], ['#4a86c5', '#f7f2ea'], ['#e8b931', '#f7f2ea'], ['#5aa469', '#f7f2ea']]
const BEANBAG_COLORS = ['#f6b26b', '#c27ba0', '#ffd966', '#93c47d', '#6fa8dc', '#e06666', '#b4a7d6', '#76a5af']

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, ...extra })
const MAT = {
  brick: colorMat(C.brick),
  cap: colorMat(C.cap),
  iron: mat(C.iron, { metalness: 0.6, roughness: 0.4 }),
  ivyDark: mat(C.ivyDark, { side: THREE.DoubleSide }),
  ivyLight: mat(C.ivyLight, { side: THREE.DoubleSide }),
  grass: colorMat(C.grass),
  clockFace: colorMat(C.clockFace),
}

// 세 갈래 뾰족한 담쟁이 잎 (가운데가 길고 양옆이 짧음). 크기 1 기준, 잎자루가 (0,0)
const LEAF_GEOM = (() => {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(-0.25, 0.1, -0.5, 0.15, -0.55, 0.45) // 왼쪽 갈래 아래
  s.bezierCurveTo(-0.35, 0.45, -0.2, 0.5, -0.12, 0.62)
  s.bezierCurveTo(-0.08, 0.85, -0.02, 0.95, 0, 1) // 가운데 끝
  s.bezierCurveTo(0.02, 0.95, 0.08, 0.85, 0.12, 0.62)
  s.bezierCurveTo(0.2, 0.5, 0.35, 0.45, 0.55, 0.45) // 오른쪽 갈래
  s.bezierCurveTo(0.5, 0.15, 0.25, 0.1, 0, 0)
  const g = new THREE.ShapeGeometry(s, 4)
  g.translate(0, -0.45, 0) // 잎 가운데가 자리에 오게
  return g
})()

// 같은 배치가 매번 같게 나오는 난수 (화면을 다시 그려도 잎이 움직이지 않게)
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

type Leaf = { p: [number, number, number]; r: [number, number, number]; s: number }

// 담쟁이 잎 덩어리: 두 가지 초록으로 나눠 Instances 두 번에 그립니다.
function IvyLeaves({ leaves }: { leaves: Leaf[] }) {
  const halves = [leaves.filter((_, i) => i % 3 !== 0), leaves.filter((_, i) => i % 3 === 0)]
  return (
    <>
      {halves.map((list, k) => (
        <Instances key={k} limit={Math.max(list.length, 1)} geometry={LEAF_GEOM} material={k ? MAT.ivyLight : MAT.ivyDark}>
          {list.map((l, i) => (
            <Instance key={i} position={l.p} rotation={l.r} scale={l.s} />
          ))}
        </Instances>
      ))}
    </>
  )
}

// 벽면(가운데 x0, 바깥 면 z, 폭 w, 높이 0~h)에 잎을 흩뿌립니다. 아래가 촘촘하고 위로 갈수록 성기게(타고 오르는 모양)
function wallLeaves(rand: () => number, x0: number, zFace: number, w: number, h: number, count: number, faceRot: number): Leaf[] {
  const out: Leaf[] = []
  for (let i = 0; i < count; i++) {
    const y = h * (1 - Math.sqrt(rand())) // 아래쪽이 많게
    const x = x0 + (rand() - 0.5) * w
    out.push({ p: [x, y, zFace + 0.01 + rand() * 0.04], r: [0, faceRot, (rand() - 0.5) * 2.4], s: LEAF * (0.8 + rand() * 0.5) })
  }
  return out
}

// 정문: 벽돌 기둥 두 개(흰 갓돌) + 철제 아치 + 현판 + 기둥을 덮는 담쟁이 + 아치에서 늘어지는 덩굴 + 기둥 아래 풀숲.
// 무리는 정문 가운데에서 앞면(입장 쪽)이 +Z 가 되게 돌립니다(건물과 같은 규칙).
export function IvyGate({ gate, near }: { gate: PlacedGate; near: boolean }) {
  const { w, label } = gate.spec
  const postX = w / 2 + GATE_POST / 2
  const archR = w / 2 + GATE_POST / 2
  const sign = labelTexture(label, near ? '#7a4a12' : C.signBg, C.signText)
  const leaves = useMemo(() => {
    const rand = seeded(Math.round(gate.spec.x * 31 + gate.spec.z * 17))
    const P = GATE_POST / 2
    const out: Leaf[] = []
    for (const sx of [-1, 1]) {
      const cx = sx * postX
      // 앞·뒤·바깥 옆면
      out.push(...wallLeaves(rand, cx, P, GATE_POST, GATE.postH * 0.95, 34, 0).map((l) => ({ ...l })))
      out.push(...wallLeaves(rand, cx, P, GATE_POST, GATE.postH * 0.95, 26, Math.PI).map((l) => ({ ...l, p: [l.p[0], l.p[1], -l.p[2]] as Leaf['p'] })))
      out.push(
        ...wallLeaves(rand, 0, P, GATE_POST, GATE.postH * 0.9, 22, 0).map((l) => ({
          p: [cx + sx * (P + 0.01), l.p[1], l.p[0]] as Leaf['p'],
          r: [0, sx * (Math.PI / 2), l.r[2]] as Leaf['r'],
          s: l.s,
        })),
      )
    }
    // 아치를 따라 잎, 아치에서 늘어지는 덩굴 줄기
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI
      out.push({ p: [Math.cos(a) * archR, GATE.postH + Math.sin(a) * archR * 0.55 + (rand() - 0.5) * 0.1, 0.06 + rand() * 0.05], r: [0, 0, (rand() - 0.5) * 2.4], s: LEAF })
    }
    for (const hx of [-0.55, -0.2, 0.25, 0.6]) {
      const top = GATE.postH + Math.sqrt(Math.max(0, 1 - (hx / 1) ** 2)) * archR * 0.5
      const len = 0.8 + rand() * 0.6
      for (let k = 0; k < 7; k++) {
        out.push({ p: [hx * w * 0.5 + (rand() - 0.5) * 0.08, top - (k / 7) * len, 0.04], r: [0, 0, Math.PI + (rand() - 0.5) * 1.2], s: LEAF * 0.8 })
      }
    }
    return out
  }, [gate.spec.x, gate.spec.z, postX, archR, w])
  // 기둥 아래 풀숲 (작은 원뿔)
  const tufts = useMemo(() => {
    const rand = seeded(7 + Math.round(gate.spec.x))
    return [-1, 1].flatMap((sx) =>
      Array.from({ length: 9 }, () => [sx * postX + (rand() - 0.5) * 1.3, (rand() - 0.2) * 0.9] as [number, number]),
    )
  }, [gate.spec.x, postX])
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      {[-1, 1].map((sx) => (
        <group key={sx} position-x={sx * postX}>
          <mesh position-y={GATE.postH / 2} material={MAT.brick}>
            <boxGeometry args={[GATE_POST, GATE.postH, GATE_POST]} />
          </mesh>
          <mesh position-y={GATE.postH + GATE.capT / 2} material={MAT.cap}>
            <boxGeometry args={[GATE_POST + 0.2, GATE.capT, GATE_POST + 0.2]} />
          </mesh>
        </group>
      ))}
      {/* 철제 아치: 반원 고리를 납작하게 */}
      <mesh position-y={GATE.postH} scale={[1, 0.55, 1]} material={MAT.iron}>
        <torusGeometry args={[archR, GATE.archTube, 8, 32, Math.PI]} />
      </mesh>
      {/* 현판 (양면) */}
      {[0, Math.PI].map((ry) => (
        <mesh key={ry} position={[0, GATE.postH + archR * 0.28, ry ? -0.03 : 0.03]} rotation-y={ry}>
          <planeGeometry args={[GATE.signW, (GATE.signW * LABEL_PX.h) / LABEL_PX.w]} />
          <meshBasicMaterial map={sign} transparent />
        </mesh>
      ))}
      <IvyLeaves leaves={leaves} />
      <Instances limit={tufts.length} material={MAT.grass}>
        <coneGeometry args={[0.16, 0.5, 5]} />
        {tufts.map(([x, z], i) => (
          <Instance key={i} position={[x, 0.25, z]} />
        ))}
      </Instances>
    </group>
  )
}

// 쿼드의 체크무늬 돗자리
export function Mats({ rests }: { rests: RestSpec[] }) {
  const mats = rests.filter((r) => r.kind === 'mat')
  return (
    <group>
      {mats.map((r, i) => (
        <mesh key={i} position={[r.x, MAT_SIZE.t / 2, r.z]} rotation-y={r.rot}>
          <boxGeometry args={[MAT_SIZE.w, MAT_SIZE.t, MAT_SIZE.d]} />
          <meshStandardMaterial map={checkerTexture(MAT_COLORS[i % MAT_COLORS.length], 8, { x: 1, y: 1 })} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// 알록달록한 빈백: 눌린 공(앉는 곳) + 뒤쪽 볼록한 등받이. rot 방향(앉은 사람이 보는 쪽)이 앞
export function Beanbags({ rests }: { rests: RestSpec[] }) {
  const bags = rests.filter((r) => r.kind === 'beanbag')
  return (
    <group>
      {bags.map((r, i) => {
        const m = colorMat(BEANBAG_COLORS[i % BEANBAG_COLORS.length])
        return (
          <group key={i} position={[r.x, 0, r.z]} rotation-y={r.rot}>
            <mesh position-y={BEANBAG_R * 0.45} scale={[1, 0.5, 1]} material={m}>
              <sphereGeometry args={[BEANBAG_R, 20, 14]} />
            </mesh>
            <mesh position={[0, BEANBAG_R * 0.85, -BEANBAG_R * 0.55]} scale={[0.95, 0.75, 0.55]} material={m}>
              <sphereGeometry args={[BEANBAG_R, 20, 14]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// 캠퍼스 건물 장식: 지붕 아래 흰 코니스, 앞면 양쪽 모서리를 타고 오르는 담쟁이, 도서관이면 시계탑.
// 건물 몸체·창·문·간판은 광장과 같은 Building 이 그리고, 여기서는 그 위에 덧붙입니다.
export function CampusBuildingTrim({ b }: { b: PlacedBuilding }) {
  const sideways = b.spec.facing === 'east' || b.spec.facing === 'west'
  const w = sideways ? b.rect.d : b.rect.w
  const d = sideways ? b.rect.w : b.rect.d
  const height = WALL_H * b.floors.length
  const leaves = useMemo(() => {
    const rand = seeded(Math.round(b.spec.x * 13 + b.spec.z * 7) + 3)
    return [-1, 1].flatMap((sx) => wallLeaves(rand, sx * (w / 2 - 0.9), d / 2, 1.6, height * 0.85, 60, 0))
  }, [b.spec.x, b.spec.z, w, d, height])
  const library = b.slug === 'cambit-library'
  return (
    <group position={[b.spec.x, 0, b.spec.z]} rotation-y={b.angle}>
      <mesh position-y={height - 0.15} material={MAT.cap}>
        <boxGeometry args={[w + 0.2, 0.3, d + 0.2]} />
      </mesh>
      <IvyLeaves leaves={leaves} />
      {library && (
        // 시계탑: 지붕 위 뒤쪽 가운데. 벽돌 탑 + 흰 시계 + 뾰족한 지붕
        <group position={[0, height, -d / 4]}>
          <mesh position-y={TOWER.h / 2} material={MAT.brick}>
            <boxGeometry args={[TOWER.w, TOWER.h, TOWER.w]} />
          </mesh>
          <mesh position-y={TOWER.h + 0.1} material={MAT.cap}>
            <boxGeometry args={[TOWER.w + 0.3, 0.2, TOWER.w + 0.3]} />
          </mesh>
          <mesh position-y={TOWER.h + 0.2 + TOWER.roofH / 2} rotation-y={Math.PI / 4} material={colorMat(b.spec.roof)}>
            <coneGeometry args={[TOWER.w * 0.78, TOWER.roofH, 4]} />
          </mesh>
          <mesh position={[0, TOWER.h * 0.62, TOWER.w / 2 + 0.01]} material={MAT.clockFace}>
            <circleGeometry args={[TOWER.clockR, 32]} />
          </mesh>
          {/* 시곗바늘 (10시 10분) */}
          {[[0.55, -0.5], [0.4, 1.05]].map(([len, a], i) => (
            <mesh key={i} position={[Math.sin(a) * len * TOWER.clockR * 0.5, TOWER.h * 0.62 + Math.cos(a) * len * TOWER.clockR * 0.5, TOWER.w / 2 + 0.02]} rotation-z={-a} material={MAT.iron}>
              <boxGeometry args={[0.06, len * TOWER.clockR, 0.01]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
