// Cam Study Cafe (별다방 자리) 실내: 스터디카페 사진처럼 둥근 원목 칸막이 책상(골유리·스탠드), 창가 바(펜던트 등·화분),
// 붙박이 책장(칸마다 간접등), 큰 화분 나무, 노출 덕트·트랙 조명, 글자 간판, 계단. 모든 면에 질감(studyCafeTextures)을 씌웁니다.
// 창가 바 뒤 통창은 진짜 창(CafeWindows, 실제 캠리단길이 보임)입니다.
// 칸막이 책상은 수십 개라 InstancedMesh 로 재질마다 한 번에 그립니다 (studyCafeShapes).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, ExtrudeGeometry, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape } from 'three'
import type { BufferGeometry, InstancedMesh, Material } from 'three'
import type { Box } from './layout'
import { STUDY_CAFE, wallPose } from './theme'
import type { BookWall, CeilingRun, Motto, Pot, StudyCafeDecor as DecorSpec, WindowBar } from './theme'
import { cubicleGeometries, officeChairGeometries, shellChairGeometries } from './studyCafeShapes'
import { blindTexture, booksTexture, fabricTexture, flutedTexture, glowTexture, meshTexture, mottoTexture, plasterTexture, woodTexture } from './studyCafeTextures'

// 색: 밝은 원목(칸막이·바), 진한 원목(책장 안쪽), 검은 금속, 따뜻한 불빛
const OAK = '#d2b48c'
const OAK_DARK = '#9a7652'
const BLACK = '#1d1d1f'
const WARM = '#ffd7a0'

// 재질은 처음 쓸 때 한 번 만들어 같이 씁니다 (렌더마다 새로 만들면 메모리가 샘)
const mats = new Map<string, Material>()
function mat<T extends Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined
  if (!m) {
    m = make()
    mats.set(key, m)
  }
  return m
}
const oak = () => mat('oak', () => new MeshStandardMaterial({ map: woodTexture(OAK), bumpMap: woodTexture(OAK), bumpScale: 0.6, roughness: 0.62 }))
const oakDark = () => mat('oakDark', () => new MeshStandardMaterial({ map: woodTexture(OAK_DARK), roughness: 0.7, emissive: '#ffb468', emissiveIntensity: 0.08 }))
const black = () => mat('black', () => new MeshStandardMaterial({ color: BLACK, roughness: 0.55, metalness: 0.3, side: DoubleSide }))
const warmGlow = () => mat('warm', () => new MeshStandardMaterial({ color: '#fff4e0', emissive: WARM, emissiveIntensity: 1.6 }))
const pool = () => mat('pool', () => new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending }))
const fluted = () => mat('fluted', () => new MeshStandardMaterial({ map: flutedTexture(), roughness: 0.35, transparent: true, opacity: 0.88, emissive: '#fff2dc', emissiveIntensity: 0.12 }))
const fabric = (color: string) => mat(`fabric|${color}`, () => new MeshStandardMaterial({ map: fabricTexture('#ffffff'), bumpMap: fabricTexture('#808080'), bumpScale: 1.2, color, roughness: 0.95, side: DoubleSide }))
const mesh = () => mat('mesh', () => new MeshStandardMaterial({ map: meshTexture(), roughness: 0.8 }))
const plaster = (color: string) => mat(`plaster|${color}`, () => new MeshStandardMaterial({ map: plasterTexture(color, { x: 2, y: 2 }), roughness: 0.95 }))

// ── 칸막이 책상: 자리마다 같은 도형을 위치·방향만 바꿔 찍습니다 ──
function Instanced({ geometry, material, seats }: { geometry: BufferGeometry; material: Material; seats: { x: number; z: number; rot: number }[] }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new Object3D()
    seats.forEach((s, i) => {
      o.position.set(s.x, 0, s.z)
      o.rotation.set(0, s.rot, 0)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere() // 화면 밖 판정이 첫 자리 하나 기준이 되지 않게
  }, [seats])
  return <instancedMesh ref={ref} args={[geometry, material, seats.length]} key={seats.length} />
}

