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
export const TILE = { cobble: 4, brick: 2, gravel: 1.2 } // 그림 한 장이 덮는 땅 크기(m)

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

// 처음 쓸 때 한 번만 그립니다.
let made: { cobble: Pair; brick: Pair; gravel: Pair } | null = null
export function groundTextures() {
  made ??= { cobble: makeCobble(), brick: makeBrick(), gravel: makeGravel() }
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
