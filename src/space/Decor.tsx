// 지점 테마 소품 (#57): 천장·팬·네온 띠·벽 액자·타일 카운터·스툴.
// 전부 상자·원통과 캔버스 텍스처로 만들고 외부 모델은 없습니다. 테마가 없는 지점은 아무것도 그리지 않습니다.
// 천장은 아래를 향한 한 면만 그려서, 위에서 내려다보는 2D 카메라·미니맵에서는 보이지 않고 1인칭·좌석에서만 보입니다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Path, Shape } from 'three'
import type { Group } from 'three'
import type { Box } from './layout'
import { ARCH_DOOR, BOOTH, DINER_DESK, MARBLE_TABLE, MUSHROOM, FAN, FRAME, GLOBE, LAMP, SOFA, STOOL, TALL_DESK_HEIGHT, WALL_THICKNESS, WOOD_BOOTH, WOOD_CHAIR, WOOD_DOOR, ceilingHeightOf, framePose, wallPose } from './theme'
import type { Booth, BranchTheme, FanSpot, Frame, Globe, Menu, Mushroom, RingTable as RingTableSpec, SharedTable, Shelf, Tree } from './theme'
import { POSTER_PX, checkerTexture, marbleTexture, menuTexture, signTexture, tileTexture } from './patternTexture'

const FAN_COLOR = '#3b3b3b'
const FRAME_COLOR = '#ffffff'
const STOOL_LEG_COLOR = '#c0c4cc' // 크롬
const STOOL_SEAT_COLOR = '#d9353a'
const COUNTER_TILE = { tile: '#f6f6f6', grout: '#b8b8b8', cells: 8 }
const COUNTER_BAND = { colors: ['#1a1a1a', '#f4f4f4'] as [string, string], height: 0.3 } // 몸체 아래 체크 띠
const COUNTER_TOP = { thickness: 0.08, overhang: 0.1 } // 상판 두께, 몸체보다 튀어나오는 폭
const NEON = { size: 0.04, intensity: 1.5, dropFromCeiling: 0.08 }
const COUNTER_NEON = 0.03 // 카운터 상판 가장자리 네온 두께

type Size = { w: number; d: number }

export function Decor({ theme, size }: { theme?: BranchTheme; size: Size }) {
  if (!theme) return null
  const h = ceilingHeightOf(theme)
  return (
    <group>
      {theme.ceiling && <Ceiling color={theme.ceiling.color} size={size} height={h} />}
      {theme.ceiling?.fans?.map((f, i) => <CeilingFan key={i} spot={f} height={h} />)}
      {theme.ceiling?.lamps?.map((l, i) => <PendantLamp key={i} x={l.x} z={l.z} height={h} />)}
      {theme.wall?.neon && <NeonStrip color={theme.wall.neon} size={size} height={h} />}
      {theme.frames?.map((f, i) => <WallFrame key={i} frame={f} />)}
      {theme.menu && <MenuBoard menu={theme.menu} />}
      {theme.ceiling?.grid && <CeilingGrid grid={theme.ceiling.grid} size={size} />}
      {theme.ceiling?.globes?.map((g, i) => <GlobeLamp key={i} globe={g} height={h} />)}
      {theme.tree && <OliveTree tree={theme.tree} />}
      {theme.shelves?.map((sh, i) => <WallShelf key={i} shelf={sh} />)}
      {theme.booth && theme.booths?.map((b, i) => <CircleBooth key={i} booth={b} leather={theme.booth!.leather} marble={theme.booth!.marble} />)}
      {theme.mushrooms?.map((m, i) => <MushroomLamp key={i} lamp={m} />)}
    </group>
  )
}

