// 캠리단길 바닥 무늬 (돌·벽돌·자갈). 캔버스에 그린 반복 그림을 재질에 붙입니다. (외부 그림 파일 없음)
//
// 그림마다 두 장을 만듭니다.
//   색(map)     돌 하나하나의 밝기 차이 + 줄눈(돌 사이 틈). 색조는 재질 색(color)이 입힘
//               → 눈이 오면 재질 색이 하얘지면서 바닥도 같이 하얘짐(setSnowCover 그대로)
//   요철(bump)  돌은 가운데가 볼록, 줄눈은 오목. 빛을 받으면 울퉁불퉁해 보임 (실제 모양은 평평한 판)
// 무늬는 정해진 난수(seed)로 그려 매번 같은 모양이 나옵니다. 그림의 왼쪽·오른쪽, 위·아래 끝이 이어지게 그려 반복해도 이음매가 없습니다.
// 반복 크기(한 장이 덮는 m)는 TILE, 판 크기에 맞춘 반복은 tiledPlane 이 UV 로 맞춥니다.
import * as THREE from 'three'

const PX = 512 // 그림 한 변
export const TILE = { cobble: 8, brick: 4, gravel: 1.2, grass: 3, concrete: 3 } // 그림 한 장이 덮는 땅 크기(m)

// 정해진 난수
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas() {
  const c = document.createElement('canvas')
  c.width = PX
  c.height = PX
  return [c, c.getContext('2d')!] as const
}

