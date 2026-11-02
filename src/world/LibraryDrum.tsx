// 캠빛 중앙도서관 바깥: 밝은 석재 원통 건물 (네모 Building 대신 그립니다).
//
// 사진 참고(IMG_4662): 쌓은 석회암 원통, 맨 위 매끈한 프리즈 띠에 튀어나온 "LIBRARY" 글자와 코니스,
// 가운데 큰 격자 통창과 양옆 좁은 창, 창 사이 돌 기둥(프리즈 아래에서 끝남), 아래층 가운데 유리 두 짝 문과 양쪽 벽등, 문 앞 붉은 벽돌 길.
// (옆의 벽돌 날개 건물은 그리지 않음)
//
// 창은 벽에 실제로 뚫린 구멍(arcGeometry)이고, 조금 안쪽에 유리, 그 앞에 진짜 창살 막대가 있습니다.
// 유리(glass)는 가까이 가면 실제 도서관 실내, 멀면 실내 그림 (ShopInteriors·shopGlass). 낮에는 하늘이 비치고 밤에는 안에서 불이 켜진 듯 밝습니다.
//
// 밤 조명: 캠퍼스에는 거리 채움광(NightFill)이 없고 다른 건물은 그대로 둬야 하므로, 점광원을 더하지 않고 빛나는 재질로 흉내 냅니다.
//   - 돌 재질(washMaterial)이 바닥 업라이트에서 위로 번지는 빛, 코니스 아래 빛, 문 주변 빛, 약한 채움광을 스스로 냅니다
//   - 글자·벽등·업라이트 등은 빛나는 재질, 둘레 바닥·벽돌 길에는 가산 혼합 빛 판, 등 둘레에는 번짐(Points)
//   밝기는 모두 아래 NIGHT 에서 조절합니다. 값에 밤 빛남(nightGlow, 낮 0 ~ 밤 1)을 곱하므로 낮에는 아무 변화가 없습니다.
//
// 건물 기준 좌표(입구가 +Z)로 그리고 spec.x·z 에 놓아 입구 방향만큼 돌립니다 (Building 과 같음).
// 각도 θ: 0 이 +Z(입구), +θ 가 +X(바깥에서 보면 오른쪽). 점은 (r·sin θ, r·cos θ).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ArcBuilder, windowBars } from '../space/arcGeometry'
import type { ArcHole } from '../space/arcGeometry'
import { LIB_TILE, apronGlow, ashlar, glowSprite, libraryPicture, limestone } from '../space/libraryTextures'
import { ROOF_T } from './worldLogic'
import type { PlacedBuilding } from './worldLogic'
import { MAT, nightGlow, shopWindowMat, texturedRoofMat } from './worldMaterials'
import { groundTextures, tiledPlane } from './worldTextures'

