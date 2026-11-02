// 캠빛 중앙도서관 질감 (이미지 파일 없이 캔버스로). 처음 쓸 때 한 번만 그리고 안·밖이 같이 씁니다.
//
//   ashlar       석회암 쌓은 돌: 블록마다 밝기 차이, 줄눈(요철 포함)
//   limestone    줄눈 없는 매끈한 돌 (프리즈·코니스)
//   marbleFloorMat 밝은 대리석 바닥 (판마다 다른 결, 줄눈, 은은한 광택)
//   oakGrain     책상·서가 나뭇결 (결이 u 방향)
//   plaster      곡면 벽·기둥 회벽 요철 (색은 재질 색)
//   glowSprite   둥근 불빛 번짐 (가산 혼합용)
//   apronGlow    건물 둘레 바닥에 번지는 빛
//   libraryPicture 멀리서 창에 보이는 실내 그림
// 그림은 RepeatWrapping 이고, UV 는 "미터 ÷ TILE" 로 넣습니다(arcGeometry). 그림 크기는 모두 512 이하.
import * as THREE from 'three'

export const LIB_TILE = { ashlar: 2.4, limestone: 2.4, grain: 1.6, plaster: 3 } // 그림 한 장이 덮는 크기(m)
const ASHLAR = { rows: 4, cols: 2, joint: 3, color: [226, 216, 194] } // 한 장에 돌 4줄 × 2개 (돌 1.2 × 0.6m)
// 대리석: 판 한 변(m), 결 그림 한 장이 덮는 크기(m), 줄눈 폭(m), 결 수, 판마다 밝기 차이, 거칠기(낮을수록 광택)
const MARBLE = { slab: 1.2, tile: 3.6, joint: 0.008, veins: 90, slabTone: 0.05, roughness: 0.3 }
const PX = 512

function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}
function tex(c: HTMLCanvasElement, color: boolean, anisotropy = 4) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = anisotropy
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}
const rgb = (c: number[], k: number) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`
// 잔 얼룩 (돌·회벽의 푸석한 결)
function speckle(ctx: CanvasRenderingContext2D, r: () => number, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(60,50,35,${alpha})`
    const s = r() < 0.9 ? 1 : 2
    ctx.fillRect(r() * w, r() * h, s, s)
  }
}

export type TexturePair = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }

let ashlarPair: TexturePair | null = null
export function ashlar(): TexturePair {
  if (ashlarPair) return ashlarPair
  const [mc, m] = canvas(PX, PX)
  const [bc, b] = canvas(PX, PX)
  const r = random(41)
  const rowH = PX / ASHLAR.rows
  const colW = PX / ASHLAR.cols
  m.fillStyle = rgb(ASHLAR.color, 0.62) // 줄눈
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#000'
  b.fillRect(0, 0, PX, PX)
  for (let row = 0; row < ASHLAR.rows; row++) {
    const shift = row % 2 ? colW / 2 : 0
    for (let col = -1; col < ASHLAR.cols; col++) {
      const k = 0.9 + r() * 0.1 // 블록마다 밝기
      const hgt = 190 + Math.floor(r() * 45)
      const x = col * colW + shift + ASHLAR.joint / 2
      const y = row * rowH + ASHLAR.joint / 2
      for (const dx of [0, PX]) {
        m.fillStyle = rgb(ASHLAR.color, k)
        m.fillRect(x + dx, y, colW - ASHLAR.joint, rowH - ASHLAR.joint)
        b.fillStyle = `rgb(${hgt},${hgt},${hgt})`
        b.fillRect(x + dx, y, colW - ASHLAR.joint, rowH - ASHLAR.joint)
      }
    }
  }
  speckle(m, r, PX, PX, 5000, 0.07)
  speckle(b, r, PX, PX, 2500, 0.1)
  ashlarPair = { map: tex(mc, true), bump: tex(bc, false) }
  return ashlarPair
}

