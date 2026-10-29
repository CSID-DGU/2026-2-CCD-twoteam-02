// 지점 테마 소품 (#57): 천장·팬·네온 띠·벽 액자·타일 카운터·스툴.
// 전부 상자·원통과 캔버스 텍스처로 만들고 외부 모델은 없습니다. 테마가 없는 지점은 아무것도 그리지 않습니다.
// 천장은 아래를 향한 한 면만 그려서, 위에서 내려다보는 2D 카메라·미니맵에서는 보이지 않고 1인칭·좌석에서만 보입니다.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Box } from './layout'
import { FAN, FRAME, STOOL, WALL_HEIGHT, WALL_THICKNESS, framePose } from './theme'
import type { BranchTheme, FanSpot, Frame } from './theme'
import { checkerTexture, posterTexture, tileTexture } from './patternTexture'

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
  return (
    <group>
      {theme.ceiling && <Ceiling color={theme.ceiling.color} size={size} />}
      {theme.ceiling?.fans?.map((f, i) => <CeilingFan key={i} spot={f} />)}
      {theme.wall?.neon && <NeonStrip color={theme.wall.neon} size={size} />}
      {theme.frames?.map((f, i) => <WallFrame key={i} frame={f} />)}
    </group>
  )
}

// 천장: 아래를 보는 평면. planeGeometry 의 앞면은 +z 라 x 축으로 +90° 돌리면 앞면이 -y(아래)를 봅니다.
function Ceiling({ color, size }: { color: string; size: Size }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
      <planeGeometry args={[size.w, size.d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

// 천장 팬: 허브 원통에 날개 4개. 매 프레임 y 축으로 돌립니다.
function CeilingFan({ spot }: { spot: FanSpot }) {
  const group = useRef<Group>(null)
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * FAN.turnsPerSec * Math.PI * 2
  })
  return (
    <group ref={group} position={[spot.x, WALL_HEIGHT - FAN.hubH / 2, spot.z]}>
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
function NeonStrip({ color, size }: { color: string; size: Size }) {
  const y = WALL_HEIGHT - NEON.dropFromCeiling
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
        <meshBasicMaterial map={posterTexture(frame.text, frame.bg)} />
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
