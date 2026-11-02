// 캠빛 해변 그림: 파일 없이 캔버스로 한 번만 그립니다. (모래, 나무 판자, 불빛 번짐, 입구 간판)
import * as THREE from 'three'

const PX = 512 // 모래·판자 그림 크기
const SAND = { base: [226, 205, 165], speck: 5200, ripple: 26 } // 바탕색(RGB), 알갱이 수, 바람결 줄 수
const PLANK = { rows: 8, base: '#a9794f', dark: '#6d4a2e', grain: 340 } // 판자 줄 수, 나무색, 결 수
const GLOW_PX = 128
// 입구 간판 앞면: 흰 페인트칠이 살짝 벗겨진 나무 판자 (사진 참고 IMG_4668). 글자는 입체로 따로 뽑음 (BeachScenery)
const SIGN = {
  w: 1024, h: 340, planks: 5,
  bg: '#eef1ec', grain: 'rgba(120,96,70,', seam: 'rgba(92,74,54,.55)', chip: 'rgba(150,118,84,.5)',
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')!] as const
}

function repeatTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

let sand: THREE.CanvasTexture | null = null
export function sandTexture() {
  if (sand) return sand
  const [c, g] = canvas(PX)
  const [r0, g0, b0] = SAND.base
  g.fillStyle = `rgb(${r0},${g0},${b0})`
  g.fillRect(0, 0, PX, PX)
  // 바람에 생긴 잔물결 (이음매가 안 보이게 위아래가 맞는 사인 곡선)
  g.lineWidth = 3
  for (let i = 0; i < SAND.ripple; i++) {
    const y0 = (i / SAND.ripple) * PX
    g.strokeStyle = i % 2 ? 'rgba(255,245,220,.13)' : 'rgba(150,120,80,.1)'
    g.beginPath()
    for (let x = 0; x <= PX; x += 8) {
      const y = y0 + Math.sin((x / PX) * Math.PI * 4 + i) * 5
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  // 모래 알갱이
  for (let i = 0; i < SAND.speck; i++) {
    const v = Math.random()
    g.fillStyle = v < 0.5 ? 'rgba(255,250,235,.35)' : v < 0.92 ? 'rgba(130,100,65,.28)' : 'rgba(60,45,30,.35)'
    g.fillRect(Math.random() * PX, Math.random() * PX, 1.4, 1.4)
  }
  sand = repeatTexture(c)
  return sand
}

let plank: THREE.CanvasTexture | null = null
export function plankTexture() {
  if (plank) return plank
  const [c, g] = canvas(PX)
  g.fillStyle = PLANK.base
  g.fillRect(0, 0, PX, PX)
  const row = PX / PLANK.rows
  for (let i = 0; i < PLANK.rows; i++) {
    g.fillStyle = `rgba(${i % 3 === 0 ? '255,220,170' : '70,40,20'},${0.04 + (i % 4) * 0.025})`
    g.fillRect(0, i * row, PX, row)
  }
  for (let i = 0; i < PLANK.grain; i++) {
    g.strokeStyle = `rgba(60,35,18,${0.05 + Math.random() * 0.12})`
    g.lineWidth = 1
    const y = Math.random() * PX
    const x = Math.random() * PX
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 40 + Math.random() * 120, y + (Math.random() - 0.5) * 3)
    g.stroke()
  }
  g.fillStyle = PLANK.dark
  for (let i = 0; i < PLANK.rows; i++) g.fillRect(0, i * row, PX, 3)
  plank = repeatTexture(c)
  return plank
}

let glow: THREE.CanvasTexture | null = null
export function glowTexture() {
  if (glow) return glow
  const [c, g] = canvas(GLOW_PX)
  const r = GLOW_PX / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,.4)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, GLOW_PX, GLOW_PX)
  glow = new THREE.CanvasTexture(c)
  glow.colorSpace = THREE.SRGBColorSpace
  return glow
}

// 입구 간판 앞면 그림
let sign: THREE.CanvasTexture | null = null
export function signTexture() {
  if (sign) return sign
  const c = document.createElement('canvas')
  c.width = SIGN.w
  c.height = SIGN.h
  const g = c.getContext('2d')!
  g.fillStyle = SIGN.bg
  g.fillRect(0, 0, SIGN.w, SIGN.h)
  // 나뭇결: 판자 방향으로 흐르는 가는 줄 (값을 고정해 늘 같은 모습)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 420; i++) {
    g.strokeStyle = `${SIGN.grain}${0.04 + rnd() * 0.12})`
    g.lineWidth = 0.6 + rnd() * 1.2
    const y = rnd() * SIGN.h
    const x = rnd() * SIGN.w
    const len = 80 + rnd() * 320
    g.beginPath()
    g.moveTo(x, y)
    g.bezierCurveTo(x + len / 3, y + rnd() * 4 - 2, x + (len * 2) / 3, y + rnd() * 4 - 2, x + len, y + rnd() * 3 - 1.5)
    g.stroke()
  }
  // 판자 이음매와 페인트가 벗겨진 자리
  const row = SIGN.h / SIGN.planks
  for (let i = 1; i < SIGN.planks; i++) {
    g.fillStyle = SIGN.seam
    g.fillRect(0, i * row - 1.5, SIGN.w, 3)
    g.fillStyle = 'rgba(255,255,255,.5)'
    g.fillRect(0, i * row + 1.5, SIGN.w, 1.5)
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = SIGN.chip
    g.fillRect(rnd() * SIGN.w, rnd() * SIGN.h, 3 + rnd() * 22, 1 + rnd() * 2.5)
  }
  sign = new THREE.CanvasTexture(c)
  sign.colorSpace = THREE.SRGBColorSpace
  sign.anisotropy = 4
  return sign
}
