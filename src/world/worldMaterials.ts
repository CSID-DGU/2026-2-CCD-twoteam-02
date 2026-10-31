// 광장 월드의 색과 재질 (#315, #316). 화면 부품(WorldDecor)과 하늘(WorldSky)이 같이 씁니다.
//
// 재질은 여기서 한 번 만들어 같이 씁니다. (컴포넌트마다 새로 만들면 같은 색이라도 재질이 따로 생김)
// 밤에는 가로등 등과 창문이 빛납니다. 빛나는 정도는 WorldSky 가 매 프레임 setNightGlow 로 바꿉니다.
// (.tsx 에서 컴포넌트가 아닌 것을 내보내면 개발 서버의 빠른 새로고침이 깨져서 따로 둔 파일입니다)
import * as THREE from 'three'
import { groundTextures } from './worldTextures'

// 색
export const COLOR = {
  grass: '#7cb36b',
  plaza: '#d9cdb8',
  path: '#cfc2aa',
  brick: '#cf9474', // 캠리단길 벽돌 길 (무늬 그림의 색조)
  gravel: '#cfc6b6', // 캠리단길 자갈 띠
  stone: '#b9b2a6',
  water: '#5fb3d9',
  waterLight: '#8ccfeb',
  trunk: '#7a5534',
  leaves: '#3f8f4a',
  leavesTop: '#4fa65a',
  wood: '#a0784d',
  iron: '#3a3f47',
  lampGlow: '#fff6d5',
  window: '#2b3a4a',
  fence: '#9a7b55',
  // 입구 문: 지금 로비 문과 같은 색
  doorOpen: '#4ade80',
  doorSoon: '#6b7280',
  near: '#f59e0b',
}

// 밤 빛남 (#316): 가로등 등은 낮에도 살짝, 밤에 밝게. 창문은 밤에만 따뜻한 노란빛
const GLOW = { lampDay: 0.3, lampNight: 1.6, window: 0.9, windowColor: '#ffcf7a' }

// 재질 (모듈에서 한 번)
const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, ...extra })
export const MAT = {
  grass: mat(COLOR.grass),
  plaza: mat(COLOR.plaza),
  path: mat(COLOR.path),
  brick: mat(COLOR.brick),
  gravel: mat(COLOR.gravel),
  stone: mat(COLOR.stone),
  water: mat(COLOR.water),
  trunk: mat(COLOR.trunk),
  leaves: mat(COLOR.leaves),
  leavesTop: mat(COLOR.leavesTop),
  wood: mat(COLOR.wood),
  iron: mat(COLOR.iron),
  lampGlow: mat(COLOR.lampGlow, { emissive: COLOR.lampGlow, emissiveIntensity: GLOW.lampDay }),
  window: mat(COLOR.window, { emissive: GLOW.windowColor, emissiveIntensity: 0 }),
  fence: mat(COLOR.fence),
  doorOpen: mat(COLOR.doorOpen),
  doorSoon: mat(COLOR.doorSoon),
  near: mat(COLOR.near),
}
// 밤 빛남을 바꿉니다 (glow 0 낮 ~ 1 밤). 가로등·창문 재질은 모든 가로등·건물이 같이 쓰므로 한 번 바꾸면 전부 바뀝니다.
// 매 프레임 불려도 값이 그대로면 재질을 건드리지 않습니다.
let lastGlow = -1
export function setNightGlow(glow: number) {
  if (glow === lastGlow) return
  lastGlow = glow
  MAT.lampGlow.emissiveIntensity = GLOW.lampDay + (GLOW.lampNight - GLOW.lampDay) * glow
  MAT.window.emissiveIntensity = GLOW.window * glow
}

// 건물마다 다른 벽·지붕 색은 색별로 한 번만 만듭니다.
const colorMats = new Map<string, THREE.MeshStandardMaterial>()
export function colorMat(color: string) {
  let m = colorMats.get(color)
  if (!m) {
    m = mat(color)
    colorMats.set(color, m)
  }
  return m
}