export function Cubicles({ seats }: { seats: { x: number; z: number; rot: number }[] }) {
  const g = cubicleGeometries()
  if (!seats.length) return null
  return (
    <group>
      <Instanced geometry={g.wood} material={oak()} seats={seats} />
      <Instanced geometry={g.glass} material={fluted()} seats={seats} />
      <Instanced geometry={g.dark} material={black()} seats={seats} />
      <Instanced geometry={g.glow} material={warmGlow()} seats={seats} />
      <Instanced geometry={g.pool} material={pool()} seats={seats} />
    </group>
  )
}

// ── 의자: 강조색(가까이·내 자리)이 자리마다 달라서 자리마다 그림 (조각을 합쳐 의자 하나 = 메시 2~3개) ──
export function OfficeChair({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const g = officeChairGeometries()
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={g.frame} material={black()} />
      <mesh geometry={g.seat} material={fabric(color)} />
      <mesh geometry={g.back} material={mesh()} />
    </group>
  )
}

export function ShellChair({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const g = shellChairGeometries()
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={g.body} material={fabric(color)} />
      <mesh geometry={g.legs} material={oak()} />
    </group>
  )
}

// ── 방 소품 ──
export function StudyCafeDecor({ decor, height }: { decor: DecorSpec; height: number }) {
  return (
    <group>
      {decor.windowBars?.map((b, i) => <WindowBarPiece key={i} bar={b} height={height} />)}
      {decor.bookWalls?.map((b, i) => <BookWallPiece key={i} wall={b} />)}
      {decor.pots?.map((p, i) => (p.tree ? <TreePot key={i} pot={p} /> : <SmallPot key={i} pot={p} />))}
      {decor.ducts?.map((d, i) => <Duct key={i} run={d} height={height} />)}
      {decor.tracks?.map((t, i) => <Track key={i} run={t} height={height} />)}
      {decor.aircons?.map((a, i) => <AirCon key={i} x={a.x} z={a.z} height={height} />)}
      {decor.mottos?.map((m, i) => <MottoSign key={i} motto={m} />)}
    </group>
  )
}

// 창가 바: 실제 통창(world.json sideWindow, CafeWindows 가 그림) 앞 벽에 붙인 원목 상판. 로컬 x 가 바 길이 방향
function WindowBarPiece({ bar, height }: { bar: WindowBar; height: number }) {
  const S = STUDY_CAFE
  const pose = wallPose(bar.x, bar.z, bar.face, 0, 0)
  const along = bar.face === 'e' || bar.face === 'w' // 바 길이가 z 쪽
  const legs = Math.max(2, Math.round(bar.len / 1.5) + 1)
  return (
    <group>
      <group position={[pose.x, 0, pose.z]} rotation-y={pose.rotY}>
        {/* 원목 상판 + 아래 어두운 앞판 + 받침 */}
        <mesh position={[0, S.barH - 0.025, 0]}>
          <boxGeometry args={[bar.len, 0.05, S.barDepth]} />
          <meshStandardMaterial map={woodTexture(OAK, { x: bar.len / 1.2, y: 1 })} roughness={0.55} />
        </mesh>
        <mesh position={[0, S.barH - 0.16, S.barDepth / 2 - 0.12]}>
          <boxGeometry args={[bar.len - 0.1, 0.22, 0.03]} />
          <primitive object={black()} attach="material" />
        </mesh>
        {/* 검은 다리: 통창이 바닥까지라 벽에 기댈 수 없어 앞쪽에 1.5m 마다 */}
        {Array.from({ length: legs }, (_, i) => (
          <mesh key={i} position={[-bar.len / 2 + 0.08 + (i * (bar.len - 0.16)) / (legs - 1), (S.barH - 0.27) / 2, S.barDepth / 2 - 0.12]}>
            <boxGeometry args={[0.04, S.barH - 0.27, 0.04]} />
            <primitive object={black()} attach="material" />
          </mesh>
        ))}
      </group>
      {/* 펜던트 등: 천장에서 줄로 내려온 검은 갓 + 따뜻한 전구, 상판에 불빛 웅덩이. 두 개에 하나만 실제 빛 (성능) */}
      {bar.lamps.map((off, i) => {
        const x = along ? bar.x : bar.x + off
        const z = along ? bar.z + off : bar.z
        const y = 1.85
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position-y={(y + height) / 2}>
              <cylinderGeometry args={[0.006, 0.006, height - y, 6]} />
              <primitive object={black()} attach="material" />
            </mesh>
            <mesh position-y={y}>
              <cylinderGeometry args={[0.04, 0.19, 0.24, 24, 1, true]} />
              <primitive object={black()} attach="material" />
            </mesh>
            <mesh position-y={y - 0.1}>
              <sphereGeometry args={[0.06, 16, 12]} />
              <primitive object={warmGlow()} attach="material" />
            </mesh>
            <mesh position-y={S.barH + 0.003} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.9, 0.9]} />
              <primitive object={pool()} attach="material" />
            </mesh>
            {i % 2 === 0 && <pointLight position-y={y - 0.2} color={WARM} intensity={1.4} distance={3.2} decay={1.6} />}
          </group>
        )
      })}
    </group>
  )
}

