// 지점 테마 소품 (#57): 천장·팬·네온 띠·벽 액자·타일 카운터·스툴.
// 전부 상자·원통과 캔버스 텍스처로 만들고 외부 모델은 없습니다. 테마가 없는 지점은 아무것도 그리지 않습니다.
// 천장은 아래를 향한 한 면만 그려서, 위에서 내려다보는 2D 카메라·미니맵에서는 보이지 않고 1인칭·좌석에서만 보입니다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, DoubleSide, ExtrudeGeometry, LatheGeometry, Path, SRGBColorSpace, Shape, ShapeGeometry, Vector2 } from 'three'
import type { Group } from 'three'
import type { Box } from './layout'
import { ARCH_DOOR, BAR_TOP, BASIN, DOME, ELEVATOR, LOUNGER, ROUND_ROOM, inRoundGap, BOOTH, DINER_DESK, LOW_TABLE, MARBLE_TABLE, MUSHROOM, PILLAR, ROUND_TABLE, TUB, FAN, FRAME, GLOBE, LAMP, SOFA, STOOL, TALL_DESK_HEIGHT, WALL_THICKNESS, WOOD_BOOTH, WOOD_CHAIR, WOOD_DOOR, ceilingHeightOf, framePose, wallPose } from './theme'
import type { BackBar, Bar, Basin, Board, Booth, BranchTheme, Dome, Riser, RoundRoom, FanSpot, Frame, Globe, Menu, Mushroom, Pillar, Planter, RingTable as RingTableSpec, Rug, SharedTable, Shelf, Tree, Water } from './theme'
import { LABEL_PX, labelTexture } from './labelTexture'
import { POSTER_PX, brickTexture, checkerTexture, concreteTexture, marbleTexture, menuTexture, mosaicTexture, signTexture, tileTexture } from './patternTexture'

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
      {theme.ceiling && <Ceiling color={theme.ceiling.color} size={size} height={h} hole={theme.dome} />}
      {theme.dome && <DomeSkylight dome={theme.dome} height={h} />}
      {theme.round && <RoundWall round={theme.round} height={h} />}
      {theme.basin && <FogBasin basin={theme.basin} />}
      {theme.ceiling?.fans?.map((f, i) => <CeilingFan key={i} spot={f} height={h} />)}
      {theme.ceiling?.lamps?.map((l, i) => <PendantLamp key={i} x={l.x} z={l.z} height={h} />)}
      {theme.wall?.neon && <NeonStrip color={theme.wall.neon} size={size} height={h} />}
      {theme.frames?.map((f, i) => <WallFrame key={i} frame={f} />)}
      {theme.menu && <MenuBoard menu={theme.menu} />}
      {theme.ceiling?.grid && <CeilingGrid grid={theme.ceiling.grid} size={size} />}
      {theme.ceiling?.globes?.map((g, i) => <GlobeLamp key={i} globe={g} height={h} />)}
      {theme.tree && <OliveTree tree={theme.tree} />}
      {theme.shelves?.map((sh, i) => <WallShelf key={i} shelf={sh} />)}
      {theme.booth && theme.booths?.map((b, i) => <CircleBooth key={i} booth={b} style={theme.booth!} />)}
      {theme.rugs?.map((r, i) => <RugMat key={i} rug={r} />)}
      {theme.planters?.map((pl, i) => <PlanterBox key={i} planter={pl} />)}
      {theme.water?.map((w, i) => <WaterChannel key={i} water={w} />)}
      {theme.ceiling?.coves?.map((c, i) => <CoveRing key={i} cove={c} height={h} />)}
      {theme.bars?.map((bar, i) => <CurvedBar key={i} bar={bar} wood={theme.furniture?.chrome ?? '#5a3420'} marble={theme.booth?.marble ?? ['#2a1d18', '#c9a27a']} />)}
      {theme.backbar && <BackBarShelf backbar={theme.backbar} />}
      {theme.pillars?.map((pl, i) => <SlatPillar key={i} pillar={pl} />)}
      {theme.wall?.band && <MosaicBand band={theme.wall.band} size={size} />}
      {theme.risers?.map((r, i) => <RiserStep key={i} riser={r} />)}
      {theme.board && <Blackboard board={theme.board} />}
      {theme.mushrooms?.map((m, i) => <MushroomLamp key={i} lamp={m} />)}
    </group>
  )
}