// 크기 (m)
const DRUM_H = 8.2 // 원통 벽 높이 (코니스 시작)
const CORNICE_TOP = 8.4 // 코니스 맨 위 = 지붕 판이 놓이는 높이
const FRIEZE = { y0: 6.85, y1: 7.75, out: 0.17 } // 글자를 받치는 매끈한 띠. 기둥(PILASTER.d/2 = 0.15)보다 조금 더 나옴
const ROOF_OUT = 0.25 // 지붕 원판이 벽 밖으로 나온 길이
// 옆모습 [벽에서 나온 길이, 높이]: 아래부터 위로. 받침, 층 사이 돌 띠, 프리즈·코니스 (각진 면을 겹쳐 돌을 깎은 몰딩처럼)
const PROFILES: [number, number][][] = [
  [[0.15, 0], [0.15, 0.42], [0, 0.5]],
  [[0, 3.25], [0.08, 3.27], [0.08, 3.53], [0, 3.55]],
  [
    [0, 6.7], // 기둥 머리 위 처마돌 아래
    [0.2, 6.72],
    [0.2, 6.82],
    [FRIEZE.out, FRIEZE.y0],
    [FRIEZE.out, FRIEZE.y1],
    [0.25, 7.78],
    [0.25, 7.86],
    [0.2, 7.9],
    [0.2, 7.98],
    [0.3, 8.02],
    [0.3, 8.12],
    [0.48, DRUM_H],
    [0.5, 8.22],
    [0.5, 8.34],
    [ROOF_OUT, CORNICE_TOP],
  ],
]
const DENTIL = { y: 8.07, w: 0.1, h: 0.08, out: 0.06, step: 0.24 } // 코니스 아래 작은 돌 이빨
const SEGMENT_ROOF = 64 // 지붕 둘레 분할
// 창: 각도(라디안) 중심·반쪽 폭, 높이 구간 [아래, 위], 유리창 칸 수
const WINDOWS = [
  { a: 0, half: 0.27, y0: 3.75, y1: 6.45, cols: 3, rows: 5 }, // 가운데 큰 창
  ...[-1, 1].flatMap((s) => [
    { a: s * 0.55, half: 0.12, y0: 3.75, y1: 6.45, cols: 2, rows: 5 }, // 위층 옆 창
    { a: s * 0.55, half: 0.12, y0: 0.75, y1: 2.95, cols: 2, rows: 4 }, // 아래층 옆 창
  ]),
]
const GLASS_IN = 0.18 // 유리가 벽 면에서 들어간 깊이 (창 구멍 안쪽 면이 보임)
const BAR = { t: 0.055, d: 0.07, in: 0.12, color: '#55625e' } // 창살 굵기·깊이, 벽 면에서 들어간 길이, 색 (사진의 회녹색 금속 틀)
const PILASTER = { angles: [-0.77, -0.33, 0.33, 0.77], w: 0.5, d: 0.3, y0: 0.45, y1: 6.72, capH: 0.14, capOut: 0.06 } // 창 사이 돌 기둥 (프리즈 아래에서 끝남)
// 글자: 글자 높이, 글자 사이, 벽 쪽 시작(프리즈 면에 살짝 묻힘), 두께, 모서리 깎기
const LETTERS = { text: 'LIBRARY', y: FRIEZE.y0 + 0.09, h: 0.72, gap: 0.13, depth: 0.07, bevel: 0.008 }
const DOOR = { h: 2.2, glassH: 3.0, surroundH: 3.3, surroundD: 0.5, surroundBack: 0.3, surroundPad: 0.4, bar: 0.07, barD: 0.06, recess: 0.16 } // 입구 문 (유리 두 짝 + 위 투명창), recess: 돌 테두리 안으로 들어간 깊이
const DOOR_HANDLE = { x: 0.1, y: 1.05, h: 0.5, t: 0.03, out: 0.05 } // 문 손잡이
const BRONZE = { color: '#5a4836', metalness: 0.25, roughness: 0.45 } // 문틀·벽등 금속
const SCONCE = { a: 0.33, y: 2.3, w: 0.22, h: 0.6, d: 0.16, plate: { w: 0.3, h: 0.74, d: 0.03 }, cap: 0.03, rib: 0.015 } // 문 양쪽 기둥의 벽등 (금속 뒤판 + 빛나는 유리 + 위아래 뚜껑)
const PATH = { w: 4, d: 2.6, y: 0.025, tint: '#c4684f' } // 문 앞 붉은 벽돌 길: 폭·깊이(문 면에서 바깥으로)·높이(산책로 0.02 위)
const PATH_UNDER = 0.5 // 벽돌 길이 문 면 안쪽으로 들어가는 길이 (둥근 벽과 틈이 안 보이게)
const BRICK_SHEET = 2 // 벽돌 그림 한 장이 덮는 크기(m). 벽돌 0.25 × 0.125m
const STONE_BUMP = 0.7
const LETTER_COLOR = '#8a6c40'

