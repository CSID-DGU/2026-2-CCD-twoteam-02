// 캠리단길 지점 파사드 (앞면). 지점마다 실내 분위기가 밖에서도 보이게 (참고: 카페 파사드 10종).
//
//   classic  별다방      크림 벽, 짙은 초록 줄무늬 차양, 검은 격자 큰 창, 둥근 간판, 칠판 입간판, 화분 / 초록 격자 유리문
//   diner    레트로카페  민트 벽 + 빨강 띠, 물결 끝 빨강·흰 차양, 동그란 간판, 크롬 테 창, 창 아래 빨간 스툴 / 진홍 문 + 둥근 창
//   garden   올리브 테라스 1층 테라코타 벽돌, 층마다 화분 난간, 양옆 덩굴, 테라코타 차양 / 아치형 나무 문
//   modern   흑요 라운지 검은 상자, 통유리 + 따뜻한 간접조명 띠, 금빛 글자 간판, 왼쪽 덩굴 / 검은 유리문 + 구리 테
//   woodbar  월넛 바     호두나무 판자 + 아래 붉은 벽돌, 금테 창, 벽 펜던트 전구, 술통 화분 / 둥근 창 나무 문
// 창에는 그 지점 실내 그림이 들어가 밤에 빛납니다(worldMaterials.shopWindowMat). 문은 지금처럼 앞에 서면 주황,
// 아직 안 연 지점은 회색. 좌표는 건물 실내 기준(입구가 +Z 쪽 앞면 z = d/2), 부딪힘·입구 자리는 그대로입니다.
import * as THREE from 'three'
import type { FacadeStyle } from './worldLogic'
import { MAT, colorMat, pictureMat, plantMat, shopWindowMat } from './worldMaterials'
import { awningTexture, interiorTexture, letterSignTexture } from './facadeTextures'
import type { SignLine } from './facadeTextures'
import { groundTextures } from './worldTextures'
import { bushShape, vineShape } from './plantShapes'

type V3 = [number, number, number]
type Props = { style: FacadeStyle; w: number; d: number; floorH: number; floors: number; doorX: number; doorW: number; doorH: number; name: string; floorSlugs: string[]; open: boolean; near: boolean }

// 여러 곳이 같이 쓰는 모양·재질 (처음 쓸 때 한 번)
const shared = new Map<string, unknown>()
function once<T>(key: string, make: () => T): T {
  if (!shared.has(key)) shared.set(key, make())
  return shared.get(key) as T
}
const bushGeo = () => once('bush', bushShape)
const vineGeo = (len: number) => once(`vine|${len.toFixed(2)}`, () => vineShape(len))
const brickMat = (color: string) =>
  once(`brick|${color}`, () => new THREE.MeshStandardMaterial({ color, map: groundTextures().brick.map, bumpMap: groundTextures().brick.bump }))

// 상자 하나
function B({ p, s, m }: { p: V3; s: V3; m: THREE.Material }) {
  return (
    <mesh position={p} material={m}>
      <boxGeometry args={s} />
    </mesh>
  )
}

// 실내가 비치는 창 + 테두리(+ 가운데 살)
function Pane({ style, x, y, z, w, h, frame, t = 0.08, bars = 0 }: { style: FacadeStyle; x: number; y: number; z: number; w: number; h: number; frame: THREE.Material; t?: number; bars?: number }) {
  const glass = shopWindowMat(interiorTexture(style))
  return (
    <group position={[x, y, z]}>
      <mesh position-z={0.01} material={glass}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <B p={[0, h / 2, 0.04]} s={[w + t, t, 0.08]} m={frame} />
      <B p={[0, -h / 2, 0.04]} s={[w + t, t, 0.08]} m={frame} />
      <B p={[-w / 2, 0, 0.04]} s={[t, h, 0.08]} m={frame} />
      <B p={[w / 2, 0, 0.04]} s={[t, h, 0.08]} m={frame} />
      {Array.from({ length: bars }, (_, i) => (
        <B key={i} p={[-w / 2 + ((i + 1) * w) / (bars + 1), 0, 0.04]} s={[t * 0.6, h, 0.06]} m={frame} />
      ))}
    </group>
  )
}