let limestoneMap: THREE.CanvasTexture | null = null
export function limestone() {
  if (limestoneMap) return limestoneMap
  const [mc, m] = canvas(256, 256)
  const r = random(43)
  m.fillStyle = rgb(ASHLAR.color, 1)
  m.fillRect(0, 0, 256, 256)
  speckle(m, r, 256, 256, 2200, 0.06)
  limestoneMap = tex(mc, true)
  return limestoneMap
}

let marbleMap: THREE.CanvasTexture | null = null
// 대리석 결 한 장 (줄눈 없음, 이어짐): 흰 바탕에 옅은 구름 무늬 + 가늘게 굽은 회색 결. 줄눈과 판마다 다른 결은 marbleFloorMat 의 셰이더가 만듦
function marbleVeins() {
  if (marbleMap) return marbleMap
  const [mc, m] = canvas(PX, PX)
  const r = random(71)
  m.fillStyle = '#ffffff'
  m.fillRect(0, 0, PX, PX)
  for (let i = 0; i < 46; i++) {
    const x = r() * PX
    const y = r() * PX
    const rad = 40 + r() * 110
    const warm = r() < 0.6
    const color = warm ? '205,190,165' : '185,185,180'
    const alpha = 0.03 + r() * 0.05
    for (const dx of [-PX, 0, PX]) for (const dy of [-PX, 0, PX]) {
      const g = m.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad)
      g.addColorStop(0, `rgba(${color},${alpha})`)
      g.addColorStop(1, `rgba(${color},0)`)
      m.fillStyle = g
      m.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2)
    }
  }
  m.lineCap = 'round'
  for (let i = 0; i < MARBLE.veins; i++) {
    const main = i < MARBLE.veins * 0.25 // 굵은 결 조금, 잔 결 많이
    const pts: [number, number][] = []
    let x = r() * PX
    let y = r() * PX
    let a = r() * Math.PI * 2
    const steps = 6 + Math.floor(r() * (main ? 26 : 12))
    pts.push([x, y])
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.9
      x += Math.cos(a) * (8 + r() * 18)
      y += Math.sin(a) * (8 + r() * 18)
      pts.push([x, y])
    }
    m.strokeStyle = `rgba(150,148,145,${main ? 0.16 + r() * 0.14 : 0.05 + r() * 0.08})`
    m.lineWidth = main ? 0.9 + r() * 1.3 : 0.5 + r() * 0.5
    for (const dx of [-PX, 0, PX]) for (const dy of [-PX, 0, PX]) {
      m.beginPath()
      pts.forEach(([px, py], k) => (k ? m.lineTo(px + dx, py + dy) : m.moveTo(px + dx, py + dy)))
      m.stroke()
    }
  }
  marbleMap = tex(mc, true, 8)
  return marbleMap
}

// 대리석 바닥 재질. 바닥 판 UV 는 미터 (tiledPlane(w, d, 1)).
// 판(MARBLE.slab)마다 결 그림의 다른 자리를 읽고 절반은 90도 돌려서, 넓은 바닥에서도 같은 무늬가 반복되어 보이지 않습니다. 줄눈도 셰이더에서 그려 그림 한 장으로 끝납니다.
// 반사는 없고 거칠기만 낮춰 은은한 광택 (비스듬한 빛의 하이라이트).
const marbleMats = new Map<string, THREE.MeshStandardMaterial>()
export function marbleFloorMat(color: string, joint: string) {
  const key = `${color}|${joint}`
  let mat = marbleMats.get(key)
  if (mat) return mat
  mat = new THREE.MeshStandardMaterial({ color, map: marbleVeins(), roughness: MARBLE.roughness, metalness: 0 })
  const jointColor = new THREE.Color(joint)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uJoint = { value: jointColor }
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uJoint;').replace(
      '#include <map_fragment>',
      `vec2 slabP = vMapUv / ${MARBLE.slab.toFixed(2)};
      vec2 slabId = floor(slabP);
      float slabH = fract(sin(dot(slabId, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 veinUv = vMapUv + vec2(slabH * 37.0, fract(slabH * 91.0) * 53.0);
      if (fract(slabH * 17.0) > 0.5) veinUv = veinUv.yx;
      diffuseColor.rgb *= texture2D(map, veinUv / ${MARBLE.tile.toFixed(2)}).rgb * (${(1 - MARBLE.slabTone).toFixed(3)} + ${MARBLE.slabTone.toFixed(3)} * slabH);
      vec2 slabF = abs(fract(slabP) - 0.5);
      vec2 slabW = fwidth(slabP);
      float jointT = ${(MARBLE.joint / MARBLE.slab / 2).toFixed(4)};
      vec2 jointA = smoothstep(vec2(0.5 - jointT) - slabW, vec2(0.5 - jointT) + slabW, slabF);
      diffuseColor.rgb = mix(diffuseColor.rgb, uJoint, max(jointA.x, jointA.y) * clamp(0.04 / max(slabW.x + slabW.y, 0.04), 0.0, 1.0));`,
    )
  }
  marbleMats.set(key, mat)
  return mat
}