function texture(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4 // 비스듬히 볼 때 덜 뭉개지게
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 그림 끝을 넘는 도형은 반대쪽에도 그려 이어지게 합니다.
function wrapped(draw: (dx: number, dy: number) => void) {
  for (const dx of [-PX, 0, PX]) for (const dy of [-PX, 0, PX]) draw(dx, dy)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

type Pair = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }

// 둥글둥글한 돌 포장 (광장). 줄마다 반 칸씩 어긋나고, 돌 크기·모서리가 조금씩 다름
function makeCobble(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(11)
  m.fillStyle = '#5e564c' // 줄눈
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#000'
  b.fillRect(0, 0, PX, PX)
  const ROWS = 16
  const cell = PX / ROWS
  for (let row = 0; row < ROWS; row++) {
    const shift = row % 2 ? cell / 2 : 0
    for (let col = 0; col < ROWS; col++) {
      const w = cell * (0.78 + r() * 0.16)
      const h = cell * (0.76 + r() * 0.16)
      const x = col * cell + shift + (cell - w) / 2 + (r() - 0.5) * 3
      const y = row * cell + (cell - h) / 2 + (r() - 0.5) * 3
      const rad = Math.min(w, h) * (0.25 + r() * 0.2)
      const light = 205 + Math.floor(r() * 50) // 돌마다 밝기
      const warm = Math.floor((r() - 0.5) * 18) // 따뜻한·차가운 돌 조금씩
      wrapped((dx, dy) => {
        roundRect(m, x + dx, y + dy, w, h, rad)
        m.fillStyle = `rgb(${light + warm},${light},${light - warm})`
        m.fill()
        const g = b.createRadialGradient(x + dx + w * 0.45, y + dy + h * 0.4, 1, x + dx + w / 2, y + dy + h / 2, Math.max(w, h) * 0.6)
        g.addColorStop(0, '#fff')
        g.addColorStop(1, '#7a7a7a')
        roundRect(b, x + dx, y + dy, w, h, rad)
        b.fillStyle = g
        b.fill()
      })
    }
  }
  speckle(m, r, 0.07)
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 벽돌 길 (반 장씩 어긋나게 쌓기). 벽돌 긴 쪽이 그림의 가로
function makeBrick(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(23)
  m.fillStyle = '#6e6259'
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#000'
  b.fillRect(0, 0, PX, PX)
  const ROWS = 16
  const COLS = 8
  const bh = PX / ROWS
  const bw = PX / COLS
  const GAP = 4
  for (let row = 0; row < ROWS; row++) {
    const shift = row % 2 ? bw / 2 : 0
    for (let col = 0; col < COLS; col++) {
      const x = col * bw + shift + GAP / 2
      const y = row * bh + GAP / 2
      const light = 200 + Math.floor(r() * 55)
      const red = Math.floor(r() * 22) // 붉은 기 차이
      const height = 200 + Math.floor(r() * 55) // 벽돌마다 조금씩 다른 높이 (울퉁불퉁)
      wrapped((dx, dy) => {
        roundRect(m, x + dx, y + dy, bw - GAP, bh - GAP, 3)
        m.fillStyle = `rgb(${Math.min(255, light + red)},${light - red / 2},${light - red})`
        m.fill()
        roundRect(b, x + dx, y + dy, bw - GAP, bh - GAP, 3)
        b.fillStyle = `rgb(${height},${height},${height})`
        b.fill()
      })
    }
  }
  speckle(m, r, 0.06)
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 자갈 (작은 조약돌이 빽빽하게)
function makeGravel(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(37)
  m.fillStyle = '#8a8378'
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#222'
  b.fillRect(0, 0, PX, PX)
  for (let i = 0; i < 2600; i++) {
    const x = r() * PX
    const y = r() * PX
    const rx = 3 + r() * 6
    const ry = rx * (0.6 + r() * 0.4)
    const rot = r() * Math.PI
    const light = 150 + Math.floor(r() * 100)
    wrapped((dx, dy) => {
      m.beginPath()
      m.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2)
      m.fillStyle = `rgb(${light},${light - 4},${light - 10})`
      m.fill()
      b.beginPath()
      b.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2)
      b.fillStyle = `rgb(${light},${light},${light})`
      b.fill()
    })
  }
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 잔디 (짧은 풀잎 획 수천 개 + 군데군데 흙·마른 풀). 색조는 재질 색(초록)이 입히고, 그림은 밝기·누런 기·푸른 기만
function makeGrass(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(61)
  m.fillStyle = '#b9c2a8'
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#555'
  b.fillRect(0, 0, PX, PX)
  // 흙이 드러난 얼룩, 진한 풀 얼룩
  for (let i = 0; i < 26; i++) {
    const x = r() * PX
    const y = r() * PX
    const rad = 18 + r() * 50
    const dirt = r() < 0.35
    wrapped((dx, dy) => {
      const g = m.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad)
      g.addColorStop(0, dirt ? 'rgba(190,165,120,0.45)' : 'rgba(120,140,100,0.35)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      m.fillStyle = g
      m.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2)
    })
  }
  // 풀잎 획
  for (let i = 0; i < 9000; i++) {
    const x = r() * PX
    const y = r() * PX
    const len = 4 + r() * 9
    const lean = (r() - 0.5) * 5
    const light = 150 + Math.floor(r() * 105)
    const tone = r()
    const color = tone < 0.15 ? `rgb(${light},${light - 8},${light - 60})` : tone < 0.3 ? `rgb(${light - 25},${light},${light - 20})` : `rgb(${light - 10},${light},${light - 40})`
    wrapped((dx, dy) => {
      m.strokeStyle = color
      m.lineWidth = 1 + r() * 1.2
      m.beginPath()
      m.moveTo(x + dx, y + dy)
      m.lineTo(x + dx + lean, y + dy - len)
      m.stroke()
      b.strokeStyle = `rgb(${light},${light},${light})`
      b.lineWidth = 1.5
      b.beginPath()
      b.moveTo(x + dx, y + dy)
      b.lineTo(x + dx + lean, y + dy - len)
      b.stroke()
    })
  }
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 흙먼지 점 (돌 표면이 매끈해 보이지 않게)
function speckle(ctx: CanvasRenderingContext2D, r: () => number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = r() < 0.5 ? '#000' : '#fff'
    ctx.fillRect(r() * PX, r() * PX, 2, 2)
  }
  ctx.restore()
}

// 콘크리트 (캠퍼스 산책로): 잔 알갱이 + 군데군데 얼룩 + 판 사이 줄눈(한 장에 2×2 판 = TILE.concrete 3m 에 1.5m 판)
// 회벽 (건물 벽): 고운 잡티 + 흙손으로 바른 듯한 옅은 얼룩
function makeStucco(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(97)
  m.fillStyle = '#e4e0d8'
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#808080'
  b.fillRect(0, 0, PX, PX)
  for (let i = 0; i < 60; i++) {
    const x = r() * PX
    const y = r() * PX
    const rx = 20 + r() * 50
    const ry = rx * (0.3 + r() * 0.4)
    const rot = r() * Math.PI
    const l = r() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(120,110,95,0.1)'
    wrapped((dx, dy) => {
      m.fillStyle = l
      m.beginPath()
      m.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2)
      m.fill()
      b.fillStyle = l.includes('255') ? 'rgba(200,200,200,0.3)' : 'rgba(60,60,60,0.3)'
      b.beginPath()
      b.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2)
      b.fill()
    })
  }
  for (let i = 0; i < 20000; i++) {
    const x = r() * PX
    const y = r() * PX
    const l = 175 + Math.floor(r() * 70)
    m.fillStyle = `rgb(${l},${l - 2},${l - 6})`
    m.fillRect(x, y, 1.2, 1.2)
    b.fillStyle = `rgb(${l - 40},${l - 40},${l - 40})`
    b.fillRect(x, y, 1.2, 1.2)
  }
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 세로 나무 판자 (건물 벽·가게): 판자마다 밝기를 달리하고 나뭇결·판자 사이 홈
function makePlanks(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(71)
  const n = 8 // 한 장에 판자 수
  const pw = PX / n
  for (let i = 0; i < n; i++) {
    const l = 175 + Math.floor(r() * 50)
    m.fillStyle = `rgb(${l},${l - 6},${l - 18})`
    m.fillRect(i * pw, 0, pw, PX)
    b.fillStyle = '#9a9a9a'
    b.fillRect(i * pw, 0, pw, PX)
    for (let g = 0; g < 14; g++) {
      const gx = i * pw + 3 + r() * (pw - 6)
      m.strokeStyle = `rgba(90,60,30,${0.12 + r() * 0.15})`
      m.lineWidth = 1 + r()
      m.beginPath()
      m.moveTo(gx, 0)
      for (let y = 0; y <= PX; y += 32) m.lineTo(gx + Math.sin(y * 0.02 + g) * 2.5, y)
      m.stroke()
    }
    if (r() < 0.5) {
      // 옹이
      const kx = i * pw + pw / 2
      const ky = r() * PX
      m.fillStyle = 'rgba(90,55,25,0.35)'
      m.beginPath()
      m.ellipse(kx, ky, 5, 9, 0, 0, Math.PI * 2)
      m.fill()
    }
    m.fillStyle = 'rgba(60,40,20,0.55)'
    m.fillRect(i * pw, 0, 2, PX)
    b.fillStyle = '#2a2a2a'
    b.fillRect(i * pw, 0, 3, PX)
  }
  return { map: texture(mc, true), bump: texture(bc, false) }
}

