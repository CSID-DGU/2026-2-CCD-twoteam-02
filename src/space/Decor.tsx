// 지점 테마 소품 (#57): 천장·팬·네온 띠·벽 액자·타일 카운터·스툴.
// 전부 상자·원통과 캔버스 텍스처로 만들고 외부 모델은 없습니다. 테마가 없는 지점은 아무것도 그리지 않습니다.
// 천장은 아래를 향한 한 면만 그려서, 위에서 내려다보는 2D 카메라·미니맵에서는 보이지 않고 1인칭·좌석에서만 보입니다.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Box } from './layout'
import { ARCH_DOOR, BAR_STOOL, DINER_DESK, FAN, FRAME, LAMP, SOFA, STOOL, TALL_DESK_HEIGHT, WALL_THICKNESS, ceilingHeightOf, framePose, wallPose } from './theme'
import type { BranchTheme, FanSpot, Frame, Menu, SharedTable } from './theme'
import { POSTER_PX, checkerTexture, menuTexture, signTexture, tileTexture } from './patternTexture'

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
      <mesh position={[0, 0, -0.015]}>
        <boxGeometry args={[menu.w + 0.08, menu.h + 0.08, 0.03]} />
        <meshStandardMaterial color="#c8ccd4" metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      <mesh>
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
export function BarTable({ table, color, chrome }: { table: SharedTable; color: string; chrome: string }) {
  return <DinerDesk x={table.x} z={table.z} size={{ w: table.w, d: table.d }} color={color} chrome={chrome} height={TALL_DESK_HEIGHT} legInset={0.3} />
}

// 바 스툴: 바닥 받침 + 크롬 기둥 + 둥근 방석. 높은 자리(tall)의 의자
export function BarStool({ x, z, color, chrome }: { x: number; z: number; color: string; chrome: string }) {
  const B = BAR_STOOL
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, B.baseH / 2, 0]}>
        <cylinderGeometry args={[B.baseR, B.baseR, B.baseH, 16]} />
        <meshStandardMaterial color={chrome} metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      <mesh position={[0, B.baseH + B.legH / 2, 0]}>
        <cylinderGeometry args={[B.legR, B.legR, B.legH, 12]} />
        <meshStandardMaterial color={chrome} metalness={CHROME.metalness} roughness={CHROME.roughness} />
      </mesh>
      <mesh position={[0, B.baseH + B.legH + B.seatH / 2, 0]}>
        <cylinderGeometry args={[B.seatR, B.seatR, B.seatH, 20]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

// 다이너 테이블: 빨간 상판 + 둘레 크롬 띠 + 크롬 다리 4개. 자리(x·z)와 크기는 상자 책상과 같습니다.
export function DinerDesk({
  x, z, size, color, chrome, height = DINER_DESK.height, legInset = DINER_DESK.legInset,
}: {
  x: number; z: number; size: { w: number; d: number }; color: string; chrome: string; height?: number; legInset?: number
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
      {/* 크롬 띠는 상판보다 조금 크고 낮아서 옆에서 테두리로 보입니다 */}
      <mesh position={[0, topY - 0.01, 0]}>
        <boxGeometry args={[size.w + D.trimOut, D.trimT, size.d + D.trimOut]} />
        <meshStandardMaterial color={chrome} metalness={0.6} roughness={0.3} />
      </mesh>
      {[
        [-lx, -lz],
        [lx, -lz],
        [-lx, lz],
        [lx, lz],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, legH / 2, dz]}>
          <cylinderGeometry args={[D.legR, D.legR, legH, 10]} />
          <meshStandardMaterial color={chrome} metalness={0.6} roughness={0.3} />
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

function Stool({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, STOOL.legH / 2, 0]}>
        <cylinderGeometry args={[STOOL.legR, STOOL.legR, STOOL.legH, 10]} />
        <meshStandardMaterial color={STOOL_LEG_COLOR} />
      </mesh>
      <mesh position={[0, STOOL.legH + STOOL.seatH / 2, 0]}>
        <cylinderGeometry args={[STOOL.seatR, STOOL.seatR, STOOL.seatH, 16]} />
        <meshStandardMaterial color={STOOL_SEAT_COLOR} />
      </mesh>
    </group>
  )
}
