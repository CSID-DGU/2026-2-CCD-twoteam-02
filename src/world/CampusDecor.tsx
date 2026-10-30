// 캠빛 대학교 캠퍼스를 그리는 부품: 담쟁이 정문, 쿼드의 돗자리·빈백, 벽돌 건물 장식(흰 코니스·담쟁이·도서관 시계탑).
// 아이비리그가 떠오르는 화사한 미국 대학 느낌(설계: docs/superpowers/specs/2026-10-31-cambit-campus-design.md).
// 지금 광장 소품처럼 그림 파일 없이 코드로 그립니다. 잎처럼 여럿인 것은 drei Instances 로 한 번에 그립니다(성능).
// 담쟁이 잎은 동그라미가 아니라 끝이 뾰족한 세 갈래 잎 모양 판입니다(사용자 요구).
import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import { checkerTexture } from '../space/patternTexture'
import { GATE_FENCE, GATE_POST } from './worldLogic'
import type { PlacedBuilding, PlacedGate, RestSpec } from './worldLogic'
import { MAT as WMAT, colorMat } from './worldMaterials'

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
// 정문 큰 기둥 높이 단(m): 흰 돌 받침 위 끝, 흰 띠 아래 끝·두께, 흰 돌 머리 아래 끝, 위 끝
const PILLAR = { base: 0.7, band: 2.6, bandT: 0.25, head: 4.0, top: 5.0 }
// 아치: 기둥 위쪽 시작 높이, 가운데가 솟는 높이, 두 줄 사이, 줄·살 굵기, 나눔 수, 글자(곡선 위 각도 범위, 한 글자 폭)
const ARCH = { base: 4.3, rise: 1.3, gap: 0.55, chordT: 0.1, barT: 0.05, segments: 28, text: 'CAMBIT UNIVERSITY', letterArc: 2.2, letterW: 0.34 }
const IRON = { h: 1.9, bar: 0.035, step: 0.16 } // 양옆 철제 울타리: 높이, 살 굵기, 간격
const END_POST = { h: 1.7, lampR: 0.22 } // 울타리 끝 작은 기둥 높이, 둥근 등 반지름
const BACKDROP = { width: 46, depth: 36, road: 4, treeX: 4.5, treeStep: 5 } // 문 너머 풍경 (m)
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