let grainMap: THREE.CanvasTexture | null = null
export function oakGrain() {
  if (grainMap) return grainMap
  const [mc, m] = canvas(PX, 256)
  const r = random(53)
  m.fillStyle = '#f4ece0' // 거의 흰색: 재질 색(책상·서가 색)이 곱해짐
  m.fillRect(0, 0, PX, 256)
  for (let i = 0; i < 90; i++) {
    const gy = r() * 256
    const amp = 1 + r() * 4
    const phase = r() * 6
    m.strokeStyle = r() < 0.7 ? `rgba(120,85,50,${0.05 + r() * 0.13})` : `rgba(255,255,255,${0.05 + r() * 0.1})`
    m.lineWidth = 0.6 + r() * 2
    for (const dy of [-256, 0, 256]) {
      m.beginPath()
      for (let x = 0; x <= PX; x += 16) {
        const yy = gy + dy + Math.sin((x / PX) * Math.PI * 2 + phase) * amp
        if (x === 0) m.moveTo(x, yy)
        else m.lineTo(x, yy)
      }
      m.stroke()
    }
  }
  grainMap = tex(mc, true, 8)
  return grainMap
}

// 곱게 바른 회벽 (거의 흰색, 재질 색이 입혀짐). 얼룩 없이 잔 결만
let plasterMap: THREE.CanvasTexture | null = null
export function plasterFine() {
  if (plasterMap) return plasterMap
  const [mc, m] = canvas(256, 256)
  const r = random(73)
  m.fillStyle = '#ffffff'
  m.fillRect(0, 0, 256, 256)
  speckle(m, r, 256, 256, 2600, 0.035)
  plasterMap = tex(mc, true)
  return plasterMap
}

let plasterBumpMap: THREE.CanvasTexture | null = null
export function plasterBump() {
  if (plasterBumpMap) return plasterBumpMap
  const [mc, m] = canvas(256, 256)
  const r = random(61)
  m.fillStyle = '#808080'
  m.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 260; i++) {
    const x = r() * 256
    const y = r() * 256
    const rad = 6 + r() * 22
    const g = m.createRadialGradient(x, y, 0, x, y, rad)
    const c = r() < 0.5 ? '255,255,255' : '0,0,0'
    g.addColorStop(0, `rgba(${c},0.12)`)
    g.addColorStop(1, `rgba(${c},0)`)
    m.fillStyle = g
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) m.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2)
  }
  plasterBumpMap = tex(mc, false)
  return plasterBumpMap
}

let glow: THREE.CanvasTexture | null = null
export function glowSprite() {
  if (glow) return glow
  const [c, m] = canvas(128, 128)
  const g = m.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  m.fillStyle = g
  m.fillRect(0, 0, 128, 128)
  glow = new THREE.CanvasTexture(c)
  glow.colorSpace = THREE.SRGBColorSpace
  return glow
}