// 바닥: 테마 무늬(체크·벽돌·콘크리트) 텍스처, 없으면 color 한 색. 지점과 회의실이 같이 씁니다.
export function ThemedFloor({ floor, size, color }: { floor?: BranchTheme['floor']; size: Size; color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size.w, size.d]} />
      {floor?.pattern === 'concrete' ? (
        // 콘크리트 텍스처 한 장이 cell(m) 크기라, 면 전체에 (면 ÷ cell)번 반복합니다.
        <meshStandardMaterial roughness={0.9} map={concreteTexture(floor.colors, { x: size.w / floor.cell, y: size.d / floor.cell })} />
      ) : floor?.pattern === 'brick' ? (
        // 벽돌 텍스처는 가로 4개(cell 길이) × 세로 16줄(cell/4 높이)이라, 면 전체에 (면 ÷ 텍스처 한 장 크기)번 반복합니다.
        <meshStandardMaterial
          roughness={0.85}
          map={brickTexture(floor.colors, { x: size.w / (floor.cell * 4), y: size.d / ((floor.cell / 4) * 16) })}
        />
      ) : floor ? (
        // 체크 텍스처는 8×8칸이라, 면 전체에 (면 크기 ÷ 칸 크기 ÷ 8)번 반복합니다.
        <meshStandardMaterial map={checkerTexture(floor.colors, 8, { x: size.w / (floor.cell * 8), y: size.d / (floor.cell * 8) })} />
      ) : (
        <meshStandardMaterial color={color} />
      )}
    </mesh>
  )
}

// 천장: 아래를 보는 평면. planeGeometry 의 앞면은 +z 라 x 축으로 +90° 돌리면 앞면이 -y(아래)를 봅니다.
// hole: 천창이 있으면 그 자리에 둥근 구멍 (ShapeGeometry 는 x·y 평면이라, x 축으로 돌리면 y 가 월드 z 가 됩니다)
function Ceiling({ color, size, height, hole }: { color: string; size: Size; height: number; hole?: Dome }) {
  const holed = useMemo(() => {
    if (!hole) return null
    const shape = new Shape()
    shape.moveTo(-size.w / 2, -size.d / 2)
    shape.lineTo(size.w / 2, -size.d / 2)
    shape.lineTo(size.w / 2, size.d / 2)
    shape.lineTo(-size.w / 2, size.d / 2)
    shape.closePath()
    const p = new Path()
    p.absarc(hole.x, hole.z, hole.R, 0, Math.PI * 2, true)
    shape.holes.push(p)
    return new ShapeGeometry(shape, 64)
  }, [hole, size.w, size.d])
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]} geometry={holed ?? undefined}>
      {!holed && <planeGeometry args={[size.w, size.d]} />}
      <meshStandardMaterial color={color} roughness={1} side={DoubleSide} />
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
      {/* 둥근 창 두 개 (porthole 문) */}
      {door.style === 'porthole' &&
        [-len / 4, len / 4].map((px, i) =>
          [face, -face].map((zz, j) => (
            <group key={`${i}-${j}`} position={[px, slabH * 0.72, zz]} rotation={[0, j ? Math.PI : 0, 0]}>
              <mesh>
                <ringGeometry args={[0.12, 0.16, 24]} />
                <meshStandardMaterial color={door.chrome} metalness={0.85} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0, -0.001]}>
                <circleGeometry args={[0.12, 24]} />
                <meshStandardMaterial color={GLASS.color} metalness={GLASS.metalness} roughness={GLASS.roughness} />
              </mesh>
            </group>
          )),
        )}
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
export function Stool({ x, z, legH = STOOL.legH, color = STOOL_SEAT_COLOR, legColor = STOOL_LEG_COLOR }: { x: number; z: number; legH?: number; color?: string; legColor?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, legH / 2, 0]}>
        <cylinderGeometry args={[STOOL.legR, STOOL.legR, legH, 10]} />
        <meshStandardMaterial color={legColor} />
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
export function CircleBooth({ booth, style }: { booth: Booth; style: NonNullable<BranchTheme['booth']> }) {
  const B = BOOTH
  const gap = style.gap ?? B.gap
  // 방향 규칙: 자리 각도 a 는 바닥에서 (sin a, cos a) 방향. x 축으로 -90° 눕힌 모양 평면의 점 (cos φ, sin φ) 는
  // 바닥의 (cos φ, -sin φ) 로 가므로, 같은 방향이 되려면 φ = a - π/2 입니다.
  const toShape = (a: number) => a - Math.PI / 2
  const from = toShape(booth.open + gap) // 열린 쪽 양옆(gap)을 빼고 반대편으로 돌아 감쌈
  const to = toShape(booth.open + Math.PI * 2 - gap)
  const seat = useMemo(() => arcBand(BOOTH.seatIn, BOOTH.seatOut, from, to), [from, to]) // BOOTH 는 상수라 의존성에 안 넣음
  const back = useMemo(() => arcBand(BOOTH.seatOut, BOOTH.backOut, from, to), [from, to])
  const fabric = style.soft ? { roughness: 0.95, metalness: 0 } : LEATHER // 벨벳·부클레는 광택 없이
  const T = MARBLE_TABLE
  const table = style.table ?? 'marble'
  return (
    <group position={[booth.x, 0, booth.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[seat, { depth: B.seatH, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 }]} />
        <meshStandardMaterial color={style.leather} {...fabric} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[back, { depth: B.backH, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 }]} />
        <meshStandardMaterial color={style.back ?? style.leather} {...(style.back ? WOOD : fabric)} />
      </mesh>
      {table === 'marble' && (
        <group>
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
            <meshStandardMaterial color={style.marble[0]} roughness={0.25} metalness={0.1} />
          </mesh>
          <mesh position={[0, T.height + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[T.r, 40]} />
            <meshStandardMaterial map={marbleTexture(style.marble)} roughness={0.2} metalness={0.1} />
          </mesh>
        </group>
      )}
      {table === 'low' && <LowTable x={0} z={0} color={style.marble[0]} />}
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

// ---------------------------------------------------------------
// 남쪽 지점 소품 (물결 라운지·이끼 정원·월넛 바)
// ---------------------------------------------------------------

// 낮은 둥근 테이블: 받침 기둥 + 둥근 상판 (높이 0.45)
export function LowTable({ x, z, color }: { x: number; z: number; color: string }) {
  const L = LOW_TABLE
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, (L.height - 0.04) / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.16, L.height - 0.04, 16]} />
        <meshStandardMaterial color="#1b1b1b" roughness={0.6} />
      </mesh>
      <mesh position={[0, L.height - 0.02, 0]}>
        <cylinderGeometry args={[L.r, L.r, 0.04, 36]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  )
}

// 1인석 둥근 작은 테이블: 대리석 결 상판(marble 이 있으면) 또는 색 상판 + 받침 기둥
export function RoundTable({ x, z, color, marble }: { x: number; z: number; color: string; marble?: [string, string] }) {
  const R = ROUND_TABLE
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.04, 20]} />
        <meshStandardMaterial color="#3b2a1d" {...WOOD} />
      </mesh>
      <mesh position={[0, (R.height - 0.04) / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.05, R.height - 0.04, 12]} />
        <meshStandardMaterial color="#3b2a1d" {...WOOD} />
      </mesh>
      <mesh position={[0, R.height - 0.02, 0]}>
        <cylinderGeometry args={[R.r, R.r, 0.04, 32]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {marble && (
        <mesh position={[0, R.height + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[R.r, 32]} />
          <meshStandardMaterial map={marbleTexture(marble)} roughness={0.25} />
        </mesh>
      )}
    </group>
  )
}