// 가게 이름 (영문 입체 글자, 판 없이 벽에 붙임). 지점 이름(한글)은 DB·안내에 그대로 쓰고 간판만 영어로
// 순바탕(serif)·교보손글씨(hand)·흘림체(script) 를 지점 분위기에 맞게 나눔. size 는 판 높이(w/2) 대비 글자 크기
const SIGN_TEXT: Record<FacadeStyle, SignLine[]> = {
  classic: [
    { text: 'STAR DABANG', font: 'serif', size: 0.2, spacing: 6 },
    { text: 'COFFEE · STUDY', font: 'serif', size: 0.07, spacing: 14, gap: 0.6 },
  ],
  diner: [
    { text: 'Retro', font: 'script', size: 0.46 },
    { text: 'CAFE', font: 'serif', size: 0.2, spacing: 14, gap: 0.1 },
  ],
  garden: [
    { text: 'Olive', font: 'hand', size: 0.36 },
    { text: 'TERRACE', font: 'serif', size: 0.13, spacing: 22, gap: 0.2 },
  ],
  modern: [
    { text: 'OBSIDIAN', font: 'serif', size: 0.2, spacing: 26 },
    { text: 'lounge', font: 'script', size: 0.15, gap: 0.15 },
  ],
  woodbar: [
    { text: 'Walnut', font: 'script', size: 0.3 },
    { text: 'BAR', font: 'serif', size: 0.13, spacing: 24, gap: 0.1 },
  ],
}
// 여러 층 건물(올리브 테라스 건물)은 상가 "캠리 스퀘어": 옥상 간판, 입구 옆 층별 안내 기둥, 위층마다 영문 가게 이름
const SQUARE_NAME: SignLine[] = [{ text: 'CAMRI SQUARE', font: 'serif', size: 0.2, spacing: 30 }]
const FLOOR_EN: Record<string, string> = { olive: 'OLIVE TERRACE', moss: 'MOSS GARDEN', stream: 'STREAM LOUNGE', breath: 'BREATH LOUNGE' }
const floorName = (slug: string) => FLOOR_EN[slug] ?? slug.toUpperCase()
// 글자 그림자가 반투명이라 alphaTest 로 자르지 않고 섞어 그림. 밤에도 읽히게 글자 앞면이 살짝 빛남
const letterMat = (t: THREE.Texture) =>
  once(`letters|${t.uuid}`, () => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3 }))
function Letters({ lines, face, side, x, y, z, w }: { lines: SignLine[]; face: string; side: string; x: number; y: number; z: number; w: number }) {
  return (
    <mesh position={[x, y, z]} material={letterMat(letterSignTexture(lines, face, side))}>
      <planeGeometry args={[w, w / 2]} />
    </mesh>
  )
}

// 줄무늬 차양: 벽(top)에서 앞으로 depth 만큼, 앞쪽이 내려가게 기울임
const AWNING_TILT = 0.42
function Awning({ x, top, z, w, depth, a, b, stripes, scallop }: { x: number; top: number; z: number; w: number; depth: number; a: string; b: string; stripes: number; scallop: boolean }) {
  return (
    <mesh
      position={[x, top - (depth / 2) * Math.sin(AWNING_TILT), z + (depth / 2) * Math.cos(AWNING_TILT)]}
      rotation-x={-Math.PI / 2 + AWNING_TILT}
      material={pictureMat(awningTexture(a, b, stripes, scallop))}
    >
      <planeGeometry args={[w, depth]} />
    </mesh>
  )
}

// 문 판 색: 앞에 서면 주황, 아직 안 연 지점은 회색, 아니면 지점 색
const doorPanel = (open: boolean, near: boolean, color: string) => (near ? MAT.near : open ? colorMat(color) : MAT.doorSoon)