// 대학 정문 (사용자 사진 참고): 층층이 흰 돌로 마감한 높은 벽돌 기둥 두 개, 그 사이 곡선 검은 철제 트러스 아치,
// 아치를 따라 곡선으로 붙은 금색 글자 "CAMBIT UNIVERSITY", 기둥 앞 청동 명판, 양옆 창끝 철제 울타리와
// 끝의 작은 벽돌 기둥·둥근 가로등(밤에 켜짐). 기둥은 깔끔하게 두고 울타리에만 담쟁이를 조금 감습니다.
// 무리는 정문 가운데에서 앞면(입장 쪽)이 +Z 가 되게 돌립니다(건물과 같은 규칙). 문 너머(-Z)는 GateBackdrop 이 그립니다.
export function UniversityGate({ gate, near }: { gate: PlacedGate; near: boolean }) {
  const { w } = gate.spec
  const postX = w / 2 + GATE_POST / 2
  const P = PILLAR
  // 아치: 기둥 안쪽 위에서 시작해 가운데가 솟는 곡선. 아래 줄(bottom)과 위 줄(+ARCH.gap) 두 줄 + 사이 세로 살
  const arch = useMemo(() => {
    const n = ARCH.segments
    const pt = (t: number, up: number) => [Math.cos(t) * postX, ARCH.base + Math.sin(t) * ARCH.rise + up] as const
    const chords: Leaf[] = [] // 짧은 막대들 (Leaf 모양 재사용: p 위치, r 회전, s 길이)
    const bars: Leaf[] = []
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI, t1 = ((i + 1) / n) * Math.PI
      for (const up of [0, ARCH.gap]) {
        const [x0, y0] = pt(t0, up), [x1, y1] = pt(t1, up)
        chords.push({ p: [(x0 + x1) / 2, (y0 + y1) / 2, 0], r: [0, 0, Math.atan2(y1 - y0, x1 - x0)], s: Math.hypot(x1 - x0, y1 - y0) + 0.02 })
      }
      const [bx, by] = pt(t0, 0)
      if (i > 0) bars.push({ p: [bx, by + ARCH.gap / 2, 0], r: [0, 0, (i % 2 ? 1 : -1) * 0.5], s: ARCH.gap / Math.cos(0.5) })
    }
    // 글자: 아래 줄과 위 줄 사이, 곡선을 따라 한 글자씩 (가운데 정렬)
    const text = ARCH.text
    const span = ARCH.letterArc
    const letters = [...text].map((ch, i) => {
      const t = Math.PI / 2 + span / 2 - (i + 0.5) * (span / text.length)
      const [x, y] = pt(t, ARCH.gap / 2)
      return { ch, x, y, rz: t - Math.PI / 2 }
    })
    return { chords, bars, letters }
  }, [postX])
  // 철제 울타리: 기둥 바깥으로 양쪽 GATE_FENCE.len 만큼, 세로 살 + 창끝 + 위아래 가로대
  const fence = useMemo(() => {
    const bars: [number, number][] = [] // [x, 살 번호]
    for (const sx of [-1, 1]) {
      const from = w / 2 + GATE_POST
      for (let k = 0, x = from + IRON.step / 2; x < from + GATE_FENCE.len; k++, x += IRON.step) bars.push([sx * x, k])
    }
    const rand = seeded(Math.round(gate.spec.x * 3 + gate.spec.z * 5) + 11)
    // 울타리 아래쪽을 감는 담쟁이 (조금만)
    const ivy: Leaf[] = []
    for (const sx of [-1, 1]) {
      const from = w / 2 + GATE_POST
      ivy.push(
        ...wallLeaves(rand, sx * (from + GATE_FENCE.len * 0.35), 0.03, GATE_FENCE.len * 0.6, IRON.h * 0.7, 28, 0),
        ...wallLeaves(rand, sx * (from + GATE_FENCE.len * 0.6), -0.03, GATE_FENCE.len * 0.5, IRON.h * 0.6, 18, Math.PI),
      )
    }
    return { bars, ivy }
  }, [w, gate.spec.x, gate.spec.z])
  const endX = w / 2 + GATE_POST + GATE_FENCE.len + GATE_FENCE.endPost / 2
  const plaque = labelTexture('CAMBIT UNIVERSITY · 캠빛 대학교', '#5a4128', '#e9d39a')
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      {/* 큰 기둥: 흰 돌 받침 / 벽돌 / 흰 띠 / 벽돌 / 흰 돌 머리 / 갓 */}
      {[-1, 1].map((sx) => (
        <group key={sx} position-x={sx * postX}>
          <mesh position-y={P.base / 2} material={MAT.cap}>
            <boxGeometry args={[GATE_POST + 0.15, P.base, GATE_POST + 0.15]} />
          </mesh>
          <mesh position-y={(P.base + P.band) / 2} material={MAT.brick}>
            <boxGeometry args={[GATE_POST, P.band - P.base, GATE_POST]} />
          </mesh>
          <mesh position-y={P.band + P.bandT / 2} material={MAT.cap}>
            <boxGeometry args={[GATE_POST + 0.15, P.bandT, GATE_POST + 0.15]} />
          </mesh>
          <mesh position-y={(P.band + P.bandT + P.head) / 2} material={MAT.brick}>
            <boxGeometry args={[GATE_POST, P.head - P.band - P.bandT, GATE_POST]} />
          </mesh>
          <mesh position-y={(P.head + P.top) / 2} material={MAT.cap}>
            <boxGeometry args={[GATE_POST + 0.08, P.top - P.head, GATE_POST + 0.08]} />
          </mesh>
          <mesh position-y={P.top + 0.08} material={MAT.cap}>
            <boxGeometry args={[GATE_POST + 0.25, 0.16, GATE_POST + 0.25]} />
          </mesh>
          <mesh position-y={P.top + 0.26} material={MAT.cap}>
            <boxGeometry args={[GATE_POST - 0.1, 0.2, GATE_POST - 0.1]} />
          </mesh>
          {/* 청동 명판 (앞면) */}
          <mesh position={[0, P.base + 0.75, GATE_POST / 2 + 0.01]}>
            <planeGeometry args={[0.8, (0.8 * LABEL_PX.h) / LABEL_PX.w]} />
            <meshBasicMaterial map={plaque} />
          </mesh>
        </group>
      ))}
      {/* 철제 트러스 아치 */}
      <Instances limit={arch.chords.length} material={MAT.iron} frames={1}>
        <boxGeometry args={[1, ARCH.chordT, ARCH.chordT]} />
        {arch.chords.map((c, i) => (
          <Instance key={i} position={c.p} rotation={c.r} scale={[c.s, 1, 1]} />
        ))}
      </Instances>
      <Instances limit={arch.bars.length} material={MAT.iron} frames={1}>
        <boxGeometry args={[ARCH.barT, 1, ARCH.barT]} />
        {arch.bars.map((b, i) => (
          <Instance key={i} position={b.p} rotation={b.r} scale={[1, b.s, 1]} />
        ))}
      </Instances>
      {/* 금색 글자: 앞·뒤 양면 (뒤에서도 바르게 읽히게 뒷면은 순서를 뒤집어 반 바퀴) */}
      {arch.letters.map((l, i) => (
        <group key={i}>
          <mesh position={[l.x, l.y, 0.06]} rotation-z={l.rz}>
            <planeGeometry args={[ARCH.letterW, ARCH.letterW * 1.3]} />
            <meshBasicMaterial map={goldLetter(l.ch, near)} transparent depthWrite={false} />
          </mesh>
          <mesh position={[-l.x, l.y, -0.06]} rotation={[0, Math.PI, -l.rz]}>
            <planeGeometry args={[ARCH.letterW, ARCH.letterW * 1.3]} />
            <meshBasicMaterial map={goldLetter(l.ch, near)} transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* 양옆 철제 울타리: 세로 살 + 창끝 + 가로대 */}
      <Instances limit={fence.bars.length} material={MAT.iron} frames={1}>
        <boxGeometry args={[IRON.bar, IRON.h, IRON.bar]} />
        {fence.bars.map(([x], i) => (
          <Instance key={i} position={[x, IRON.h / 2, 0]} />
        ))}
      </Instances>
      <Instances limit={fence.bars.length} material={MAT.iron} frames={1}>
        <coneGeometry args={[IRON.bar * 1.6, 0.16, 4]} />
        {fence.bars.map(([x], i) => (
          <Instance key={i} position={[x, IRON.h + 0.08, 0]} />
        ))}
      </Instances>
      {[-1, 1].map((sx) =>
        [0.2, IRON.h - 0.25].map((y) => (
          <mesh key={`${sx}-${y}`} position={[sx * (w / 2 + GATE_POST + GATE_FENCE.len / 2), y, 0]} material={MAT.iron}>
            <boxGeometry args={[GATE_FENCE.len, 0.05, 0.05]} />
          </mesh>
        )),
      )}
      <IvyLeaves leaves={fence.ivy} />
      {/* 울타리 끝 작은 벽돌 기둥 + 둥근 가로등 */}
      {[-1, 1].map((sx) => (
        <group key={sx} position-x={sx * endX}>
          <mesh position-y={END_POST.h / 2} material={MAT.brick}>
            <boxGeometry args={[GATE_FENCE.endPost, END_POST.h, GATE_FENCE.endPost]} />
          </mesh>
          <mesh position-y={END_POST.h + 0.08} material={MAT.cap}>
            <boxGeometry args={[GATE_FENCE.endPost + 0.12, 0.16, GATE_FENCE.endPost + 0.12]} />
          </mesh>
          <mesh position-y={END_POST.h + 0.16 + END_POST.lampR} material={WMAT.lampGlow}>
            <sphereGeometry args={[END_POST.lampR, 16, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 금색 글자 한 자 (투명 바탕). 글자·강조 여부마다 한 번만 만듭니다.
const letterCache = new Map<string, THREE.CanvasTexture>()
function goldLetter(ch: string, near: boolean) {
  const key = `${ch}|${near}`
  let t = letterCache.get(key)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 84
    const ctx = c.getContext('2d')!
    ctx.font = '700 64px Georgia, "Times New Roman", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = near ? '#ffd27a' : '#d8b25a'
    ctx.shadowColor = 'rgba(0,0,0,.45)'
    ctx.shadowBlur = 3
    ctx.fillText(ch, 32, 46)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    letterCache.set(key, t)
  }
  return t
}

// 문 너머 풍경: 울타리 밖으로 길·잔디·가로수·가로등이 이어지고, 멀리 행선지가 보입니다.
// 정문이 세상 끝 울타리에 붙어 있어 너머가 빈 하늘이라 "떨어지는" 느낌이 났던 것을 고칩니다(사용자 피드백).
// 걸어갈 수는 없습니다(통울타리 부딪힘 그대로). 문 기준 -Z 가 너머입니다.
export function GateBackdrop({ gate }: { gate: PlacedGate }) {
  const B = BACKDROP
  const trees = useMemo(() => {
    const out: [number, number][] = []
    for (let z = -4; z > -B.depth + 4; z -= B.treeStep) for (const sx of [-1, 1]) out.push([sx * B.treeX, z])
    return out
  }, [B.depth, B.treeStep, B.treeX])
  const campus = gate.spec.to === 'campus'
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      {/* 잔디 (월드 땅보다 살짝 아래라 겹쳐도 깜빡이지 않음) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, -B.depth / 2 - 1]} material={WMAT.grass}>
        <planeGeometry args={[B.width, B.depth]} />
      </mesh>
      {/* 이어지는 길 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, -B.depth / 2]} material={WMAT.path}>
        <planeGeometry args={[B.road, B.depth]} />
      </mesh>
      {/* 가로수 (원뿔 잎 + 줄기) */}
      <Instances limit={trees.length} material={WMAT.trunk} frames={1}>
        <cylinderGeometry args={[0.15, 0.2, 1.6, 6]} />
        {trees.map(([x, z], i) => (
          <Instance key={i} position={[x, 0.8, z]} />
        ))}
      </Instances>
      <Instances limit={trees.length} material={WMAT.leaves} frames={1}>
        <coneGeometry args={[1.3, 3, 8]} />
        {trees.map(([x, z], i) => (
          <Instance key={i} position={[x, 2.9, z]} />
        ))}
      </Instances>
      {/* 길가 가로등 */}
      {[-8, -18, -28].map((z) => (
        <group key={z} position={[B.road / 2 + 0.6, 0, z]}>
          <mesh position-y={1.5} material={MAT.iron}>
            <cylinderGeometry args={[0.06, 0.06, 3, 6]} />
          </mesh>
          <mesh position-y={3.1} material={WMAT.lampGlow}>
            <sphereGeometry args={[0.2, 12, 8]} />
          </mesh>
        </group>
      ))}
      {/* 멀리 보이는 행선지: 캠퍼스면 벽돌 건물들과 시계탑, 광장이면 낮은 건물 지붕들 */}
      {campus ? (
        <group position-z={-B.depth + 2}>
          {[[-9, 9, 5], [0, 12, 6], [9, 9, 5]].map(([x, bw, bh], i) => (
            <group key={i} position-x={x}>
              <mesh position-y={bh / 2} material={MAT.brick}>
                <boxGeometry args={[bw, bh, 6]} />
              </mesh>
              <mesh position-y={bh + 0.15} material={MAT.cap}>
                <boxGeometry args={[bw + 0.2, 0.3, 6.2]} />
              </mesh>
            </group>
          ))}
          <mesh position-y={8} material={MAT.brick}>
            <boxGeometry args={[3, 6, 3]} />
          </mesh>
          <mesh position-y={12.3} rotation-y={Math.PI / 4} material={colorMat('#5a5f66')}>
            <coneGeometry args={[2.3, 2.6, 4]} />
          </mesh>
          <mesh position={[0, 9.2, 1.51]} material={MAT.clockFace}>
            <circleGeometry args={[0.8, 24]} />
          </mesh>
        </group>
      ) : (
        <group position-z={-B.depth + 2}>
          {[[-10, '#a0463c'], [-3, '#3f6e9e'], [4, '#6b8e3a'], [11, '#1f1f24']].map(([x, roof], i) => (
            <group key={i} position-x={x as number}>
              <mesh position-y={2} material={colorMat('#e8d9c4')}>
                <boxGeometry args={[6, 4, 5]} />
              </mesh>
              <mesh position-y={4.2} material={colorMat(roof as string)}>
                <boxGeometry args={[6.4, 0.4, 5.4]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
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