// 밤 조명 세기: 여기만 고치면 됩니다. 모두 밤 빛남(0~1)이 곱해져 낮에는 0
const NIGHT = {
  color: [1.0, 0.76, 0.48] as const, // 돌에 비치는 빛 색 (선형값, 따뜻한 전구색)
  fill: 0.1, // 돌 전체 채움광 (거리의 NightFill 역할을 도서관 돌에만)
  uplight: 1.25, // 업라이트 한 개가 돌을 비추는 세기 (바닥 쪽 값)
  upFall: 2.8, // 업라이트 빛이 위로 줄어드는 길이(m). 크면 높이까지 밝음
  upWidth: 0.13, // 업라이트 빛 폭(라디안)
  eave: 0.32, // 코니스 아래·프리즈를 비추는 빛
  eaveY: 7.35, // 그 빛의 중심 높이
  eaveFall: 0.8, // 위아래로 줄어드는 길이(m)
  door: 0.45, // 문 둘레 돌에 번지는 빛
  letters: 1.6, // LIBRARY 글자 빛 세기
  halo: { big: 0.55, small: 0.4 }, // 벽등·업라이트 번짐
  apron: 0.34, // 건물 둘레 바닥에 번지는 빛
  pool: 0.5, // 문 앞 벽돌 길에 쏟아지는 빛
}
const UPLIGHT = { angles: [-2.7, -2.1, -1.5, -1.17, -0.77, -0.33, 0.33, 0.77, 1.17, 1.5, 2.1, 2.7], out: 0.42, w: 0.2, h: 0.09, d: 0.14 } // 바닥 업라이트 자리 (앞쪽 기둥 밑동마다)
const HALO_SIZE = { big: 2.4, small: 1.2 } // 번짐 지름(m)
const APRON_R = 12 // 건물 둘레 빛 판 반지름
const POOL = { w: 6.4, d: 6.4, y: 0.05 } // 문 앞 빛 판
const APRON_Y = 0.045

// ── 캐시된 재질 (렌더마다 새로 만들지 않음) ──────────────────────────────
const nightUniform = { value: 0 } // 돌 재질이 같이 쓰는 밤 빛남