// 둥근 창(포트홀) 문: 판 + 둥근 유리 + 테
function RoundDoor({ x, z, w, h, color, trim, open, near, style }: { x: number; z: number; w: number; h: number; color: string; trim: string; open: boolean; near: boolean; style: FacadeStyle }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, h / 2, 0.08]} s={[w, h, 0.16]} m={doorPanel(open, near, color)} />
      <mesh position={[0, h * 0.68, 0.17]} material={shopWindowMat(interiorTexture(style))}>
        <circleGeometry args={[w * 0.22, 24]} />
      </mesh>
      <mesh position={[0, h * 0.68, 0.18]} material={colorMat(trim)}>
        <torusGeometry args={[w * 0.22, 0.045, 8, 24]} />
      </mesh>
      <B p={[w * 0.36, h * 0.45, 0.2]} s={[0.05, 0.22, 0.05]} m={colorMat(trim)} />
    </group>
  )
}

// 유리문: 테두리(지점 색, 상태 따라 바뀜) + 실내가 비치는 유리 + 격자
function GlassDoor({ x, z, w, h, color, open, near, style, bars }: { x: number; z: number; w: number; h: number; color: string; open: boolean; near: boolean; style: FacadeStyle; bars: number }) {
  const frame = doorPanel(open, near, color)
  return (
    <group position={[x, 0, z]}>
      <Pane style={style} x={0} y={h / 2} z={0.04} w={w - 0.1} h={h - 0.1} frame={frame} t={0.12} bars={bars} />
      {bars > 0 && <B p={[0, h * 0.55, 0.08]} s={[w - 0.1, 0.06, 0.06]} m={frame} />}
    </group>
  )
}