// 천장: 아래를 보는 평면. planeGeometry 의 앞면은 +z 라 x 축으로 +90° 돌리면 앞면이 -y(아래)를 봅니다.
function Ceiling({ color, size, height }: { color: string; size: Size; height: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
      <planeGeometry args={[size.w, size.d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

// 펜던트 조명: 천장에서 줄로 내려온 크롬 돔(아래가 열린 반구). 아랫면이 따뜻하게 빛나고 pointLight 로 주변도 비춥니다.
function PendantLamp({ x, z, height }: { x: number; z: number; height: number }) {
  const L = LAMP
  const cordH = height - L.y
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, L.y + cordH / 2, 0]}>
        <cylinderGeometry args={[L.cordR, L.cordR, cordH, 6]} />
        <meshStandardMaterial color="#9aa0aa" metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      {/* 돔: 위쪽 반구(phi 0~π/2)라 아래가 열려 있습니다 */}
      <mesh position={[0, L.y, 0]}>
        <sphereGeometry args={[L.domeR, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d8dce4" metalness={0.7} roughness={0.3} side={2} />
      </mesh>
      {/* 돔 안 전구: 빛나는 작은 구 */}
      <mesh position={[0, L.y - 0.02, 0]}>
        <sphereGeometry args={[L.domeR * 0.55, 12, 8]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={1.2} />
      </mesh>
      <pointLight position={[0, L.y - 0.1, 0]} color="#ffe2b8" intensity={L.intensity} distance={L.distance} decay={2} />
    </group>
  )
}

// 메뉴판: 벽에 붙는 큰 판 (커피 바 뒤 등)
function MenuBoard({ menu }: { menu: Menu }) {
  const p = wallPose(menu.x, menu.z, menu.face, menu.y, WALL_THICKNESS / 2 + 0.02)
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.rotY, 0]}>
      {/* 크롬 테두리 판은 글자 판보다 뒤에 둡니다. 같은 면에 두면 깜빡거립니다(z-fighting) */}
      <mesh position={[0, 0, -0.025]}>
        <boxGeometry args={[menu.w + 0.08, menu.h + 0.08, 0.03]} />
        <meshStandardMaterial color="#c8ccd4" metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[menu.w, menu.h]} />
        <meshBasicMaterial map={menuTexture({ title: menu.title, items: menu.items, bg: menu.bg, color: menu.color, w: menu.w, h: menu.h })} />
      </mesh>
    </group>
  )
}

// 천장 팬: 허브 원통에 날개 4개. 매 프레임 y 축으로 돌립니다.
function CeilingFan({ spot, height }: { spot: FanSpot; height: number }) {
  const group = useRef<Group>(null)
  const scale = spot.scale ?? 1
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += (dt * FAN.turnsPerSec * Math.PI * 2) / scale // 큰 팬은 천천히
  })
  return (
    <group ref={group} position={[spot.x, height - (FAN.hubH * scale) / 2, spot.z]} scale={scale}>
      <mesh>
        <cylinderGeometry args={[FAN.hubR, FAN.hubR, FAN.hubH, 12]} />
        <meshStandardMaterial color={FAN_COLOR} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh position={[FAN.hubR + FAN.bladeL / 2, -FAN.hubH / 2 + FAN.bladeT, 0]}>
            <boxGeometry args={[FAN.bladeL, FAN.bladeT, FAN.bladeW]} />
            <meshStandardMaterial color={FAN_COLOR} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 네온 띠: 벽 위쪽 안쪽을 따라 네 변. 후처리가 없어 번지지는 않고 그림자 없는 밝은 띠로 보입니다.
function NeonStrip({ color, size, height }: { color: string; size: Size; height: number }) {
  const y = height - NEON.dropFromCeiling
  const inset = WALL_THICKNESS / 2 + NEON.size / 2 + 0.01 // 벽 안쪽 면에서 조금 띄움
  const hx = size.w / 2 - inset
  const hz = size.d / 2 - inset
  const sides: { pos: [number, number, number]; len: number; alongX: boolean }[] = [
    { pos: [0, y, -hz], len: size.w - inset * 2, alongX: true }, // 북
    { pos: [0, y, hz], len: size.w - inset * 2, alongX: true }, // 남
    { pos: [-hx, y, 0], len: size.d - inset * 2, alongX: false }, // 서
    { pos: [hx, y, 0], len: size.d - inset * 2, alongX: false }, // 동
  ]
  return (
    <group>
      {sides.map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.alongX ? [s.len, NEON.size, NEON.size] : [NEON.size, NEON.size, s.len]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={NEON.intensity} />
        </mesh>
      ))}
    </group>
  )
}

// 벽 액자: 흰 테두리 상자 위에 포스터 판을 살짝 띄워 붙입니다.
function WallFrame({ frame }: { frame: Frame }) {
  const p = framePose(frame)
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.rotY, 0]}>
      <mesh>
        <boxGeometry args={[FRAME.w, FRAME.h, FRAME.depth]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[0, 0, FRAME.depth / 2 + 0.005]}>
        <planeGeometry args={[FRAME.inner.w, FRAME.inner.h]} />
        <meshBasicMaterial map={signTexture({ text: frame.text, bg: frame.bg, style: frame.style, sub: frame.sub })} />
      </mesh>
    </group>
  )
}

// 테마 문(아치형, #57): 아래는 문판, 위는 반원, 둘레에 크롬 기둥 둘과 반원 아치, 반원 안은 어두운 유리창,
// 문판 안쪽 면에 양철 간판 표지판. near 면 문판이 주황(기본 문과 같은 규칙).
// along: 문의 긴 쪽이 x 축(출입문, 안쪽은 -z)인지 z 축(회의실 문, 안쪽은 -x)인지. 그룹을 돌려서 안쪽이 늘 local -z 가 되게 합니다.
const CHROME = { metalness: 0.8, roughness: 0.25 }
const GLASS = { color: '#1b1726', metalness: 0.4, roughness: 0.15 }