// 돌 재질에 밤 빛을 끼워 넣음. 건물 좌표(모두 합친 지오메트리라 position 이 곧 건물 좌표) 높이·각도로 계산합니다.
function washMaterial(m: THREE.MeshStandardMaterial) {
  const N = NIGHT
  const lights = UPLIGHT.angles.map((a) => `up += glowAt(a, ${a.toFixed(3)});`).join('\n')
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDrum;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDrum = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        varying vec3 vDrum;
        float glowAt(float a, float c) {
          float d = abs(a - c);
          d = min(d, 6.28318 - d) / ${N.upWidth.toFixed(3)};
          return exp(-d * d);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uNight > 0.001) {
          float a = atan(vDrum.x, vDrum.z);
          float up = 0.0;
          ${lights}
          float h = vDrum.y;
          float eave = (h - ${N.eaveY.toFixed(2)}) / ${N.eaveFall.toFixed(2)};
          float door = exp(-a * a * 9.0) * exp(-(h - 3.0) * (h - 3.0) / 6.0);
          float k = ${N.fill.toFixed(2)} + ${N.uplight.toFixed(2)} * up * exp(-h / ${N.upFall.toFixed(2)}) + ${N.eave.toFixed(2)} * exp(-eave * eave) + ${N.door.toFixed(2)} * door;
          totalEmissiveRadiance += diffuseColor.rgb * vec3(${N.color.map((c) => c.toFixed(2)).join(',')}) * k * uNight;
        }`,
      )
  }
  return m
}

type Mats = {
  ashlar: THREE.MeshStandardMaterial
  smooth: THREE.MeshStandardMaterial
  bars: THREE.MeshStandardMaterial
  bronze: THREE.MeshStandardMaterial
  letters: THREE.MeshStandardMaterial
  path: THREE.MeshStandardMaterial
  picture: THREE.Material
  halo: { big: THREE.PointsMaterial; small: THREE.PointsMaterial }
  apron: THREE.MeshBasicMaterial
  pool: THREE.MeshBasicMaterial
}
let mats: Mats | null = null
function drumMats(): Mats {
  if (mats) return mats
  const stone = ashlar()
  const brick = groundTextures().brick
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1, 0.78, 0.5) }
  const halo = (size: number) => new THREE.PointsMaterial({ ...additive, map: glowSprite(), size, sizeAttenuation: true, opacity: 0 })
  mats = {
    ashlar: washMaterial(new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: STONE_BUMP, roughness: 0.92 })),
    smooth: washMaterial(new THREE.MeshStandardMaterial({ map: limestone(), roughness: 0.85 })),
    bars: new THREE.MeshStandardMaterial({ color: BAR.color, metalness: 0.2, roughness: 0.55 }),
    bronze: new THREE.MeshStandardMaterial(BRONZE),
    letters: new THREE.MeshStandardMaterial({ color: LETTER_COLOR, metalness: 0.35, roughness: 0.5, emissive: '#ffa63d', emissiveIntensity: 0 }),
    path: new THREE.MeshStandardMaterial({ color: PATH.tint, map: brick.map, bumpMap: brick.bump, bumpScale: 0.8, roughness: 0.9 }),
    picture: shopWindowMat(libraryPicture()), // 실내를 비추는 유리가 없을 때 (광장에서 건물을 다시 그릴 때 등)
    halo: { big: halo(HALO_SIZE.big), small: halo(HALO_SIZE.small) },
    apron: new THREE.MeshBasicMaterial({ ...additive, map: apronGlow(0.5), opacity: 0 }),
    pool: new THREE.MeshBasicMaterial({ ...additive, map: glowSprite(), opacity: 0 }),
  }
  return mats
}

// 밤 빛남을 재질에 반영 (매 프레임. 재질을 모든 도서관 그림이 같이 씀)
function applyNight(g: number) {
  nightUniform.value = g
  if (!mats) return
  mats.letters.emissiveIntensity = NIGHT.letters * g
  mats.halo.big.opacity = NIGHT.halo.big * g
  mats.halo.small.opacity = NIGHT.halo.small * g
  mats.apron.opacity = NIGHT.apron * g
  mats.pool.opacity = NIGHT.pool * g
}

// ── 글자: 윤곽을 직접 그린 굵은 세리프 (글꼴 파일 없이 진짜 두께) ──────────────
type Glyph = { w: number; shape: () => THREE.Shape }
const poly = (pts: number[][]) => {
  const s = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  return s
}
const GLYPHS: Record<string, Glyph> = {
  L: { w: 0.74, shape: () => poly([[0, 0], [0.7, 0], [0.74, 0.27], [0.66, 0.27], [0.6, 0.09], [0.3, 0.09], [0.3, 0.91], [0.42, 0.91], [0.42, 1], [0, 1], [0, 0.91], [0.12, 0.91], [0.12, 0.09], [0, 0.09]]) },
  I: { w: 0.4, shape: () => poly([[0, 0], [0.4, 0], [0.4, 0.09], [0.29, 0.09], [0.29, 0.91], [0.4, 0.91], [0.4, 1], [0, 1], [0, 0.91], [0.11, 0.91], [0.11, 0.09], [0, 0.09]]) },
  Y: { w: 0.9, shape: () => poly([[0.2, 0], [0.6, 0], [0.6, 0.09], [0.49, 0.09], [0.49, 0.42], [0.8, 0.91], [0.9, 0.91], [0.9, 1], [0.6, 1], [0.6, 0.91], [0.66, 0.91], [0.44, 0.58], [0.3, 0.91], [0.4, 0.91], [0.4, 1], [0, 1], [0, 0.91], [0.06, 0.91], [0.31, 0.42], [0.31, 0.09], [0.2, 0.09]]) },
  A: {
    w: 0.92,
    shape: () => {
      const s = poly([[0, 0], [0.3, 0], [0.3, 0.09], [0.22, 0.09], [0.29, 0.3], [0.6, 0.3], [0.67, 0.09], [0.58, 0.09], [0.58, 0], [0.92, 0], [0.92, 0.09], [0.85, 0.09], [0.52, 1], [0.42, 1], [0.08, 0.09], [0, 0.09]])
      s.holes.push(poly([[0.33, 0.39], [0.56, 0.39], [0.445, 0.76]]))
      return s
    },
  },
  B: {
    w: 0.8,
    shape: () => {
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      s.lineTo(0.46, 0)
      s.bezierCurveTo(0.7, 0, 0.8, 0.12, 0.8, 0.27)
      s.bezierCurveTo(0.8, 0.4, 0.7, 0.5, 0.58, 0.53)
      s.bezierCurveTo(0.68, 0.56, 0.74, 0.65, 0.74, 0.75)
      s.bezierCurveTo(0.74, 0.9, 0.62, 1, 0.44, 1)
      for (const [x, y] of [[0, 1], [0, 0.91], [0.11, 0.91], [0.11, 0.09], [0, 0.09]]) s.lineTo(x, y)
      s.closePath()
      const up = new THREE.Path()
      up.moveTo(0.29, 0.56)
      up.lineTo(0.4, 0.56)
      up.bezierCurveTo(0.5, 0.56, 0.56, 0.64, 0.56, 0.75)
      up.bezierCurveTo(0.56, 0.85, 0.5, 0.91, 0.4, 0.91)
      up.lineTo(0.29, 0.91)
      up.closePath()
      const low = new THREE.Path()
      low.moveTo(0.29, 0.09)
      low.lineTo(0.42, 0.09)
      low.bezierCurveTo(0.55, 0.09, 0.62, 0.17, 0.62, 0.27)
      low.bezierCurveTo(0.62, 0.39, 0.54, 0.47, 0.42, 0.47)
      low.lineTo(0.29, 0.47)
      low.closePath()
      s.holes.push(up, low)
      return s
    },
  },
  R: {
    w: 0.9,
    shape: () => {
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      for (const [x, y] of [[0.4, 0], [0.4, 0.09], [0.29, 0.09], [0.29, 0.46], [0.38, 0.46], [0.6, 0], [0.9, 0], [0.9, 0.09], [0.78, 0.09], [0.6, 0.5]]) s.lineTo(x, y)
      s.bezierCurveTo(0.7, 0.54, 0.76, 0.64, 0.76, 0.74)
      s.bezierCurveTo(0.76, 0.9, 0.64, 1, 0.44, 1)
      for (const [x, y] of [[0, 1], [0, 0.91], [0.11, 0.91], [0.11, 0.09], [0, 0.09]]) s.lineTo(x, y)
      s.closePath()
      const hole = new THREE.Path()
      hole.moveTo(0.29, 0.55)
      hole.lineTo(0.4, 0.55)
      hole.bezierCurveTo(0.5, 0.55, 0.58, 0.62, 0.58, 0.74)
      hole.bezierCurveTo(0.58, 0.85, 0.5, 0.91, 0.4, 0.91)
      hole.lineTo(0.29, 0.91)
      hole.closePath()
      s.holes.push(hole)
      return s
    },
  },
}

// LIBRARY 전체를 지오메트리 하나로 (곡면을 따라 글자마다 돌림). 글자 하나는 납작한 판이라 뒷면이 프리즈에 살짝 묻힘
function lettersGeometry(R: number) {
  const L = LETTERS
  const widths = L.text.split('').map((ch) => GLYPHS[ch].w * L.h)
  const total = widths.reduce((s, w) => s + w, 0) + L.gap * (widths.length - 1)
  const r = R + FRIEZE.out - 0.01
  let x = -total / 2
  const parts = L.text.split('').map((ch, i) => {
    const g = new THREE.ExtrudeGeometry(GLYPHS[ch].shape(), { depth: L.depth, bevelEnabled: true, bevelThickness: L.bevel, bevelSize: L.bevel / L.h, bevelSegments: 1, curveSegments: 8 })
    g.scale(L.h, L.h, 1)
    const mid = x + widths[i] / 2
    g.translate(-widths[i] / 2, L.y, r) // 글자 가운데를 기준으로 프리즈 면에
    g.rotateY(mid / r)
    x += widths[i] + L.gap
    return g
  })
  const merged = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  return merged
}

function holesOf(): (ArcHole & { cols: number; rows: number })[] {
  return WINDOWS.map((w) => ({ a0: w.a - w.half, a1: w.a + w.half, y0: w.y0, y1: w.y1, cols: w.cols, rows: w.rows }))
}

// open 은 받기만 함: 문틀은 청동색 하나, 입구 앞에 서면(near) 주황
export function LibraryDrum({ b, near, glass }: { b: PlacedBuilding; open?: boolean; near: boolean; glass?: THREE.Material }) {
  const R = Math.min(b.rect.w, b.rect.d) / 2
  const doorW = Math.max(b.door.w, b.door.d) // 문 폭은 지점 문 상자의 긴 변 (방향에 따라 w·d 가 바뀌므로)
  const m = drumMats()
  const roof = texturedRoofMat(b.spec.roof)
  const gw = doorW + 0.2 // 유리 폭
  const fz = R - DOOR.surroundBack + DOOR.surroundD // 입구 앞면 z (돌 테두리 앞면)
  const gz = fz - DOOR.recess // 유리·문이 놓인 면

  const geo = useMemo(() => {
    const holes = holesOf()
    // 쌓은 돌: 몸통(창 구멍), 창 구멍 안쪽, 돌 기둥, 입구 돌 테두리
    const stone = new ArcBuilder(LIB_TILE.ashlar)
    stone.wall(R, -Math.PI, Math.PI, PROFILES[0][2][1], DRUM_H, holes)
    for (const h of holes) stone.reveal(h, R, R - GLASS_IN)
    for (const a of PILASTER.angles) {
      const P = PILASTER
      stone.box(a, R, 0, (P.y0 + P.y1) / 2, P.w, P.y1 - P.y0, P.d)
      stone.box(a, R, 0, P.y0 + P.capH / 2, P.w + P.capOut * 2, P.capH, P.d + P.capOut) // 기둥 밑동
      stone.box(a, R, 0, P.y1 - P.capH / 2, P.w + P.capOut * 2, P.capH, P.d + P.capOut) // 기둥 머리
    }
    const sw = doorW + DOOR.surroundPad * 2
    const jamb = (sw - gw) / 2
    const zc = R - DOOR.surroundBack + DOOR.surroundD / 2
    for (const s of [-1, 1]) stone.box(0, zc, s * (gw / 2 + jamb / 2), DOOR.surroundH / 2, jamb, DOOR.surroundH, DOOR.surroundD)
    stone.box(0, zc, 0, (DOOR.glassH + DOOR.surroundH) / 2, gw, DOOR.surroundH - DOOR.glassH, DOOR.surroundD)
    stone.box(0, zc, 0, DOOR.surroundH + 0.04, sw + 0.16, 0.08, DOOR.surroundD + 0.1) // 테두리 위 돌 턱

    // 매끈한 돌: 받침, 층 사이 띠, 프리즈·코니스, 돌 이빨
    const smooth = new ArcBuilder(LIB_TILE.limestone)
    for (const p of PROFILES) smooth.revolve(p.map(([o, y]) => [R + o, y] as [number, number]))
    const dr = R + 0.3 + DENTIL.out / 2
    const dn = Math.round((Math.PI * 2 * dr) / DENTIL.step)
    for (let i = 0; i < dn; i++) smooth.box((i / dn) * Math.PI * 2, dr, 0, DENTIL.y, DENTIL.w, DENTIL.h, DENTIL.out)

    // 창살
    const bars = new ArcBuilder(1)
    for (const h of holes) windowBars(bars, h, R - BAR.in, h.cols, h.rows, BAR.t, BAR.d)

    // 유리: 창마다 UV 0~1 (멀리서는 실내 그림), 문 유리·위 투명창도 같이
    const panes = new ArcBuilder(1)
    for (const h of holes) panes.band(R - GLASS_IN, h.a0, h.a1, h.y0, h.y1, false, true)
    const hw = gw / 2
    panes.quad([-hw, 0, gz], [hw, 0, gz], [-hw, DOOR.glassH, gz], [hw, DOOR.glassH, gz], [0, 0, 1], [0, 0, 1, 1])

    // 문틀 (near 면 주황)
    const door = new ArcBuilder(1)
    const fr = gz + DOOR.barD / 2
    for (const x of [-hw, 0, hw]) door.box(0, fr, x, (x === 0 ? DOOR.h : DOOR.glassH) / 2, DOOR.bar, x === 0 ? DOOR.h : DOOR.glassH, DOOR.barD)
    for (const y of [0.03, DOOR.h, DOOR.glassH]) door.box(0, fr, 0, y, gw, DOOR.bar, DOOR.barD)
    for (const s of [-1, 1]) door.box(0, gz + DOOR.barD + DOOR_HANDLE.out / 2, s * DOOR_HANDLE.x, DOOR_HANDLE.y, DOOR_HANDLE.t, DOOR_HANDLE.h, DOOR_HANDLE.out)

    // 벽등·업라이트 금속 / 빛나는 유리
    const metal = new ArcBuilder(1)
    const lit = new ArcBuilder(1)
    const S = SCONCE
    const face = R + PILASTER.d / 2
    for (const s of [-1, 1]) {
      const a = s * S.a
      metal.box(a, face + S.plate.d / 2, 0, S.y, S.plate.w, S.plate.h, S.plate.d)
      const c = face + S.plate.d + S.d / 2
      lit.box(a, c, 0, S.y, S.w, S.h, S.d)
      for (const y of [S.y + S.h / 2 + S.cap / 2, S.y - S.h / 2 - S.cap / 2]) metal.box(a, c, 0, y, S.w + 0.04, S.cap, S.d + 0.04)
      for (const dx of [-S.w / 2, S.w / 2]) metal.box(a, c, dx, S.y, S.rib, S.h, S.d + 0.01) // 유리 양옆 살
    }
    const U = UPLIGHT
    for (const a of U.angles) {
      metal.box(a, R + U.out, 0, U.h / 2, U.w + 0.04, U.h, U.d + 0.04)
      lit.box(a, R + U.out, 0, U.h + 0.005, U.w, 0.01, U.d)
    }
    return {
      stone: stone.build(),
      smooth: smooth.build(),
      bars: bars.build(),
      panes: panes.build(),
      door: door.build(),
      metal: metal.build(),
      lit: lit.build(),
      letters: lettersGeometry(R),
    }
  }, [R, doorW, gw, gz])
  useLayoutEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  // 번짐 자리: 벽등(큰 것)·업라이트(작은 것)
  const halos = useMemo(() => {
    const big = [-1, 1].map((s) => {
      const r = R + PILASTER.d / 2 + SCONCE.plate.d + SCONCE.d + 0.15
      return new THREE.Vector3(Math.sin(s * SCONCE.a) * r, SCONCE.y, Math.cos(s * SCONCE.a) * r)
    })
    const small = UPLIGHT.angles.map((a) => new THREE.Vector3(Math.sin(a) * (R + UPLIGHT.out + 0.05), 0.18, Math.cos(a) * (R + UPLIGHT.out + 0.05)))
    return { big: new THREE.BufferGeometry().setFromPoints(big), small: new THREE.BufferGeometry().setFromPoints(small) }
  }, [R])
  useLayoutEffect(() => () => Object.values(halos).forEach((g) => g.dispose()), [halos])

  const night = useRef<THREE.Group>(null) // 밤에만 보이는 빛 판·번짐 (낮에는 그리기 호출도 없음)
  useFrame(() => {
    const g = nightGlow()
    applyNight(g)
    if (night.current) night.current.visible = g > 0.01
  })

  const pathLen = PATH.d + PATH_UNDER
  return (
    <group position={[b.spec.x, 0, b.spec.z]} rotation-y={b.angle}>
      {/* 쌓은 돌 몸통·기둥·입구, 매끈한 프리즈·몰딩·코니스 */}
      <mesh geometry={geo.stone} material={m.ashlar} />
      <mesh geometry={geo.smooth} material={m.smooth} />
      <mesh position-y={CORNICE_TOP + ROOF_T / 2} material={roof}>
        <cylinderGeometry args={[R + ROOF_OUT, R + ROOF_OUT, ROOF_T, SEGMENT_ROOF]} />
      </mesh>

      {/* 유리(실제 실내 또는 실내 그림)와 진짜 창살 */}
      <mesh geometry={geo.panes} material={glass ?? m.picture} />
      <mesh geometry={geo.bars} material={m.bars} />
      <mesh geometry={geo.door} material={near ? MAT.near : m.bronze} />

      {/* LIBRARY: 프리즈에서 튀어나온 입체 글자 */}
      <mesh geometry={geo.letters} material={m.letters} />

      {/* 벽등·바닥 업라이트 (빛나는 재질만, 실시간 조명 없음) */}
      <mesh geometry={geo.metal} material={m.bronze} />
      <mesh geometry={geo.lit} material={MAT.lampGlow} />

      {/* 문 앞 붉은 벽돌 길: 그림 한 장이 2m 라 벽돌이 늘어나지 않음 (바닥에 얹은 판, 부딪힘 없음) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PATH.y, R + (PATH.d - PATH_UNDER) / 2]} geometry={tiledPlane(PATH.w, pathLen, BRICK_SHEET)} material={m.path} />

      {/* 밤에만: 둘레 바닥·벽돌 길에 번지는 빛, 등 둘레 번짐 */}
      <group ref={night} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position-y={APRON_Y} material={m.apron}>
          <planeGeometry args={[APRON_R * 2, APRON_R * 2]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, POOL.y, R + PATH.d / 2]} material={m.pool}>
          <planeGeometry args={[POOL.w, POOL.d]} />
        </mesh>
        <points geometry={halos.big} material={m.halo.big} />
        <points geometry={halos.small} material={m.halo.small} />
      </group>
    </group>
  )
}