// 둥근 1인 소파(통 의자): 앉는 원통 + 뒤쪽 반 바퀴 남짓을 감싼 등받이. rot 방향(테이블 쪽)이 열려 있음
export function TubChair({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const T = TUB
  // 원통 등받이: 각도 시작·길이(three 원통의 theta 는 +z 에서 시작해 +x 쪽으로). 앞(+z) 쪽 120° 를 비움
  const open = (Math.PI * 2) / 3
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, T.seatH / 2, 0]}>
        <cylinderGeometry args={[T.r, T.r * 0.95, T.seatH, 24]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, T.backH / 2, 0]}>
        <cylinderGeometry args={[T.r + 0.06, T.r + 0.04, T.backH, 24, 1, true, open / 2, Math.PI * 2 - open]} />
        <meshStandardMaterial color={color} roughness={0.95} side={DoubleSide} />
      </mesh>
    </group>
  )
}

// 러그: 바닥 위 얇은 판. wobble 이 있으면 가장자리가 물결 모양
function RugMat({ rug }: { rug: Rug }) {
  const shape = useMemo(() => {
    const s = new Shape()
    const n = 64
    const seed = rug.seed ?? 1
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2
      const k = 1 + (rug.wobble ?? 0) * (0.6 * Math.sin(2 * t + seed) + 0.4 * Math.sin(3 * t + seed * 2))
      const px = Math.cos(t) * rug.r * k
      const py = Math.sin(t) * rug.r * k
      if (i === 0) s.moveTo(px, py)
      else s.lineTo(px, py)
    }
    return s
  }, [rug.r, rug.wobble, rug.seed])
  return (
    <mesh position={[rug.x, 0.006, rug.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={rug.color} roughness={1} />
    </mesh>
  )
}

// 화분(화단): 타일 두른 상자 + 흙 + 풀 덩어리 몇 개, tree 면 가운데 작은 나무
function PlanterBox({ planter }: { planter: Planter }) {
  const h = 0.55
  const leaf = ['#4f7a3a', '#3f6a30', '#5d8a45']
  const n = Math.max(3, Math.round((planter.w * planter.d) / 0.35))
  return (
    <group position={[planter.x, 0, planter.z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[planter.w, h, planter.d]} />
        <meshStandardMaterial map={tileTexture(planter.tile, '#9a9a96', 8, { x: planter.w * 3, y: h * 3 })} roughness={0.5} />
      </mesh>
      <mesh position={[0, h + 0.01, 0]}>
        <boxGeometry args={[planter.w - 0.1, 0.02, planter.d - 0.1]} />
        <meshStandardMaterial color="#3a2b1f" roughness={1} />
      </mesh>
      {Array.from({ length: n }, (_, i) => {
        const fx = ((i * 0.618) % 1) - 0.5
        const fz = ((i * 0.381 + 0.2) % 1) - 0.5
        const r = 0.18 + ((i * 0.27) % 1) * 0.14
        return (
          <mesh key={i} position={[fx * (planter.w - 0.3), h + r * 0.7, fz * (planter.d - 0.3)]}>
            <icosahedronGeometry args={[r, 1]} />
            <meshStandardMaterial color={leaf[i % leaf.length]} roughness={0.9} flatShading />
          </mesh>
        )
      })}
      {planter.tree && (
        <group position={[0, h, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.04, 0.07, 1.0, 8]} />
            <meshStandardMaterial color="#6b5440" roughness={1} />
          </mesh>
          {[[0, 1.25, 0, 0.42], [0.25, 1.05, 0.1, 0.3], [-0.22, 1.1, -0.1, 0.32], [0.05, 1.5, -0.05, 0.28]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]}>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial color={i % 2 ? '#7d9561' : '#6a844f'} roughness={0.9} flatShading />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// 물길: 짙은 물 표면(바닥보다 살짝 위, 반짝임) + 낮은 돌 테두리
function WaterChannel({ water }: { water: Water }) {
  const rim = 0.08
  return (
    <group position={[water.x, 0, water.z]}>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[water.w, 0.08, water.d]} />
        <meshStandardMaterial color="#5f5b55" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[water.w - rim * 2, water.d - rim * 2]} />
        <meshStandardMaterial color="#2f4f5a" metalness={0.4} roughness={0.08} emissive="#0d2a33" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// 천장 둥근 간접조명: 천장 바로 아래 빛나는 고리
function CoveRing({ cove, height }: { cove: { x: number; z: number; r: number }; height: number }) {
  return (
    <mesh position={[cove.x, height - 0.06, cove.z]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[cove.r, 0.04, 8, 64]} />
      <meshStandardMaterial color="#fff2da" emissive="#ffd9a6" emissiveIntensity={1.6} />
    </mesh>
  )
}

// 곡선 바: 원목 몸통(가로 홈 무늬 대신 띠 두 줄) + 대리석 상판 + 놋쇠 발 받침
export function CurvedBar({ bar, wood, marble }: { bar: Bar; wood: string; marble: [string, string] }) {
  const toShape = (a: number) => a - Math.PI / 2 // CircleBooth 와 같은 방향 규칙
  const from = toShape(bar.from)
  const to = toShape(bar.to)
  const body = useMemo(() => arcBand(bar.inner, bar.outer, from, to), [bar.inner, bar.outer, from, to])
  const top = useMemo(() => arcBand(bar.inner - 0.02, bar.outer + BAR_TOP.over, from, to), [bar.inner, bar.outer, from, to])
  const rail = useMemo(() => arcBand(bar.outer + 0.05, bar.outer + 0.09, from, to), [bar.outer, from, to])
  return (
    <group position={[bar.x, 0, bar.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[body, { depth: bar.height - BAR_TOP.t, bevelEnabled: false, curveSegments: 48 }]} />
        <meshStandardMaterial color={wood} {...WOOD} />
      </mesh>
      <mesh position={[0, bar.height - BAR_TOP.t, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[top, { depth: BAR_TOP.t, bevelEnabled: false, curveSegments: 48 }]} />
        <meshStandardMaterial map={marbleTexture(marble)} color="#ffffff" roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[rail, { depth: 0.03, bevelEnabled: false, curveSegments: 48 }]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  )
}

// 바 뒤 둥근 진열장: 원통 받침 + 놋쇠 테 둥근 선반 3단 + 병들
function BackBarShelf({ backbar }: { backbar: BackBar }) {
  const bottles = ['#3b5d3a', '#7a3b22', '#c9a24a', '#2e3a4a', '#a8632e', '#d9d2c4']
  return (
    <group position={[backbar.x, 0, backbar.z]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[backbar.r, backbar.r, 1.0, 32]} />
        <meshStandardMaterial color="#4a2e1c" {...WOOD} />
      </mesh>
      {[1.25, 1.65, 2.05].map((y, k) => (
        <group key={k} position={[0, y, 0]}>
          <mesh>
            <cylinderGeometry args={[backbar.r * 0.9, backbar.r * 0.9, 0.03, 32]} />
            <meshStandardMaterial color="#c9a24a" metalness={0.85} roughness={0.25} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2 + k * 0.3
            return (
              <mesh key={i} position={[Math.sin(a) * backbar.r * 0.7, 0.14, Math.cos(a) * backbar.r * 0.7]}>
                <cylinderGeometry args={[0.035, 0.04, 0.26, 10]} />
                <meshStandardMaterial color={bottles[(i + k) % bottles.length]} roughness={0.2} metalness={0.1} />
              </mesh>
            )
          })}
        </group>
      ))}
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.0, 8]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  )
}

// 원목 살 기둥 조명: 빛나는 가운데 기둥을 세로 원목 살이 감쌈
function SlatPillar({ pillar }: { pillar: Pillar }) {
  const P = PILLAR
  return (
    <group position={[pillar.x, 0, pillar.z]}>
      <mesh position={[0, pillar.h / 2, 0]}>
        <cylinderGeometry args={[P.r * 0.7, P.r * 0.7, pillar.h, 20]} />
        <meshStandardMaterial color="#fff0d8" emissive="#ffcf8f" emissiveIntensity={1.3} />
      </mesh>
      {Array.from({ length: P.slats }, (_, i) => {
        const a = (i / P.slats) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * P.r, pillar.h / 2, Math.cos(a) * P.r]} rotation={[0, a, 0]}>
            <boxGeometry args={[0.05, pillar.h, 0.04]} />
            <meshStandardMaterial color="#8a5532" {...WOOD} />
          </mesh>
        )
      })}
      {pillar.light && <pointLight position={[0, pillar.h * 0.6, 0]} color="#ffcf8f" intensity={P.intensity} distance={P.distance} decay={2} />}
    </group>
  )
}

// 벽 둘레 모자이크 타일 띠: 네 벽 안쪽 면에 붙인 판
function MosaicBand({ band, size }: { band: NonNullable<NonNullable<BranchTheme['wall']>['band']>; size: Size }) {
  const inset = WALL_THICKNESS / 2 + 0.005
  const y = band.y + band.h / 2
  const sides: { pos: [number, number, number]; rotY: number; len: number }[] = [
    { pos: [0, y, -size.d / 2 + inset], rotY: 0, len: size.w }, // 북쪽 벽 (남쪽을 봄)
    { pos: [0, y, size.d / 2 - inset], rotY: Math.PI, len: size.w },
    { pos: [-size.w / 2 + inset, y, 0], rotY: Math.PI / 2, len: size.d },
    { pos: [size.w / 2 - inset, y, 0], rotY: -Math.PI / 2, len: size.d },
  ]
  return (
    <group>
      {sides.map((sd, i) => (
        <mesh key={i} position={sd.pos} rotation={[0, sd.rotY, 0]}>
          <planeGeometry args={[sd.len, band.h]} />
          <meshStandardMaterial map={mosaicTexture(band.colors, { x: sd.len / 2, y: band.h / 2 })} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// 엘리베이터 문 (지점 안, 서쪽·동쪽 벽). 앞에 서면 문짝이 주황으로 바뀌고 부름 버튼이 켜집니다.
// label: 층 표시판 글자 (지금 층, "2F"). 무리(group)를 벽에서 지점 안쪽(+Z)을 보게 돌려 그립니다.
export function ElevatorDoor({ box, height, near, nearColor, label }: { box: Box; height: number; near: boolean; nearColor: string; label: string }) {
  const E = ELEVATOR
  const alongZ = box.d > box.w // 서쪽·동쪽 벽이면 문 너비가 z 쪽
  const len = alongZ ? box.d : box.w
  const thick = alongZ ? box.w : box.d
  // 안쪽을 보는 방향: 서쪽 벽이면 +X(π/2), 동쪽 벽이면 -X, 북쪽 벽이면 +Z(0), 남쪽 벽이면 -Z
  const rotY = alongZ ? (box.x < 0 ? Math.PI / 2 : -Math.PI / 2) : box.z < 0 ? 0 : Math.PI
  const face = thick / 2
  const panelW = len / 2 - E.gap
  const sign = labelTexture(label, '#111111', '#f59e0b')
  const signH = (E.indicator.w * LABEL_PX.h) / LABEL_PX.w
  return (
    <group position={[box.x, 0, box.z]} rotation={[0, rotY, 0]}>
      {/* 크롬 틀: 양쪽 기둥 + 위 가로대 */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (len / 2 + E.frameW / 2), height / 2, face]}>
          <boxGeometry args={[E.frameW, height, E.panelT * 2]} />
          <meshStandardMaterial color="#c9ccd2" {...CHROME} />
        </mesh>
      ))}
      <mesh position={[0, height + E.frameW / 2, face]}>
        <boxGeometry args={[len + E.frameW * 2, E.frameW, E.panelT * 2]} />
        <meshStandardMaterial color="#c9ccd2" {...CHROME} />
      </mesh>
      {/* 문짝 두 장 (가운데 틈) */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (panelW / 2 + E.gap), height / 2, face + E.panelT / 2]}>
          <boxGeometry args={[panelW, height, E.panelT]} />
          <meshStandardMaterial color={near ? nearColor : '#a9adb3'} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* 층 표시판 */}
      <mesh position={[0, height + E.frameW + E.indicator.y, face + 0.01]}>
        <planeGeometry args={[E.indicator.w, signH]} />
        <meshBasicMaterial map={sign} transparent />
      </mesh>
      {/* 부름 버튼: 판 + 둥근 버튼 */}
      <group position={[len / 2 + E.frameW + E.button.out, E.button.y, face]}>
        <mesh>
          <boxGeometry args={[0.1, 0.18, 0.02]} />
          <meshStandardMaterial color="#c9ccd2" {...CHROME} />
        </mesh>
        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[E.button.r, E.button.r, 0.01, 16]} />
          <meshStandardMaterial color={near ? '#f59e0b' : '#e8e6e2'} emissive={near ? '#f59e0b' : '#000000'} emissiveIntensity={near ? 1 : 0} />
        </mesh>
      </group>
    </group>
  )
}