// 붙박이 책장: 진한 원목 뒤판(은은히 빛남) + 밝은 원목 칸 + 칸마다 책 + 선반 아래 LED 띠
const BOOK_ROWS = 5
function BookWallPiece({ wall }: { wall: BookWall }) {
  const S = STUDY_CAFE
  const pose = wallPose(wall.x, wall.z, wall.face, 0, 0.1 + S.shelfDepth / 2)
  const cols = Math.max(1, Math.round(wall.w / 0.9))
  const cw = wall.w / cols
  const rh = (S.shelfH - 0.1) / BOOK_ROWS
  const t = 0.035
  return (
    <group position={[pose.x, 0, pose.z]} rotation-y={pose.rotY}>
      <mesh position={[0, S.shelfH / 2, -S.shelfDepth / 2 + 0.01]}>
        <boxGeometry args={[wall.w, S.shelfH, 0.02]} />
        <primitive object={oakDark()} attach="material" />
      </mesh>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <mesh key={`v${i}`} position={[-wall.w / 2 + i * cw, S.shelfH / 2, 0]}>
          <boxGeometry args={[t, S.shelfH, S.shelfDepth]} />
          <primitive object={oak()} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: BOOK_ROWS + 1 }, (_, j) => (
        <group key={`h${j}`}>
          <mesh position={[0, 0.1 + j * rh, 0]}>
            <boxGeometry args={[wall.w, t, S.shelfDepth]} />
            <primitive object={oak()} attach="material" />
          </mesh>
          {j > 0 && (
            <mesh position={[0, 0.1 + j * rh - t / 2 - 0.006, S.shelfDepth / 2 - 0.05]}>
              <boxGeometry args={[wall.w - 0.05, 0.01, 0.02]} />
              <primitive object={warmGlow()} attach="material" />
            </mesh>
          )}
        </group>
      ))}
      {/* 책: 칸마다 책등 그림 한 장 (칸마다 다른 씨앗, 몇 칸은 비워 화분 자리) */}
      {Array.from({ length: cols }, (_, i) =>
        Array.from({ length: BOOK_ROWS }, (_, j) =>
          (i * 7 + j * 3) % 5 === 4 ? null : (
            <mesh key={`b${i}-${j}`} position={[-wall.w / 2 + (i + 0.5) * cw, 0.1 + j * rh + t / 2 + rh * 0.36, -S.shelfDepth / 2 + 0.1]}>
              <planeGeometry args={[cw - t - 0.04, rh * 0.72]} />
              <meshStandardMaterial map={booksTexture(3 + ((i * 5 + j * 11) % 7))} roughness={0.85} transparent alphaTest={0.1} />
            </mesh>
          ),
        ),
      )}
      {/* 빈 칸 몇 곳에 작은 화분 */}
      {Array.from({ length: cols }, (_, i) =>
        Array.from({ length: BOOK_ROWS }, (_, j) =>
          (i * 7 + j * 3) % 5 === 4 && j > 0 ? <SmallPot key={`p${i}-${j}`} pot={{ x: -wall.w / 2 + (i + 0.5) * cw, z: 0, y: 0.1 + j * rh + t / 2 }} /> : null,
        ),
      )}
    </group>
  )
}