// 원판 가운데는 건물에 가려지므로, 건물 둘레 peak 에서 가장 밝고 바깥으로 줄어드는 고리
const aprons = new Map<number, THREE.CanvasTexture>()
export function apronGlow(peak: number) {
  const made = aprons.get(peak)
  if (made) return made
  const [c, m] = canvas(256, 256)
  const g = m.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(Math.max(0, peak - 0.05), 'rgba(255,255,255,0)')
  g.addColorStop(peak, 'rgba(255,255,255,1)')
  g.addColorStop(Math.min(1, peak + (1 - peak) * 0.4), 'rgba(255,255,255,0.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  m.fillStyle = g
  m.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  aprons.set(peak, t)
  return t
}

// 창에 보이는 실내 그림 (가까이 가면 실제 실내로 바뀜): 흰 격자 천장, 불 켜진 서가, 대리석 바닥
let picture: THREE.CanvasTexture | null = null
export function libraryPicture() {
  if (picture) return picture
  const W = 256
  const H = 256
  const [c, m] = canvas(W, H)
  const r = random(67)
  m.fillStyle = '#efe6d3'
  m.fillRect(0, 0, W, H)
  // 위층·아래층 서가 (창이 높아 두 줄)
  for (const [top, h] of [[H * 0.14, H * 0.3], [H * 0.52, H * 0.34]] as const) {
    m.fillStyle = '#b89a72'
    m.fillRect(0, top, W, h)
    const rows = 4
    for (let j = 0; j < rows; j++) {
      const y = top + 3 + (j * (h - 6)) / rows
      const rowH = (h - 6) / rows - 3
      let x = 2
      while (x < W) {
        const bw = 3 + r() * 5
        m.fillStyle = ['#8c3b32', '#35506b', '#3f5a24', '#e8d27a', '#c9b48f', '#2f3a3f', '#a35a2c', '#e8e1d3'][Math.floor(r() * 8)]
        m.fillRect(x, y + r() * 3, bw, rowH)
        x += bw + 0.6
      }
    }
    // 서가 칸막이
    m.fillStyle = '#c8ab84'
    for (let x = 0; x < W; x += W / 5) m.fillRect(x, top, 5, h)
  }
  // 천장 격자와 전구
  m.fillStyle = '#fbf8f1'
  m.fillRect(0, 0, W, H * 0.12)
  m.strokeStyle = '#d9d2c4'
  m.lineWidth = 2
  for (let x = 0; x < W; x += W / 6) m.strokeRect(x + 3, 3, W / 6 - 6, H * 0.12 - 6)
  // 대리석 바닥
  m.fillStyle = '#e9e2d3'
  m.fillRect(0, H * 0.88, W, H * 0.12)
  // 따뜻한 불빛 번짐
  for (let i = 0; i < 5; i++) {
    const x = ((i + 0.5) * W) / 5
    const g = m.createRadialGradient(x, H * 0.1, 0, x, H * 0.1, H * 0.5)
    g.addColorStop(0, 'rgba(255,226,170,0.5)')
    g.addColorStop(1, 'rgba(255,226,170,0)')
    m.fillStyle = g
    m.fillRect(0, 0, W, H)
  }
  picture = new THREE.CanvasTexture(c)
  picture.colorSpace = THREE.SRGBColorSpace
  return picture
}

// 나뭇결 재질의 UV 를 인스턴스 크기(미터)로 다시 계산: 상자 하나(1×1×1)를 늘여 쓰는 InstancedMesh 에서 결이 늘어나지 않게.
// 옆면은 결이 세로(y)로, 윗면은 길이 방향으로 흐릅니다.
export function meterUvInstanced(m: THREE.MeshStandardMaterial, tile: number) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #if defined(USE_INSTANCING) && defined(USE_MAP)
        vec3 mScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 mPos = position * mScale;
        vec3 mNor = abs(normal);
        vec2 mUv = mNor.x > 0.5 ? mPos.yz : (mNor.y > 0.5 ? mPos.zx : mPos.yx);
        vMapUv = mUv / ${tile.toFixed(2)};
      #endif`,
    )
  }
  return m
}