// ── 숨 라운지 (휴식방) ───────────────────────────────────────────────
// 매끈하지 않게: 모두 roughness 1, 금속감 없음. 벽·천창은 콘크리트 무늬로 푸석한 결을 냅니다.

// 둥근 곡선 벽: 문·엘리베이터 쪽(gaps)을 비운 원호들 + 벽을 따라 아래가 넓은 곡선 기둥.
// three.js 원기둥의 각도(theta)는 x = sin, z = cos 이라 자리 각도 규칙(0 = 남쪽)과 같습니다.
function RoundWall({ round, height }: { round: RoundRoom; height: number }) {
  const R = ROUND_ROOM
  const half = R.gapHalf / round.r
  const gaps = [...round.gaps].map((g) => ((g % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b)
  // 비운 쪽 사이사이의 원호 [시작, 길이]
  const arcs: [number, number][] = gaps.length
    ? gaps.map((g, i) => {
        const next = i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + Math.PI * 2
        return [g + half, next - g - half * 2] as [number, number]
      })
    : [[0, Math.PI * 2]]
  const map = concreteTexture([round.color, round.fin], { x: 6, y: 1 })
  const fins = Array.from({ length: round.fins }, (_, i) => (i / round.fins) * Math.PI * 2).filter((a) => !inRoundGap(round, a))
  return (
    <group>
      {arcs.map(([start, len], i) => (
        <mesh key={i} position-y={height / 2}>
          <cylinderGeometry args={[round.r, round.r, height, 96, 1, true, start, len]} />
          <meshStandardMaterial map={map} roughness={1} side={DoubleSide} />
        </mesh>
      ))}
      {fins.map((a, i) => (
        // 곡선 기둥: 아래가 넓게 벌어진 원기둥을 벽 쪽으로 납작하게 (가운데를 보게 돌림)
        <group key={i} position={[Math.sin(a) * (round.r - R.fin.out / 2), 0, Math.cos(a) * (round.r - R.fin.out / 2)]} rotation-y={a}>
          <mesh position-y={height / 2} scale={[R.fin.w, 1, R.fin.out]}>
            <cylinderGeometry args={[0.4, 0.75, height, 24]} />
            <meshStandardMaterial color={round.fin} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 천창: 천장 구멍(R)에서 위로 좁아지는 깔때기(동심원 홈) + 맨 위 빛나는 판 + 아래로 비추는 빛
function DomeSkylight({ dome, height }: { dome: Dome; height: number }) {
  const geom = useMemo(() => {
    // 옆모습: 바깥(R, 0)에서 안쪽 위(r, depth)로. 줄마다 살짝 턱을 둬 동심원 홈이 보이게
    const pts: Vector2[] = []
    for (let i = 0; i <= DOME.rings; i++) {
      const t = i / DOME.rings
      const rr = dome.R + (dome.r - dome.R) * t
      const y = dome.depth * Math.sin((t * Math.PI) / 2) // 아래는 완만, 위로 갈수록 가파르게
      pts.push(new Vector2(rr, y))
      if (i < DOME.rings) pts.push(new Vector2(rr - 0.03, y + 0.02))
    }
    return new LatheGeometry(pts, 96)
  }, [dome])
  const map = concreteTexture([dome.color, '#d8d3c5'], { x: 8, y: 2 })
  return (
    <group position={[dome.x, height, dome.z]}>
      <mesh geometry={geom}>
        <meshStandardMaterial map={map} roughness={1} side={DoubleSide} />
      </mesh>
      <mesh position-y={dome.depth} rotation-x={Math.PI / 2}>
        <circleGeometry args={[dome.r, 48]} />
        <meshBasicMaterial color={dome.glow} side={DoubleSide} />
      </mesh>
      <pointLight position-y={dome.depth - 0.4} color={dome.glow} intensity={DOME.intensity} distance={DOME.distance} decay={1.2} />
    </group>
  )
}

// 가운데 돌 수반 + 수면 + 낮게 깔린 안개 덩이 (천천히 돌고 부풀었다 줄었다)
function FogBasin({ basin }: { basin: Basin }) {
  const fog = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = fog.current
    if (!g) return
    g.rotation.y = clock.elapsedTime * 0.05
    g.children.forEach((c, i) => {
      const k = 1 + Math.sin(clock.elapsedTime * 0.6 + i * 1.7) * 0.12
      c.scale.set(k, 0.28 * k, k)
    })
  })
  const B = BASIN
  return (
    <group position={[basin.x, 0, basin.z]}>
      <mesh position-y={B.h / 2}>
        <cylinderGeometry args={[basin.r, basin.r * B.foot, B.h, 48]} />
        <meshStandardMaterial color={basin.color} roughness={1} />
      </mesh>
      <mesh position-y={B.h + 0.001} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[basin.r - 0.08, 48]} />
        <meshStandardMaterial color={basin.water} roughness={0.9} />
      </mesh>
      <group ref={fog}>
        {Array.from({ length: B.fog }, (_, i) => {
          const a = (i / B.fog) * Math.PI * 2
          const rr = basin.r * (i % 2 ? 0.7 : 1.15)
          return (
            <mesh key={i} position={[Math.sin(a) * rr, B.fogY + (i % 3) * 0.08, Math.cos(a) * rr]}>
              <sphereGeometry args={[0.7, 16, 12]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} roughness={1} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

// 누워 쉬는 라운지 소파. 옆모습(LOUNGER.profile)을 폭만큼 밀어 만든 쿠션 + 그 아래 받침 + 받침대 + 머리 베개.
// 무리는 자리(의자 자리 = 엉덩이)에 두고 rot 방향(가운데 쪽)이 발 쪽입니다. color: 쿠션 색(가까이·내 자리면 강조색)
export function Lounger({ x, z, rot, color, base, pillow }: { x: number; z: number; rot: number; color: string; base: string; pillow: string }) {
  const L = LOUNGER
  const { cushion, frame } = useMemo(() => {
    // 옆모습 띠: 위 선(top)과 그 아래로 t 만큼 내린 선으로 닫은 모양
    const strip = (top: [number, number][], t: number) => {
      const sh = new Shape()
      sh.moveTo(top[0][0], top[0][1])
      top.slice(1).forEach(([u, v]) => sh.lineTo(u, v))
      ;[...top].reverse().forEach(([u, v]) => sh.lineTo(u, v - t))
      sh.closePath()
      const g = new ExtrudeGeometry(sh, { depth: L.w, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 })
      g.translate(0, 0, -L.w / 2)
      return g
    }
    const under = L.profile.map(([u, v]) => [u, v - L.cushionT] as [number, number])
    return { cushion: strip(L.profile, L.cushionT), frame: strip(under, L.baseT) }
  }, [L])
  const [head] = L.profile
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      {/* 옆모습의 가로(u)가 앞쪽(+z)이 되도록 돌립니다 */}
      <group rotation-y={-Math.PI / 2}>
        <mesh geometry={cushion}>
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
        <mesh geometry={frame}>
          <meshStandardMaterial color={base} roughness={1} />
        </mesh>
      </group>
      {/* 받침대: 엉덩이 아래 넓게, 발 쪽 작게 */}
      <mesh position={[0, 0.15, 0.15]}>
        <boxGeometry args={[L.w * 0.7, 0.3, 0.55]} />
        <meshStandardMaterial color={base} roughness={1} />
      </mesh>
      <mesh position={[0, 0.12, 0.95]}>
        <boxGeometry args={[L.w * 0.5, 0.24, 0.2]} />
        <meshStandardMaterial color={base} roughness={1} />
      </mesh>
      {/* 머리 베개: 가로로 누운 원통 */}
      <mesh position={[0, head[1] + 0.02, head[0] + 0.1]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.1, 0.1, L.w * 0.8, 16]} />
        <meshStandardMaterial color={pillow} roughness={1} />
      </mesh>
    </group>
  )
}

// ── 캠빛 대학교 실내 ──────────────────────────────────────────────────
// 책상 높이·크기는 다른 책상과 같게(0.74m, 1.2×0.6). rot 방향(앉은 사람이 보는 쪽)이 책상 안쪽입니다.
const CAMPUS_DESK = { h: 0.74, w: 1.2, d: 0.6, top: 0.04, leg: 0.04 }
const CARREL = { panelH: 0.5, panelT: 0.025, panel: '#d9cfbd', lampShade: '#1f6b3a', lampGlow: '#ffe7a8' }
const COMPUTER = { screen: { w: 0.56, h: 0.34 }, frame: '#2a2d33', glow: '#2b4a6b', keyboard: '#3a3d44' }
const BOARD_FRAME = '#6b4a2e'

// 책상 상판 + 다리 네 개 (원목)
function DeskBody({ color }: { color: string }) {
  const D = CAMPUS_DESK
  return (
    <group>
      <mesh position-y={D.h - D.top / 2}>
        <boxGeometry args={[D.w, D.top, D.d]} />
        <meshStandardMaterial color={color} {...WOOD} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (D.w / 2 - 0.05), (D.h - D.top) / 2, sz * (D.d / 2 - 0.05)]}>
          <boxGeometry args={[D.leg, D.h - D.top, D.leg]} />
          <meshStandardMaterial color={color} {...WOOD} />
        </mesh>
      )))}
    </group>
  )
}

// 도서관 칸막이 책상: 책상 + 앞·양옆 칸막이 + 초록 갓 독서등(은은한 빛)
export function Carrel({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const D = CAMPUS_DESK
  const C = CARREL
  const y = D.h + C.panelH / 2
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <DeskBody color={color} />
      {/* 칸막이: 앉은 사람 앞(+z)과 양옆 */}
      <mesh position={[0, y, D.d / 2 - C.panelT / 2]}>
        <boxGeometry args={[D.w, C.panelH, C.panelT]} />
        <meshStandardMaterial color={C.panel} roughness={0.9} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (D.w / 2 - C.panelT / 2), y, 0]}>
          <boxGeometry args={[C.panelT, C.panelH, D.d]} />
          <meshStandardMaterial color={C.panel} roughness={0.9} />
        </mesh>
      ))}
      {/* 초록 독서등: 받침 + 기둥 + 반원통 갓 (아랫면이 따뜻하게 빛남) */}
      <group position={[-D.w / 2 + 0.2, D.h, D.d / 2 - 0.15]}>
        <mesh position-y={0.01}>
          <cylinderGeometry args={[0.06, 0.07, 0.02, 12]} />
          <meshStandardMaterial color="#b08d3c" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position-y={0.14}>
          <cylinderGeometry args={[0.008, 0.008, 0.26, 6]} />
          <meshStandardMaterial color="#b08d3c" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.1, 0.28, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.06, 0.06, 0.3, 12, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color={C.lampShade} side={DoubleSide} />
        </mesh>
        <mesh position={[0.1, 0.27, 0]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[0.28, 0.1]} />
          <meshStandardMaterial color={C.lampGlow} emissive={C.lampGlow} emissiveIntensity={0.8} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