export function ThemedDoor({
  box, height, near, nearColor, label, door, along,
}: {
  box: Box; height: number; near: boolean; nearColor: string; label: string
  door: NonNullable<BranchTheme['door']>; along: 'x' | 'z'
}) {
  if (door.style === 'wood') return <WoodDoor box={box} height={height} near={near} nearColor={nearColor} label={label} door={door} along={along} />
  const A = ARCH_DOOR
  const len = along === 'x' ? box.w : box.d // 문 너비
  const thick = along === 'x' ? box.d : box.w // 문 두께
  const r = len / 2 // 아치 반지름
  const slabH = height - r // 문판 높이 (그 위가 반원)
  const postX = len / 2 + A.frameR
  const signH = (A.signW * POSTER_PX.h) / POSTER_PX.w
  const face = thick / 2 + 0.005 // 면에서 살짝 띄우는 거리
  return (
    <group position={[box.x, 0, box.z]} rotation={[0, along === 'z' ? Math.PI / 2 : 0, 0]}>
      {/* 문판 */}
      <mesh position={[0, slabH / 2, 0]}>
        <boxGeometry args={[len, slabH, thick]} />
        <meshStandardMaterial color={near ? nearColor : door.color} metalness={0.2} roughness={0.5} />
      </mesh>
      {/* 반원 윗부분: 원통을 눕혀 축을 z 로, 각도 π/2~3π/2 만 그리면 위쪽 반이 됩니다 */}
      <mesh position={[0, slabH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, thick, 24, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={near ? nearColor : door.color} metalness={0.2} roughness={0.5} />
      </mesh>
      {/* 반원 유리창 (앞·뒤) */}
      {[face, -face].map((z, i) => (
        <mesh key={i} position={[0, slabH, z]} rotation={[0, i === 1 ? Math.PI : 0, 0]}>
          <circleGeometry args={[r * A.windowRatio, 24, 0, Math.PI]} />
          <meshStandardMaterial color={GLASS.color} metalness={GLASS.metalness} roughness={GLASS.roughness} />
        </mesh>
      ))}
      {/* 크롬 기둥 둘 + 아치 */}
      {[-postX, postX].map((x, i) => (
        <mesh key={i} position={[x, slabH / 2, 0]}>
          <cylinderGeometry args={[A.frameR, A.frameR, slabH, 12]} />
          <meshStandardMaterial color={door.chrome} metalness={CHROME.metalness} roughness={CHROME.roughness} />
        </mesh>
      ))}
      <mesh position={[0, slabH, 0]}>
        <torusGeometry args={[r + A.frameR, A.frameR, 10, 32, Math.PI]} />
        <meshStandardMaterial color={door.chrome} metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      {/* 표지판: 안쪽 면(-z) 문판 위 */}
      <mesh position={[0, A.signY, -face]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[A.signW, signH]} />
        <meshBasicMaterial map={signTexture({ text: label, bg: door.signBg, style: 'tin' })} />
      </mesh>
    </group>
  )
}

// 바 테이블: 여러 자리가 같이 쓰는 긴 높은 테이블. 상판 + 크롬 띠 + 다리 4개 (DinerDesk 와 같은 모양, 높이만 높음)
export function BarTable({ table, color, chrome, trim }: { table: SharedTable; color: string; chrome: string; trim?: string }) {
  return <DinerDesk x={table.x} z={table.z} size={{ w: table.w, d: table.d }} color={color} chrome={chrome} trim={trim} height={TALL_DESK_HEIGHT} legInset={0.3} />
}


// 다이너 테이블: 빨간 상판 + 둘레 크롬 띠 + 크롬 다리 4개. 자리(x·z)와 크기는 상자 책상과 같습니다.
export function DinerDesk({
  x, z, size, color, chrome, trim = chrome, height = DINER_DESK.height, legInset = DINER_DESK.legInset, metal = true,
}: {
  x: number; z: number; size: { w: number; d: number }; color: string; chrome: string; trim?: string; height?: number; legInset?: number
  metal?: boolean // false 면 다리를 원목처럼(금속 광택 없음)
}) {
  const D = DINER_DESK
  const topY = height - D.topT / 2
  const legH = height - D.topT
  const lx = size.w / 2 - legInset
  const lz = size.d / 2 - legInset
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, topY, 0]}>
        <boxGeometry args={[size.w, D.topT, size.d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 테두리 띠는 상판보다 조금 크고 낮아서 옆에서 테두리로 보입니다 (trim 색, 기본은 크롬) */}
      <mesh position={[0, topY - 0.01, 0]}>
        <boxGeometry args={[size.w + D.trimOut, D.trimT, size.d + D.trimOut]} />
        <meshStandardMaterial color={trim} metalness={metal && trim === chrome ? 0.6 : 0.1} roughness={0.4} />
      </mesh>
      {[
        [-lx, -lz],
        [lx, -lz],
        [-lx, lz],
        [lx, lz],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, legH / 2, dz]}>
          <cylinderGeometry args={[D.legR, D.legR, legH, 10]} />
          <meshStandardMaterial color={chrome} metalness={metal ? 0.6 : 0} roughness={metal ? 0.3 : 0.8} />
        </mesh>
      ))}
    </group>
  )
}