// 큰 화분 나무: 회색 원통 화분 + 가는 줄기 + 부드러운 잎 덩어리 (사진 안쪽의 큰 나무)
const LEAF = ['#4f7a3a', '#5d8a43', '#6b9a4c', '#44702f']
function TreePot({ pot }: { pot: Pot }) {
  const R = STUDY_CAFE.potR
  const leaves = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const a = i * 2.4
        const h = 1.2 + (i % 4) * 0.22
        const r = 0.18 + (i % 3) * 0.08
        return { p: [Math.cos(a) * r, h, Math.sin(a) * r] as [number, number, number], s: 0.22 + ((i * 37) % 10) / 70, c: LEAF[i % LEAF.length] }
      }),
    [],
  )
  return (
    <group position={[pot.x, 0, pot.z]}>
      <mesh position-y={0.28}>
        <cylinderGeometry args={[R, R * 0.8, 0.56, 28]} />
        <primitive object={plaster('#9c968e')} attach="material" />
      </mesh>
      <mesh position-y={0.55}>
        <cylinderGeometry args={[R - 0.03, R - 0.03, 0.02, 24]} />
        <meshStandardMaterial color="#3b2a1d" roughness={1} />
      </mesh>
      <mesh position-y={1.0}>
        <cylinderGeometry args={[0.025, 0.04, 0.9, 8]} />
        <meshStandardMaterial color="#6b4a2e" roughness={0.9} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} scale={[l.s, l.s * 0.8, l.s]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={l.c} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// 작은 화분: 흰 화분 + 잎 몇 장 (바 위, 책장 빈 칸)
function SmallPot({ pot }: { pot: Pot }) {
  return (
    <group position={[pot.x, pot.y ?? STUDY_CAFE.barH, pot.z]}>
      <mesh position-y={0.06}>
        <cylinderGeometry args={[0.075, 0.06, 0.12, 16]} />
        <primitive object={plaster('#e9e5de')} attach="material" />
      </mesh>
      {[0, 1.3, 2.6, 3.9, 5.2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.05, 0.17 + (i % 2) * 0.03, Math.sin(a) * 0.05]} rotation={[Math.sin(a) * 0.5, a, Math.cos(a) * 0.5]} scale={[0.05, 0.11, 0.025]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color={LEAF[i % LEAF.length]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// 노출 덕트: 천장 아래 흰 원통 + 이음매 띠 + 천장에 거는 줄
function Duct({ run, height }: { run: CeilingRun; height: number }) {
  const r = 0.2
  const y = height - r - 0.12
  const joints = Math.floor(run.len / 1.5)
  return (
    <group position={[run.x, y, run.z]} rotation-y={run.rot}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[r, r, run.len, 24]} />
        <primitive object={plaster('#e6e2db')} attach="material" />
      </mesh>
      {Array.from({ length: joints }, (_, i) => (
        <group key={i} position-z={-run.len / 2 + (i + 0.5) * (run.len / joints)}>
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[r + 0.012, r + 0.012, 0.05, 24]} />
            <meshStandardMaterial color="#d4cfc6" roughness={0.6} />
          </mesh>
          <mesh position-y={(r + 0.12) / 2}>
            <boxGeometry args={[0.02, r + 0.12, 0.02]} />
            <primitive object={black()} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 트랙 조명: 천장 검은 레일 + 아래를 비스듬히 비추는 스포트 등 (빛나는 면만, 실제 빛은 없음)
function Track({ run, height }: { run: CeilingRun; height: number }) {
  const n = Math.max(2, Math.round(run.len / 1.1))
  return (
    <group position={[run.x, height - 0.03, run.z]} rotation-y={run.rot}>
      <mesh>
        <boxGeometry args={[0.04, 0.04, run.len]} />
        <primitive object={black()} attach="material" />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[0, -0.1, -run.len / 2 + (i + 0.5) * (run.len / n)]} rotation-x={i % 2 ? 0.35 : -0.35}>
          <mesh>
            <cylinderGeometry args={[0.045, 0.045, 0.13, 16]} />
            <primitive object={black()} attach="material" />
          </mesh>
          <mesh position-y={-0.066} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.035, 16]} />
            <primitive object={warmGlow()} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 천장형 에어컨: 흰 네모 판 + 가운데 흡입구 + 네 변 바람 구멍
function AirCon({ x, z, height }: { x: number; z: number; height: number }) {
  return (
    <group position={[x, height - 0.04, z]}>
      <mesh>
        <boxGeometry args={[0.9, 0.08, 0.9]} />
        <meshStandardMaterial color="#f1efea" roughness={0.6} />
      </mesh>
      <mesh position-y={-0.042} rotation-x={Math.PI / 2}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial map={blindTexture()} color="#d9d6d0" side={DoubleSide} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.sin((k * Math.PI) / 2) * 0.36, -0.042, Math.cos((k * Math.PI) / 2) * 0.36]} rotation-y={(k * Math.PI) / 2}>
          <boxGeometry args={[0.6, 0.006, 0.05]} />
          <meshStandardMaterial color="#3d3d3d" />
        </mesh>
      ))}
    </group>
  )
}

function MottoSign({ motto }: { motto: Motto }) {
  const p = wallPose(motto.x, motto.z, motto.face, 1.55, 0.13)
  return (
    <group position={[p.x, p.y, p.z]} rotation-y={p.rotY}>
      <mesh>
        <boxGeometry args={[0.62, 0.78, 0.03]} />
        <primitive object={black()} attach="material" />
      </mesh>
      <mesh position-z={0.017}>
        <planeGeometry args={[0.56, 0.7]} />
        <meshBasicMaterial map={mottoTexture(motto.lines)} />
      </mesh>
    </group>
  )
}

// ── 계단 (두 층을 오가는 자리, box 는 지점 JSON 의 elevator 상자) ──
// 벽을 따라 긴 쪽으로 오르는 원목 디딤판 계단. 방 쪽은 흰 옆판 + 유리 난간 + 원목 손잡이(앞에 서면 강조색).
// up: 남쪽(+z) 끝에서 북쪽으로 올라 천장 구멍으로 이어짐. down: 바닥에 뚫린 계단 구멍(북쪽 끝이 입구) + 유리 난간.
const STAIR_STEPS = 15
const RAIL_H = 0.95
export function Staircase({ box, height, dir, near, nearColor }: { box: Box; height: number; dir: 'up' | 'down'; near: boolean; nearColor: string }) {
  const alongZ = box.d >= box.w
  const L = alongZ ? box.d : box.w // 오르는 길이
  const W = alongZ ? box.w : box.d // 계단 폭
  // 로컬 z = 오르는 방향의 반대(+z 가 낮은 끝), 로컬 +x = 방 쪽
  const roomSide = alongZ ? (box.x < 0 ? 1 : -1) : box.z < 0 ? -1 : 1
  const rotY = alongZ ? 0 : Math.PI / 2
  const tread = L / STAIR_STEPS
  const rise = height / STAIR_STEPS
  const railColor = near ? nearColor : '#ffffff' // 원목 손잡이: 앞에 서면 강조색으로 물듦
  // 방 쪽 옆판(계단 아래를 막는 흰 삼각판)과 유리 난간은 (z, y) 평면 모양을 x 두께로 뽑습니다
  const { side, glass, railLen, railAngle } = useMemo(() => {
    const sideShape = new Shape()
    sideShape.moveTo(L / 2, 0)
    sideShape.lineTo(L / 2, rise)
    sideShape.lineTo(-L / 2, height)
    sideShape.lineTo(-L / 2, 0)
    sideShape.closePath()
    const glassShape = new Shape()
    glassShape.moveTo(L / 2, rise + 0.08)
    glassShape.lineTo(-L / 2, height + 0.08)
    glassShape.lineTo(-L / 2, height + RAIL_H)
    glassShape.lineTo(L / 2, rise + RAIL_H)
    glassShape.closePath()
    const toZ = (g: ExtrudeGeometry) => g.rotateY(-Math.PI / 2) // 모양 x → 월드 z
    return {
      side: toZ(new ExtrudeGeometry(sideShape, { depth: 0.04, bevelEnabled: false })),
      glass: toZ(new ExtrudeGeometry(glassShape, { depth: 0.012, bevelEnabled: false })),
      railLen: Math.hypot(L, height - rise),
      railAngle: Math.atan2(height - rise, L),
    }
  }, [L, height, rise])
  const sx = (roomSide * W) / 2
  return (
    <group position={[box.x, 0, box.z]} rotation-y={rotY}>
      {dir === 'up' ? (
        <>
          {Array.from({ length: STAIR_STEPS }, (_, i) => (
            <mesh key={i} position={[0, (i + 1) * rise - 0.03, L / 2 - (i + 0.5) * tread]}>
              <boxGeometry args={[W, 0.06, tread + 0.03]} />
              <primitive object={oak()} attach="material" />
            </mesh>
          ))}
          <mesh geometry={side} position-x={sx + 0.02}>
            <primitive object={plaster('#efebe4')} attach="material" />
          </mesh>
          <mesh geometry={glass} position-x={sx + 0.006}>
            <meshStandardMaterial color="#d8ecef" transparent opacity={0.28} roughness={0.1} metalness={0.1} side={DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[sx, (rise + height) / 2 + RAIL_H, 0]} rotation-x={railAngle}>
            <boxGeometry args={[0.05, 0.04, railLen]} />
            <meshStandardMaterial map={woodTexture(OAK_DARK)} color={railColor} roughness={0.5} />
          </mesh>
          {/* 천장 구멍 (위층으로 이어짐): 어두운 판 + 원목 테 */}
          <mesh position={[0, height - 0.005, -L / 4]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[W, L / 2]} />
            <meshBasicMaterial color="#2a241e" side={DoubleSide} />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[0, height - 0.04, -L / 4 + (k * L) / 4]}>
              <boxGeometry args={[W + 0.08, 0.08, 0.06]} />
              <primitive object={oak()} attach="material" />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* 바닥 구멍: 북쪽(-z) 끝이 입구. 남쪽으로 갈수록 깊어져 어두운 디딤판 */}
          <mesh position-y={0.003} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[W, L]} />
            <meshBasicMaterial color="#201b16" />
          </mesh>
          {Array.from({ length: Math.ceil(STAIR_STEPS * 0.6) }, (_, i) => {
            const k = 1 - i / (STAIR_STEPS * 0.6)
            return (
              <mesh key={i} position={[0, 0.005, -L / 2 + (i + 0.5) * tread]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[W - 0.06, tread * 0.85]} />
                <meshBasicMaterial map={woodTexture(OAK)} color={`rgb(${Math.round(210 * k)},${Math.round(180 * k)},${Math.round(140 * k)})`} />
              </mesh>
            )
          })}
          {/* 방 쪽과 남쪽 끝 유리 난간 + 원목 손잡이 */}
          {[
            { p: [sx, RAIL_H / 2, 0], len: L, r: Math.PI / 2 },
            { p: [0, RAIL_H / 2, L / 2], len: W, r: 0 },
          ].map((g, i) => (
            <group key={i} position={g.p as [number, number, number]} rotation-y={g.r}>
              <mesh>
                <boxGeometry args={[g.len, RAIL_H - 0.05, 0.012]} />
                <meshStandardMaterial color="#d8ecef" transparent opacity={0.28} roughness={0.1} side={DoubleSide} depthWrite={false} />
              </mesh>
              <mesh position-y={RAIL_H / 2}>
                <boxGeometry args={[g.len, 0.04, 0.05]} />
                <meshStandardMaterial map={woodTexture(OAK_DARK)} color={railColor} roughness={0.5} />
              </mesh>
            </group>
          ))}
          {/* 구멍 아래로 보이는 1층 불빛 */}
          <pointLight position={[0, -0.4, 0]} color={WARM} intensity={1.2} distance={3} />
        </>
      )}
    </group>
  )
}