// 정보관 컴퓨터 책상: 책상 + 모니터(받침·화면이 푸르게 빛남) + 키보드
export function ComputerDesk({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const D = CAMPUS_DESK
  const M = COMPUTER
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <DeskBody color={color} />
      <group position={[0, D.h, D.d / 2 - 0.15]}>
        <mesh position-y={0.01}>
          <boxGeometry args={[0.2, 0.02, 0.14]} />
          <meshStandardMaterial color={M.frame} />
        </mesh>
        <mesh position-y={0.1}>
          <boxGeometry args={[0.04, 0.18, 0.03]} />
          <meshStandardMaterial color={M.frame} />
        </mesh>
        <mesh position-y={0.19 + M.screen.h / 2}>
          <boxGeometry args={[M.screen.w + 0.03, M.screen.h + 0.03, 0.025]} />
          <meshStandardMaterial color={M.frame} />
        </mesh>
        {/* 화면: 앉은 사람 쪽(-z)을 봄 */}
        <mesh position={[0, 0.19 + M.screen.h / 2, -0.014]} rotation-y={Math.PI}>
          <planeGeometry args={[M.screen.w, M.screen.h]} />
          <meshStandardMaterial color={M.glow} emissive={M.glow} emissiveIntensity={0.7} />
        </mesh>
      </group>
      <mesh position={[0, D.h + 0.01, -0.05]}>
        <boxGeometry args={[0.44, 0.02, 0.14]} />
        <meshStandardMaterial color={M.keyboard} />
      </mesh>
    </group>
  )
}