// ── 눈 쌓임 (#329) ──────────────────────────────────────────────────
// 실제 서울 적설(Open-Meteo snow_depth)로 정한 쌓인 정도(0~1)만큼 공용 재질의 색을 눈 색 쪽으로 섞습니다.
// 새 물체를 더하지 않고 색만 바꾸므로 가볍습니다. 재질을 여러 물체가 같이 쓰므로 한 번 바꾸면 광장·캠퍼스가 전부 바뀝니다.
//   잔디·캠퍼스 줄무늬 잔디·지붕·나무 위쪽 100%, 나무 아래쪽 50%, 광장 돌바닥·길 50%(밟힌 느낌, 길이 구분되게)
//   벤치·울타리·가로등·벽은 그대로
// 지붕과 줄무늬 잔디는 같은 색의 다른 부분(벽 등)까지 하얘지지 않게 전용 재질(roofMat·lawnMat)을 씁니다.
const SNOW_COLOR = new THREE.Color('#f2f5f9')
const SNOW_PART = { full: 1, half: 0.5 } // 재질마다 덮이는 정도 (쌓인 정도에 곱함)
const COVER_STEP = 100 // 쌓인 정도를 1/100 단위로 바꿈 (매 프레임 색을 다시 칠하지 않게)
type Snowy = { mat: THREE.MeshStandardMaterial; base: THREE.Color; part: number }
const snowy: Snowy[] = []
let lastCover = 0
const addSnowy = (m: THREE.MeshStandardMaterial, part: number) => {
  const s = { mat: m, base: m.color.clone(), part }
  snowy.push(s)
  m.color.copy(s.base).lerp(SNOW_COLOR, lastCover * part) // 이미 쌓여 있으면 새로 만든 재질도 맞춰 칠함
  return m
}
addSnowy(MAT.grass, SNOW_PART.full)
addSnowy(MAT.leavesTop, SNOW_PART.full)
addSnowy(MAT.leaves, SNOW_PART.half)
addSnowy(MAT.plaza, SNOW_PART.half)
addSnowy(MAT.path, SNOW_PART.half)
addSnowy(MAT.brick, SNOW_PART.half)
addSnowy(MAT.gravel, SNOW_PART.full)

// 지붕 전용 재질 (색별로 한 번만). 눈이 오면 다 덮임
const roofMats = new Map<string, THREE.MeshStandardMaterial>()
export function roofMat(color: string) {
  let m = roofMats.get(color)
  if (!m) {
    m = addSnowy(mat(color), SNOW_PART.full)
    roofMats.set(color, m)
  }
  return m
}

// 줄무늬 잔디 전용 재질 (색별로 한 번만). 눈이 오면 다 덮임
const lawnMats = new Map<string, THREE.MeshStandardMaterial>()
export function lawnMat(color: string) {
  let m = lawnMats.get(color)
  if (!m) {
    m = addSnowy(mat(color), SNOW_PART.full)
    lawnMats.set(color, m)
  }
  return m
}

// 쌓인 정도를 바꿉니다 (0 없음 ~ 1 다 덮임). WorldSky 가 매 프레임 불러도 1/100 단위로 바뀔 때만 다시 칠합니다.
export function setSnowCover(cover: number) {
  const c = Math.round(Math.min(1, Math.max(0, cover)) * COVER_STEP) / COVER_STEP
  if (c === lastCover) return
  lastCover = c
  for (const s of snowy) s.mat.color.copy(s.base).lerp(SNOW_COLOR, c * s.part)
}

// 캠리단길 바닥 무늬(돌·벽돌·자갈)를 재질에 붙입니다. 처음 그릴 때 한 번만 (캔버스는 브라우저에서만 만들 수 있어 모듈을 읽을 때가 아니라 그때)
const BUMP = 1.2 // 요철 세기
let textured = false
export function applyGroundTextures() {
  if (textured) return
  textured = true
  const t = groundTextures()
  for (const [m, pair] of [[MAT.plaza, t.cobble], [MAT.brick, t.brick], [MAT.gravel, t.gravel]] as const) {
    m.map = pair.map
    m.bumpMap = pair.bump
    m.bumpScale = BUMP
    m.needsUpdate = true
  }
}