// 소파(부스 의자): 양끝이 둥근 방석 + 양끝이 둥근 등받이 + 둥근 흰 띠. rot 방향(책상 쪽)을 보고, 등받이는 그 반대쪽에 둡니다.
// raise 가 있으면 그만큼 받침 위에 올립니다(높은 자리).
export function Sofa({ x, z, rot, color, accent, raise = 0 }: { x: number; z: number; rot: number; color: string; accent: string; raise?: number }) {
  const S = SOFA
  const seatR = S.d / 2 // 방석 양끝 반지름
  const backR = S.backT / 2 // 등받이 양끝 반지름
  const backZ = -S.d / 2 + S.backT / 2
  return (
    <group position={[x, raise, z]} rotation={[0, rot, 0]}>
      {raise > 0 && (
        <mesh position={[0, -raise / 2, 0]}>
          <boxGeometry args={[S.w, raise, S.d]} />
          <meshStandardMaterial color={S.plinth} />
        </mesh>
      )}
      {/* 방석: 가운데 상자 + 양끝 원통 */}
      <mesh position={[0, S.seatH / 2, 0]}>
        <boxGeometry args={[S.w - seatR * 2, S.seatH, S.d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (S.w / 2 - seatR), S.seatH / 2, 0]}>
          <cylinderGeometry args={[seatR, seatR, S.seatH, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {/* 등받이: 가운데 상자 + 양끝 세로 원통, 위에 가로 원통(흰 띠) */}
      <mesh position={[0, S.seatH + S.backH / 2, backZ]}>
        <boxGeometry args={[S.w - backR * 2, S.backH, S.backT]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (S.w / 2 - backR), S.seatH + S.backH / 2, backZ]}>
          <cylinderGeometry args={[backR, backR, S.backH, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <mesh position={[0, S.seatH + S.backH, backZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[backR, backR, S.w, 12]} />
        <meshStandardMaterial color={accent} />
      </mesh>
    </group>
  )
}

// 타일 카운터: 커피 바 자리에 흰 타일 몸체, 아래 체크 띠, 빨간 상판, 앞에 스툴.
export function Counter({ bar, counter, height, neon }: { bar: Box; counter: NonNullable<BranchTheme['counter']>; height: number; neon?: string }) {
  return (
    <group>
      <mesh position={[bar.x, height / 2, bar.z]}>
        <boxGeometry args={[bar.w, height, bar.d]} />
        <meshStandardMaterial map={tileTexture(COUNTER_TILE.tile, COUNTER_TILE.grout, COUNTER_TILE.cells, { x: bar.w * 2, y: height * 2 })} />
      </mesh>
      <mesh position={[bar.x, COUNTER_BAND.height / 2, bar.z]}>
        <boxGeometry args={[bar.w + 0.02, COUNTER_BAND.height, bar.d + 0.02]} />
        <meshStandardMaterial map={checkerTexture(COUNTER_BAND.colors, 8, { x: bar.w * 2, y: 1 })} />
      </mesh>
      <mesh position={[bar.x, height + COUNTER_TOP.thickness / 2, bar.z]}>
        <boxGeometry args={[bar.w + COUNTER_TOP.overhang, COUNTER_TOP.thickness, bar.d + COUNTER_TOP.overhang]} />
        <meshStandardMaterial color={counter.top} />
      </mesh>
      {/* 상판 앞 가장자리(스툴 쪽, -z) 네온 한 줄. 벽 네온과 같은 색 */}
      {neon && (
        <mesh position={[bar.x, height + COUNTER_TOP.thickness / 2, bar.z - (bar.d + COUNTER_TOP.overhang) / 2 - COUNTER_NEON / 2]}>
          <boxGeometry args={[bar.w + COUNTER_TOP.overhang, COUNTER_NEON, COUNTER_NEON]} />
          <meshStandardMaterial color={neon} emissive={neon} emissiveIntensity={NEON.intensity} />
        </mesh>
      )}
      {counter.stools?.map((s, i) => <Stool key={i} x={s.x} z={s.z} />)}
    </group>
  )
}

// 둥근 스툴: 크롬 기둥 + 빨간 방석. 커피 바 앞과 바 테이블 자리가 같이 씁니다.
// legH: 기둥 높이(바 테이블 자리는 방석 윗면이 0.75 가 되도록 더 높게), color: 방석 색(가까이·내 자리 강조용)
export function Stool({ x, z, legH = STOOL.legH, color = STOOL_SEAT_COLOR }: { x: number; z: number; legH?: number; color?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, legH / 2, 0]}>
        <cylinderGeometry args={[STOOL.legR, STOOL.legR, legH, 10]} />
        <meshStandardMaterial color={STOOL_LEG_COLOR} />
      </mesh>
      <mesh position={[0, legH + STOOL.seatH / 2, 0]}>
        <cylinderGeometry args={[STOOL.seatR, STOOL.seatR, STOOL.seatH, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------
// 원목 테마 소품 (올리브 테라스)
// ---------------------------------------------------------------
const WOOD = { roughness: 0.75, metalness: 0 }

// 천장 아래 철제 격자: step 간격으로 x·z 방향 얇은 검은 막대
function CeilingGrid({ grid, size }: { grid: NonNullable<NonNullable<BranchTheme['ceiling']>['grid']>; size: Size }) {
  const bars: { pos: [number, number, number]; args: [number, number, number] }[] = []
  const t = 0.04
  for (let x = -size.w / 2 + grid.step; x < size.w / 2 - 0.01; x += grid.step) bars.push({ pos: [x, grid.y, 0], args: [t, t, size.d - 0.4] })
  for (let z = -size.d / 2 + grid.step; z < size.d / 2 - 0.01; z += grid.step) bars.push({ pos: [0, grid.y, z], args: [size.w - 0.4, t, t] })
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.args} />
          <meshStandardMaterial color={grid.color} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

// 둥근 전구 조명: 천장에서 줄로 내려온 흰 구. light 면 pointLight 로 주변도 비춥니다
function GlobeLamp({ globe, height }: { globe: Globe; height: number }) {
  const cordH = height - globe.y - GLOBE.r
  return (
    <group position={[globe.x, 0, globe.z]}>
      <mesh position={[0, globe.y + GLOBE.r + cordH / 2, 0]}>
        <cylinderGeometry args={[GLOBE.cordR, GLOBE.cordR, cordH, 6]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
      {globe.style === 'disc' ? (
        <>
          {/* 원반 갓: 납작한 원통, 아래에 작은 전구 */}
          <mesh position={[0, globe.y + 0.04, 0]}>
            <cylinderGeometry args={[GLOBE.r * 1.6, GLOBE.r * 1.6, 0.02, 32]} />
            <meshStandardMaterial color="#e8e6e2" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, globe.y - 0.04, 0]}>
            <sphereGeometry args={[GLOBE.r * 0.45, 14, 10]} />
            <meshStandardMaterial color="#fff6e6" emissive="#ffe6c2" emissiveIntensity={1.2} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, globe.y, 0]}>
          <sphereGeometry args={[GLOBE.r, 20, 14]} />
          <meshStandardMaterial color="#fff6e6" emissive="#ffe6c2" emissiveIntensity={1.1} />
        </mesh>
      )}
      {globe.light && <pointLight position={[0, globe.y, 0]} color="#ffdcae" intensity={GLOBE.intensity} distance={GLOBE.distance} decay={2} />}
    </group>
  )
}

// 올리브 나무: 화분 테두리(원통 고리) + 흙 + 줄기 + 가지 3개 + 잎 덩어리(구 여러 개)
function OliveTree({ tree }: { tree: Tree }) {
  const trunkH = tree.height * 0.45
  const leaf = '#7f8f4e'
  const leafDark = '#66763d'
  const blobs: [number, number, number, number][] = [
    // x, y, z, 반지름 (줄기 꼭대기 기준)
    [0, 0.5, 0, 0.75], [0.55, 0.25, 0.2, 0.55], [-0.5, 0.3, -0.15, 0.6], [0.15, 0.2, -0.6, 0.5],
    [-0.2, 0.15, 0.6, 0.5], [0.3, 0.8, -0.2, 0.45], [-0.35, 0.75, 0.3, 0.4],
  ]
  const branches: [number, number][] = [[0.5, 0.0], [0.45, 2.1], [0.55, 4.2]] // 기울기, 방향
  return (
    <group position={[tree.x, 0, tree.z]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[tree.potR, tree.potR, 0.12, 32, 1, true]} />
        <meshStandardMaterial color="#b98a5a" side={DoubleSide} {...WOOD} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[tree.potR - 0.01, 32]} />
        <meshStandardMaterial color="#4a3526" roughness={1} />
      </mesh>
      {/* 줄기: 아래가 굵고 살짝 기울어짐 */}
      <mesh position={[0.05, trunkH / 2, 0]} rotation={[0, 0, -0.06]}>
        <cylinderGeometry args={[0.09, 0.16, trunkH, 10]} />
        <meshStandardMaterial color="#6b5440" roughness={1} />
      </mesh>
      {branches.map(([tilt, yaw], i) => (
        <group key={i} position={[0, trunkH, 0]} rotation={[0, yaw, 0]}>
          <mesh position={[0.25, 0.25, 0]} rotation={[0, 0, -tilt]}>
            <cylinderGeometry args={[0.04, 0.07, 0.7, 8]} />
            <meshStandardMaterial color="#6b5440" roughness={1} />
          </mesh>
        </group>
      ))}
      <group position={[0, trunkH + 0.45, 0]}>
        {blobs.map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]}>
            <icosahedronGeometry args={[r, 1]} />
            <meshStandardMaterial color={i % 2 ? leafDark : leaf} roughness={0.9} flatShading />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// 벽 선반: 원목 판 rows 줄, 판마다 작은 그릇·꽃병 몇 개 (위치는 고정 무늬)
function WallShelf({ shelf }: { shelf: Shelf }) {
  const p = wallPose(shelf.x, shelf.z, shelf.face, 0, WALL_THICKNESS / 2 + 0.13)
  const depth = 0.24
  const items = ['bowl', 'vase', 'bowl', 'cup', 'bowl', 'vase']
  const n = Math.max(2, Math.floor(shelf.w / 0.5))
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
      {Array.from({ length: shelf.rows }, (_, row) => (
        <group key={row} position={[0, 0.9 + row * 0.45, 0]}>
          <mesh>
            <boxGeometry args={[shelf.w, 0.04, depth]} />
            <meshStandardMaterial color="#c79a6b" {...WOOD} />
          </mesh>
          {Array.from({ length: n }, (_, i) => {
            const kind = items[(i + row) % items.length]
            const x = -shelf.w / 2 + (i + 0.5) * (shelf.w / n)
            const color = (i + row) % 3 === 0 ? '#e9dcc8' : (i + row) % 3 === 1 ? '#a8784f' : '#d6c4a4'
            return kind === 'vase' ? (
              <mesh key={i} position={[x, 0.13, 0]}>
                <cylinderGeometry args={[0.04, 0.06, 0.22, 12]} />
                <meshStandardMaterial color={color} roughness={0.6} />
              </mesh>
            ) : kind === 'cup' ? (
              <mesh key={i} position={[x, 0.06, 0]}>
                <cylinderGeometry args={[0.04, 0.035, 0.08, 12]} />
                <meshStandardMaterial color={color} roughness={0.6} />
              </mesh>
            ) : (
              <mesh key={i} position={[x, 0.05, 0]}>
                <cylinderGeometry args={[0.1, 0.05, 0.06, 16]} />
                <meshStandardMaterial color={color} roughness={0.6} />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

// 고리 테이블: 바깥 원에서 안쪽 원을 뚫은 모양을 두께만큼 밀어 올린 원목 상판 + 안쪽 둘레 받침 벽
export function RingTable({ ring, color, height }: { ring: RingTableSpec; color: string; height: number }) {
  const shape = useMemo(() => {
    const s = new Shape()
    s.absarc(0, 0, ring.outer, 0, Math.PI * 2, false)
    const hole = new Path()
    hole.absarc(0, 0, ring.inner, 0, Math.PI * 2, true)
    s.holes.push(hole)
    return s
  }, [ring.outer, ring.inner])
  const topT = 0.06
  return (
    <group position={[ring.x, 0, ring.z]}>
      {/* ExtrudeGeometry 는 xy 평면 모양을 +z 로 밉니다. x 축으로 -90° 돌려 바닥에 눕힙니다 */}
      <mesh position={[0, height - topT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[shape, { depth: topT, bevelEnabled: false, curveSegments: 48 }]} />
        <meshStandardMaterial color={color} {...WOOD} />
      </mesh>
      {/* 받침: 안쪽 원 둘레 벽 (테이블 아래 다리 대신) */}
      <mesh position={[0, (height - topT) / 2, 0]}>
        <cylinderGeometry args={[ring.inner + 0.05, ring.inner + 0.05, height - topT, 40, 1, true]} />
        <meshStandardMaterial color="#a57a52" side={DoubleSide} {...WOOD} />
      </mesh>
    </group>
  )
}

// 원목 의자: 방석 + 다리 4개 + 등받이(기둥 둘 + 가로 판). rot 방향(책상 쪽)을 보고 등받이는 반대쪽(-z)
export function WoodChair({ x, z, rot, color, wood }: { x: number; z: number; rot: number; color: string; wood: string }) {
  const C = WOOD_CHAIR
  const legH = C.seatH - C.seatT
  const lx = C.w / 2 - 0.04
  const lz = C.d / 2 - 0.04
  const legs: [number, number][] = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, C.seatH - C.seatT / 2, 0]}>
        <boxGeometry args={[C.w, C.seatT, C.d]} />
        <meshStandardMaterial color={color} {...WOOD} />
      </mesh>
      {legs.map(([dx, dz], i) => (
        <mesh key={i} position={[dx, legH / 2, dz]}>
          <cylinderGeometry args={[C.legR, C.legR, legH, 8]} />
          <meshStandardMaterial color={wood} {...WOOD} />
        </mesh>
      ))}
      {[-lx, lx].map((dx, i) => (
        <mesh key={i} position={[dx, C.seatH + C.backH / 2, -lz]}>
          <boxGeometry args={[0.03, C.backH, 0.03]} />
          <meshStandardMaterial color={wood} {...WOOD} />
        </mesh>
      ))}
      <mesh position={[0, C.seatH + C.backH - 0.08, -lz]}>
        <boxGeometry args={[C.w, 0.12, C.backT]} />
        <meshStandardMaterial color={wood} {...WOOD} />
      </mesh>
    </group>
  )
}

// 원목 부스: 원목 받침 위 방석 + 높은 원목 등받이 + 쿠션 2개. rot 방향을 보고 등받이는 반대쪽
export function WoodBooth({ x, z, rot, color, wood, cushion }: { x: number; z: number; rot: number; color: string; wood: string; cushion: string }) {
  const B = WOOD_BOOTH
  const backZ = -B.d / 2 + B.backT / 2
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, (B.seatH - 0.08) / 2, 0]}>
        <boxGeometry args={[B.w, B.seatH - 0.08, B.d]} />
        <meshStandardMaterial color={wood} {...WOOD} />
      </mesh>
      {/* 방석: 가까이·내 자리 강조색은 여기에 */}
      <mesh position={[0, B.seatH - 0.04, 0.02]}>
        <boxGeometry args={[B.w - 0.04, 0.08, B.d - 0.06]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, B.seatH + B.backH / 2, backZ]}>
        <boxGeometry args={[B.w, B.backH, B.backT]} />
        <meshStandardMaterial color={wood} {...WOOD} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * B.w) / 4, B.seatH + B.cushion.h / 2 + 0.04, backZ + B.backT / 2 + B.cushion.t / 2]} rotation={[-0.15, 0, 0]}>
          <boxGeometry args={[B.cushion.w, B.cushion.h, B.cushion.t]} />
          <meshStandardMaterial color={cushion} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// 원목 문: 문판 + 어두운 문틀 + 둥근 놋쇠 손잡이 + 표지판(안쪽 면). near 면 문판이 주황
function WoodDoor({
  box, height, near, nearColor, label, door, along,
}: {
  box: Box; height: number; near: boolean; nearColor: string; label: string
  door: NonNullable<BranchTheme['door']>; along: 'x' | 'z'
}) {
  const W = WOOD_DOOR
  const len = along === 'x' ? box.w : box.d
  const thick = along === 'x' ? box.d : box.w
  const face = thick / 2 + 0.005
  const signH = (W.signW * POSTER_PX.h) / POSTER_PX.w
  return (
    <group position={[box.x, 0, box.z]} rotation={[0, along === 'z' ? Math.PI / 2 : 0, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[len, height, thick]} />
        <meshStandardMaterial color={near ? nearColor : door.color} {...WOOD} />
      </mesh>
      {/* 문틀: 문보다 크고 얇아서 둘레만 보임 */}
      <mesh position={[0, (height + W.frameT) / 2, 0]}>
        <boxGeometry args={[len + W.frameT * 2, height + W.frameT, thick - 0.02]} />
        <meshStandardMaterial color={door.chrome} {...WOOD} />
      </mesh>
      {[face, -face].map((zz, i) => (
        <mesh key={i} position={[len / 2 - 0.18, W.knobY, zz + (i ? -1 : 1) * W.knobR * 0.6]}>
          <sphereGeometry args={[W.knobR, 12, 10]} />
          <meshStandardMaterial color={door.knob ?? '#c8a25a'} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, W.signY, -face]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W.signW, signH]} />
        <meshBasicMaterial map={signTexture({ text: label, bg: door.signBg, style: 'plain' })} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------
// 라운지 테마 소품 (흑요 라운지)
// ---------------------------------------------------------------
const LEATHER = { roughness: 0.45, metalness: 0.05 }

// 반지름 inner~outer, 각도 from~to 인 부채꼴 고리 모양 (xy 평면). 원형 부스의 방석·등받이 바닥 모양
function arcBand(inner: number, outer: number, from: number, to: number) {
  const s = new Shape()
  s.absarc(0, 0, outer, from, to, false)
  s.absarc(0, 0, inner, to, from, true)
  s.closePath()
  return s
}

// 원형 부스 + 가운데 대리석 테이블. 부스는 열린 쪽(open)을 빼고 C 모양으로 테이블을 감쌉니다.
// 부스는 장애물이 아닙니다(의자·소파와 같음). 그래야 부스 뒤에서도 안쪽 자리에 앉을 수 있습니다.
export function CircleBooth({ booth, leather, marble }: { booth: Booth; leather: string; marble: [string, string] }) {
  const B = BOOTH
  // 방향 규칙: 자리 각도 a 는 바닥에서 (sin a, cos a) 방향. x 축으로 -90° 눕힌 모양 평면의 점 (cos φ, sin φ) 는
  // 바닥의 (cos φ, -sin φ) 로 가므로, 같은 방향이 되려면 φ = a - π/2 입니다.
  const toShape = (a: number) => a - Math.PI / 2
  const from = toShape(booth.open + B.gap) // 열린 쪽 양옆(gap)을 빼고 반대편으로 돌아 감쌈
  const to = toShape(booth.open + Math.PI * 2 - B.gap)
  const seat = useMemo(() => arcBand(BOOTH.seatIn, BOOTH.seatOut, from, to), [from, to]) // BOOTH 는 상수라 의존성에 안 넣음
  const back = useMemo(() => arcBand(BOOTH.seatOut, BOOTH.backOut, from, to), [from, to])
  const T = MARBLE_TABLE
  return (
    <group position={[booth.x, 0, booth.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[seat, { depth: B.seatH, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 }]} />
        <meshStandardMaterial color={leather} {...LEATHER} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[back, { depth: B.backH, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 }]} />
        <meshStandardMaterial color={leather} {...LEATHER} />
      </mesh>
      {/* 대리석 테이블: 받침 원판 + 기둥 + 상판(윗면에 대리석 결) */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[T.baseR, T.baseR, 0.04, 24]} />
        <meshStandardMaterial color="#111111" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, (T.height - T.topT) / 2, 0]}>
        <cylinderGeometry args={[T.stemR, T.stemR, T.height - T.topT, 16]} />
        <meshStandardMaterial color="#111111" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, T.height - T.topT / 2, 0]}>
        <cylinderGeometry args={[T.r, T.r, T.topT, 40]} />
        <meshStandardMaterial color={marble[0]} roughness={0.25} metalness={0.1} />
      </mesh>
      <mesh position={[0, T.height + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[T.r, 40]} />
        <meshStandardMaterial map={marbleTexture(marble)} roughness={0.2} metalness={0.1} />
      </mesh>
    </group>
  )
}

// 부스 안 자리 표시: 방석 위 얇은 가죽 판. 가까이·내 자리면 강조색으로 바뀌어 어디에 앉는지 보입니다
export function SeatPad({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <mesh position={[x, BOOTH.seatH + 0.03, z]}>
      <cylinderGeometry args={[0.2, 0.2, 0.03, 20]} />
      <meshStandardMaterial color={color} {...LEATHER} />
    </mesh>
  )
}

// 버섯 조명: 가는 기둥 + 위가 둥근 반구 갓. 갓 아래가 빛나고 light 면 주변도 비춥니다
function MushroomLamp({ lamp }: { lamp: Mushroom }) {
  const M = MUSHROOM
  return (
    <group position={[lamp.x, lamp.y, lamp.z]}>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.02, 16]} />
        <meshStandardMaterial color="#b9bcc2" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, M.stemH / 2, 0]}>
        <cylinderGeometry args={[M.stemR, M.stemR, M.stemH, 8]} />
        <meshStandardMaterial color="#b9bcc2" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, M.stemH, 0]}>
        <sphereGeometry args={[M.capR, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c9ccd2" metalness={0.85} roughness={0.2} side={DoubleSide} />
      </mesh>
      <mesh position={[0, M.stemH - 0.01, 0]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshStandardMaterial color="#fff1d6" emissive="#ffd8a0" emissiveIntensity={1.4} />
      </mesh>
      {lamp.light && <pointLight position={[0, M.stemH - 0.05, 0]} color="#ffd2a0" intensity={M.intensity} distance={M.distance} decay={2} />}
    </group>
  )
}