// 계단식 단 (강의실): 원목 판 + 앞쪽 가장자리 띠
function RiserStep({ riser }: { riser: Riser }) {
  return (
    <group position={[riser.x, 0, riser.z]}>
      <mesh position-y={riser.h / 2}>
        <boxGeometry args={[riser.w, riser.h, riser.d]} />
        <meshStandardMaterial color="#8a6a4a" {...WOOD} />
      </mesh>
      <mesh position={[0, riser.h + 0.005, -riser.d / 2 + 0.04]}>
        <boxGeometry args={[riser.w, 0.01, 0.06]} />
        <meshStandardMaterial color="#d9c9a8" />
      </mesh>
    </group>
  )
}

// 칠판 (강의실): 원목 틀 + 짙은 초록 판 + 분필 글씨. 3단계에서 공동 시간표를 이 칠판에 씁니다.
function Blackboard({ board }: { board: Board }) {
  const pose = wallPose(board.x, board.z, board.face, 1.75)
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = Math.round((1024 * board.h) / board.w)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#244634'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = 'rgba(240,240,230,.85)'
    ctx.font = `600 ${Math.round(c.height * 0.16)}px "Comic Sans MS", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(board.text, c.width / 2, c.height / 2)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [board.text, board.w, board.h])
  return (
    <group position={[pose.x, pose.y, pose.z]} rotation-y={pose.rotY}>
      <mesh position-z={-0.02}>
        <boxGeometry args={[board.w + 0.16, board.h + 0.16, 0.04]} />
        <meshStandardMaterial color={BOARD_FRAME} {...WOOD} />
      </mesh>
      <mesh position-z={0.005}>
        <planeGeometry args={[board.w, board.h]} />
        <meshStandardMaterial map={texture} roughness={0.95} />
      </mesh>
      {/* 분필 받침 */}
      <mesh position={[0, -board.h / 2 - 0.1, 0.06]}>
        <boxGeometry args={[board.w, 0.04, 0.1]} />
        <meshStandardMaterial color={BOARD_FRAME} {...WOOD} />
      </mesh>
    </group>
  )
}