// 아치 문: 나무 판 + 위 반원
function ArchDoor({ x, z, w, h, color, open, near }: { x: number; z: number; w: number; h: number; color: string; open: boolean; near: boolean }) {
  const m = doorPanel(open, near, color)
  const body = h - w / 2
  return (
    <group position={[x, 0, z]}>
      <B p={[0, body / 2, 0.08]} s={[w, body, 0.16]} m={m} />
      <mesh position={[0, body, 0.08]} rotation-x={Math.PI / 2} material={m}>
        <cylinderGeometry args={[w / 2, w / 2, 0.16, 20, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>
      <B p={[0, body / 2, 0.17]} s={[0.04, body * 0.9, 0.02]} m={colorMat('#5e4330')} />
      <mesh position={[w * 0.3, h * 0.42, 0.2]} material={colorMat('#c9a24a')}>
        <sphereGeometry args={[0.05, 10, 8]} />
      </mesh>
    </group>
  )
}

// 화분 (상자 + 관목)
function Planter({ p, size = 0.55, box = '#6b4a2e' }: { p: V3; size?: number; box?: string }) {
  const bush = bushGeo()
  return (
    <group position={p}>
      <B p={[0, size * 0.35, 0]} s={[size, size * 0.7, size]} m={colorMat(box)} />
      <mesh geometry={bush} material={plantMat('#86c656', false)} position-y={size * 0.6} scale={size * 1.1} />
    </group>
  )
}

// 덩굴 (늘어진 잎)
function Vine({ p, len }: { p: V3; len: number }) {
  const g = vineGeo(len)
  return <mesh geometry={g} material={plantMat('#7cc254', false)} position={p} />
}

export function Facade(props: Props) {
  const z = props.d / 2
  return (
    <group position-z={z}>
      {props.style === 'classic' && <Classic {...props} />}
      {props.style === 'diner' && <Diner {...props} />}
      {props.style === 'garden' && <GardenFront {...props} />}
      {props.style === 'modern' && <Modern {...props} />}
      {props.style === 'woodbar' && <WoodBar {...props} />}
    </group>
  )
}

// ── 지점별 (앞면 z = 0 기준) ──────────────────────────────────────────

function Classic({ w, floorH, doorX, doorW, doorH, open, near }: Props) {
  const green = '#1f4d36'
  const black = colorMat('#1d1d1d')
  const winW = (w - doorW - 2.2) / 2
  return (
    <>
      <B p={[0, floorH - 0.15, 0.12]} s={[w + 0.2, 0.3, 0.3]} m={colorMat(green)} />
      <Letters lines={SIGN_TEXT.classic} face="#f3ead8" side="#b08a3e" x={doorX} y={2.95} z={0.04} w={4} />
      <Awning x={0} top={2.55} z={0} w={w - 0.5} depth={1.0} a={green} b="#f3ead8" stripes={14} scallop={false} />
      {[-1, 1].map((side) => (
        <Pane key={side} style="classic" x={doorX + side * (doorW / 2 + 0.6 + winW / 2)} y={1.3} z={0} w={winW} h={1.6} frame={black} bars={2} />
      ))}
      <GlassDoor x={doorX} z={0} w={doorW} h={doorH} color={green} open={open} near={near} style="classic" bars={1} />
      {/* 칠판 입간판 */}
      <group position={[doorX + doorW / 2 + 1.2, 0, 0.9]} rotation-y={-0.4}>
        <mesh position-y={0.42} rotation-x={-0.18} material={colorMat('#2b2b2b')}>
          <boxGeometry args={[0.55, 0.8, 0.04]} />
        </mesh>
        <mesh position={[0, 0.42, -0.14]} rotation-x={0.18} material={colorMat('#6b4a2e')}>
          <boxGeometry args={[0.55, 0.8, 0.04]} />
        </mesh>
      </group>
      <Planter p={[doorX - doorW / 2 - 0.45, 0, 0.45]} box={green} />
      <Planter p={[doorX + doorW / 2 + 0.45, 0, 0.45]} box={green} />
    </>
  )
}

function Diner({ w, floorH, doorX, doorW, doorH, open, near }: Props) {
  const red = '#e33b3b'
  const chrome = colorMat('#d0d4dc')
  const winW = (w - doorW - 2) / 2
  return (
    <>
      <B p={[0, floorH - 0.35, 0.05]} s={[w + 0.02, 0.45, 0.12]} m={colorMat(red)} />
      <B p={[0, floorH - 0.62, 0.06]} s={[w + 0.02, 0.06, 0.12]} m={chrome} />
      {/* 동그란 간판 */}
      <group position={[doorX, floorH + 0.25, 0.2]}>
        <mesh rotation-x={Math.PI / 2} material={colorMat('#ffffff')}>
          <cylinderGeometry args={[0.75, 0.75, 0.12, 32]} />
        </mesh>
        <mesh position-z={0.07} material={colorMat('#ff2d55')}>
          <torusGeometry args={[0.72, 0.06, 8, 32]} />
        </mesh>
        <Letters lines={SIGN_TEXT.diner} face={red} side="#8f1d26" x={0} y={0} z={0.08} w={1.4} />
      </group>
      <Awning x={0} top={2.5} z={0} w={w - 0.3} depth={0.9} a={red} b="#ffffff" stripes={16} scallop />
      {[-1, 1].map((side) => {
        const x = doorX + side * (doorW / 2 + 0.5 + winW / 2)
        return (
          <group key={side}>
            <Pane style="diner" x={x} y={1.45} z={0} w={winW} h={1.3} frame={chrome} t={0.12} />
            <B p={[x, 0.78, 0.22]} s={[winW, 0.06, 0.4]} m={chrome} />
            {[-0.33, 0, 0.33].map((k) => (
              <group key={k} position={[x + k * winW, 0, 0.55]}>
                <B p={[0, 0.25, 0]} s={[0.05, 0.5, 0.05]} m={chrome} />
                <mesh position-y={0.52} material={colorMat(red)}>
                  <cylinderGeometry args={[0.17, 0.17, 0.08, 16]} />
                </mesh>
              </group>
            ))}
          </group>
        )
      })}
      <RoundDoor x={doorX} z={0} w={doorW} h={doorH} color="#7a1b1b" trim="#d0d4dc" open={open} near={near} style="diner" />
    </>
  )
}

function GardenFront({ w, floorH, floors, floorSlugs, doorX, doorW, doorH, open, near }: Props) {
  const brick = brickMat('#c97a52')
  const terra = '#c46a3f'
  const winW = (w - doorW - 2.4) / 2
  const height = floorH * floors
  return (
    <>
      {/* 1층 벽돌 앞면 (벽돌 무늬가 2m 마다 반복) */}
      <mesh position={[0, floorH * 0.42, 0.02]} material={brick}>
        <planeGeometry args={[w, floorH * 0.84]} />
      </mesh>
      <Letters lines={SIGN_TEXT.garden} face="#f7f3ea" side="#a9a196" x={doorX} y={3.0} z={0.05} w={3.4} />
      <Awning x={0} top={2.45} z={0} w={w - 0.6} depth={0.8} a={terra} b="#e8c3a0" stripes={12} scallop={false} />
      {[-1, 1].map((side) => (
        <Pane key={side} style="garden" x={doorX + side * (doorW / 2 + 0.7 + winW / 2)} y={1.25} z={0.03} w={winW} h={1.4} frame={colorMat('#5e4330')} bars={1} />
      ))}
      <ArchDoor x={doorX} z={0.02} w={doorW} h={doorH + 0.2} color="#a7774d" open={open} near={near} />
      {/* 위층 화분 난간 */}
      {Array.from({ length: floors - 1 }, (_, i) => {
        const y = (i + 1) * floorH
        return (
          <group key={i} position-y={y}>
            <B p={[0, 0.2, 0.3]} s={[w - 0.6, 0.4, 0.45]} m={colorMat(terra)} />
            {[-3.6, -1.8, 0, 1.8, 3.6].map((x) => (
              <Planter key={x} p={[x, 0.3, 0.3]} size={0.4} box={terra} />
            ))}
          </group>
        )
      })}
      {/* 양옆 덩굴 */}
      <Vine p={[-w / 2 + 0.15, 1.2, 0.12]} len={height - 1.4} />
      <Vine p={[w / 2 - 0.15, 1.6, 0.12]} len={height - 1.8} />
      <Planter p={[doorX - doorW / 2 - 0.5, 0, 0.5]} box={terra} />
      <Planter p={[doorX + doorW / 2 + 0.5, 0, 0.5]} box={terra} />
      {floors > 1 && <SquareSigns w={w} floorH={floorH} floorSlugs={floorSlugs} />}
    </>
  )
}

// 상가 간판들 (앞면 z = 0 기준)
const ROOF_TOP = 0.3 // 건물 지붕 판 두께 (WorldDecor ROOF.t)
const PYLON = { w: 1.4, h: 2.6, d: 0.18, x: 0.2 } // 층별 안내판 (건물 앞 모서리 바로 바깥에 선 판)
function SquareSigns({ w, floorH, floorSlugs }: { w: number; floorH: number; floorSlugs: string[] }) {
  const top = floorH * floorSlugs.length + ROOF_TOP
  const iron = MAT.iron
  const signW = 7
  // 안내판 글자: 상가 이름 아래 위층부터 "4F BREATH LOUNGE" …
  const directory: SignLine[] = [
    { text: 'CAMRI SQUARE', font: 'serif', size: 0.16, spacing: 10 },
    ...floorSlugs.map((slug, i) => ({ text: `${i + 1}F ${floorName(slug)}`, font: 'serif' as const, size: 0.13, gap: 0.35 })).reverse(),
  ]
  return (
    <>
      {/* 옥상 간판: 철제 틀 위에 입체 글자 */}
      {[-signW * 0.38, signW * 0.38].map((x) => (
        <B key={x} p={[x, top + 0.55, -0.4]} s={[0.08, 1.1, 0.08]} m={iron} />
      ))}
      <B p={[0, top + 0.35, -0.4]} s={[signW * 0.85, 0.06, 0.06]} m={iron} />
      <Letters lines={SQUARE_NAME} face="#f7f3ea" side="#8f8a80" x={0} y={top + 0.75} z={-0.33} w={signW} />
      {/* 위층 가게 이름: 화분 난간 위 벽에 작은 흰 글자 */}
      {floorSlugs.slice(1).map((slug, i) => (
        <Letters key={slug} lines={[{ text: floorName(slug), font: 'serif', size: 0.1, spacing: 12 }]} face="#f7f3ea" side="#8f8a80" x={0} y={(i + 1) * floorH + 2.15} z={0.04} w={4.4} />
      ))}
      {/* 층별 안내판: 건물 앞 왼쪽 모서리 바깥 */}
      <group position={[-w / 2 - PYLON.x - PYLON.w / 2, 0, 1.0]}>
        <B p={[0, PYLON.h / 2, 0]} s={[PYLON.w, PYLON.h, PYLON.d]} m={colorMat('#2a2d31')} />
        <Letters lines={directory} face="#f7f3ea" side="#55595f" x={0} y={PYLON.h - 0.55} z={PYLON.d / 2 + 0.01} w={PYLON.w - 0.1} />
      </group>
    </>
  )
}

function Modern({ w, floorH, doorX, doorW, doorH, open, near }: Props) {
  const black = colorMat('#0f0f10')
  const copper = '#b07a5a'
  const glassW = w - 1.2
  return (
    <>
      <B p={[0, floorH - 0.35, 0.08]} s={[w + 0.1, 0.7, 0.16]} m={colorMat('#1a1a1d')} />
      <Letters lines={SIGN_TEXT.modern} face="#e2c193" side="#7d5f3d" x={0} y={floorH - 0.35} z={0.17} w={3.6} />
      {/* 통유리 + 위 간접조명 띠 */}
      <Pane style="modern" x={0} y={1.42} z={0} w={glassW} h={2.4} frame={black} t={0.14} bars={3} />
      <B p={[0, 2.66, 0.12]} s={[glassW, 0.05, 0.08]} m={MAT.lampGlow} />
      <GlassDoor x={doorX} z={0.05} w={doorW} h={doorH} color={copper} open={open} near={near} style="modern" bars={0} />
      <Vine p={[-w / 2 + 0.2, 0.6, 0.12]} len={floorH - 0.6} />
    </>
  )
}

function WoodBar({ w, floorH, doorX, doorW, doorH, open, near }: Props) {
  const gold = colorMat('#c9a24a')
  const plank = colorMat('#5a3620')
  const brick = brickMat('#a8583f')
  const winW = (w - doorW - 2.6) / 2
  return (
    <>
      {/* 판자 줄 */}
      {Array.from({ length: 7 }, (_, i) => (
        <B key={i} p={[0, 1.35 + i * 0.33, 0.015]} s={[w, 0.03, 0.03]} m={plank} />
      ))}
      <mesh position={[0, 0.6, 0.02]} material={brick}>
        <planeGeometry args={[w, 1.2]} />
      </mesh>
      <group position={[doorX, floorH - 0.45, 0.1]}>
        <B p={[0, 0, 0]} s={[2.9, 0.75, 0.12]} m={colorMat('#3b2416')} />
        <Letters lines={SIGN_TEXT.woodbar} face="#e8c672" side="#7a5a22" x={0} y={0} z={0.07} w={2.6} />
      </group>
      {[-1, 1].map((side) => {
        const x = doorX + side * (doorW / 2 + 0.75 + winW / 2)
        return (
          <group key={side}>
            <Pane style="woodbar" x={x} y={1.75} z={0.02} w={winW} h={1.2} frame={gold} bars={1} />
            {/* 펜던트 전구 */}
            <B p={[x, 3.0, 0.35]} s={[0.02, 0.4, 0.02]} m={MAT.iron} />
            <B p={[x, 3.22, 0.18]} s={[0.04, 0.04, 0.36]} m={MAT.iron} />
            <mesh position={[x, 2.76, 0.35]} material={MAT.lampGlow}>
              <sphereGeometry args={[0.1, 12, 8]} />
            </mesh>
            {/* 술통 화분 */}
            <group position={[x, 0, 0.7]}>
              <mesh position-y={0.32} material={colorMat('#7a5236')}>
                <cylinderGeometry args={[0.3, 0.27, 0.64, 16]} />
              </mesh>
              {[0.12, 0.52].map((y) => (
                <mesh key={y} position-y={y} material={MAT.iron}>
                  <cylinderGeometry args={[0.305, 0.305, 0.04, 16]} />
                </mesh>
              ))}
              <Planter p={[0, 0.5, 0]} size={0.4} box="#7a5236" />
            </group>
          </group>
        )
      })}
      <RoundDoor x={doorX} z={0.02} w={doorW} h={doorH} color="#6b3f24" trim="#c9a24a" open={open} near={near} style="woodbar" />
    </>
  )
}