function makeConcrete(): Pair {
  const [mc, m] = canvas()
  const [bc, b] = canvas()
  const r = random(83)
  m.fillStyle = '#d2cfc8'
  m.fillRect(0, 0, PX, PX)
  b.fillStyle = '#9a9a9a'
  b.fillRect(0, 0, PX, PX)
  for (let i = 0; i < 18; i++) {
    const x = r() * PX
    const y = r() * PX
    const rad = 30 + r() * 70
    const dark = r() < 0.6
    wrapped((dx, dy) => {
      const g = m.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad)
      g.addColorStop(0, dark ? 'rgba(120,115,105,0.18)' : 'rgba(255,255,250,0.2)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      m.fillStyle = g
      m.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2)
    })
  }
  for (let i = 0; i < 14000; i++) {
    const x = r() * PX
    const y = r() * PX
    const l = 150 + Math.floor(r() * 90)
    m.fillStyle = `rgb(${l},${l - 2},${l - 6})`
    m.fillRect(x, y, 1.4, 1.4)
    b.fillStyle = `rgb(${l - 20},${l - 20},${l - 20})`
    b.fillRect(x, y, 1.4, 1.4)
  }
  // 줄눈: 가장자리와 가운데 (반복하면 판이 이어짐)
  for (const k of [0, PX / 2]) {
    m.fillStyle = 'rgba(90,85,78,0.55)'
    m.fillRect(k, 0, 3, PX)
    m.fillRect(0, k, PX, 3)
    b.fillStyle = '#3a3a3a'
    b.fillRect(k, 0, 3, PX)
    b.fillRect(0, k, PX, 3)
  }
  return { map: texture(mc, true), bump: texture(bc, false) }
}

// 처음 쓸 때 한 번만 그립니다.
let made: { cobble: Pair; brick: Pair; gravel: Pair; grass: Pair; concrete: Pair; stucco: Pair; planks: Pair } | null = null
export function groundTextures() {
  made ??= { cobble: makeCobble(), brick: makeBrick(), gravel: makeGravel(), grass: makeGrass(), concrete: makeConcrete(), stucco: makeStucco(), planks: makePlanks() }
  return made
}

// 판(w×d m)에 그림이 tile m 마다 반복되게 UV 를 늘린 평면. 같은 크기는 한 번만 만듭니다.
const planes = new Map<string, THREE.PlaneGeometry>()
export function tiledPlane(w: number, d: number, tile: number) {
  const key = `${w}|${d}|${tile}`
  let g = planes.get(key)
  if (!g) {
    g = new THREE.PlaneGeometry(w, d)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
    planes.set(key, g)
  }
  return g
}

// 흘러내리는 물 무늬 (분수 물줄기). 세로 줄이 반쯤 비치게 그려, 판을 아래로 흘리면(offset) 물이 흐르는 것처럼 보임
let streaks: THREE.CanvasTexture | null = null
export function waterStreaks() {
  if (streaks) return streaks
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')!
  const r = random(51)
  ctx.clearRect(0, 0, 128, 256)
  for (let i = 0; i < 70; i++) {
    const x = r() * 128
    const y = r() * 256
    const len = 40 + r() * 140
    const g = ctx.createLinearGradient(0, y, 0, y + len)
    const a = 0.25 + r() * 0.55
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(235,248,255,${a})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    for (const dy of [-256, 0, 256]) ctx.fillRect(x, y + dy, 1 + r() * 2.5, len)
  }
  streaks = new THREE.CanvasTexture(c)
  streaks.wrapS = streaks.wrapT = THREE.RepeatWrapping
  streaks.colorSpace = THREE.SRGBColorSpace
  return streaks
}
