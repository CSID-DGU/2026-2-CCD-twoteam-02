// 이미지 파일 없이 캔버스로 그리는 무늬 텍스처 (#57 지점 테마): 체크 바닥, 타일 카운터, 액자 포스터.
// 같은 인자는 한 번만 그려 같이 씁니다 (labelTexture 와 같은 방식). 렌더마다 새로 만들면 메모리가 새기 때문입니다.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export const PATTERN_PX = 512 // 체크·타일 텍스처 한 변 (칸 8개면 한 칸 64px)
export const POSTER_PX = { w: 404, h: 300 } // 간판 텍스처 크기. 액자 안판 0.78:0.58 과 같은 비율
const GROUT_PX = 2 // 타일 줄눈 두께

const cache = new Map<string, CanvasTexture>()

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return { canvas, ctx: canvas.getContext('2d')! }
}

function finish(canvas: HTMLCanvasElement, repeat?: { x: number; y: number }) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(repeat.x, repeat.y)
  }
  return texture
}

// 벽돌 바닥: 가로로 긴 벽돌(가로:세로 4:1)을 줄마다 반 칸씩 엇갈려 쌓고, 벽돌마다 밝기를 조금씩 다르게 합니다.
// 텍스처 한 장에 가로 4개 × 세로 16줄. repeat 는 면 전체에 몇 번 깔지.
const BRICK = { cols: 4, rows: 16, grout: 3 }
export function brickTexture(colors: [string, string], repeat: { x: number; y: number }): CanvasTexture {
  const key = `brick|${colors[0]}|${colors[1]}|${repeat.x}|${repeat.y}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const bw = PATTERN_PX / BRICK.cols
    const bh = PATTERN_PX / BRICK.rows
    ctx.fillStyle = colors[1] // 줄눈
    ctx.fillRect(0, 0, PATTERN_PX, PATTERN_PX)
    let seed = 7 // 매번 같은 무늬가 나오게 고정된 난수
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (let row = 0; row < BRICK.rows; row++) {
      const offset = row % 2 ? bw / 2 : 0
      for (let col = -1; col < BRICK.cols; col++) {
        const x = col * bw + offset
        ctx.fillStyle = colors[0]
        ctx.globalAlpha = 1
        ctx.fillRect(x + BRICK.grout / 2, row * bh + BRICK.grout / 2, bw - BRICK.grout, bh - BRICK.grout)
        // 벽돌마다 밝기 차이: 흰색 또는 검은색을 아주 옅게 덮음
        ctx.globalAlpha = 0.06 + rand() * 0.1
        ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000'
        ctx.fillRect(x + BRICK.grout / 2, row * bh + BRICK.grout / 2, bw - BRICK.grout, bh - BRICK.grout)
      }
    }
    ctx.globalAlpha = 1
    texture = finish(canvas, repeat)
    cache.set(key, texture)
  }
  return texture
}

// 흑백 체크처럼 두 색이 번갈아 나오는 cells×cells 칸. repeat 는 면 전체에 이 텍스처를 몇 번 깔지.
export function checkerTexture(colors: [string, string], cells: number, repeat: { x: number; y: number }): CanvasTexture {
  const key = `checker|${colors[0]}|${colors[1]}|${cells}|${repeat.x}|${repeat.y}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const cell = PATTERN_PX / cells
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        ctx.fillStyle = colors[(row + col) % 2]
        ctx.fillRect(col * cell, row * cell, cell, cell)
      }
    }
    texture = finish(canvas, repeat)
    cache.set(key, texture)
  }
  return texture
}

// 타일: 줄눈(grout) 위에 칸마다 타일 색을 조금 작게 채웁니다.
export function tileTexture(tile: string, grout: string, cells: number, repeat: { x: number; y: number }): CanvasTexture {
  const key = `tile|${tile}|${grout}|${cells}|${repeat.x}|${repeat.y}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const cell = PATTERN_PX / cells
    ctx.fillStyle = grout
    ctx.fillRect(0, 0, PATTERN_PX, PATTERN_PX)
    ctx.fillStyle = tile
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        ctx.fillRect(col * cell + GROUT_PX, row * cell + GROUT_PX, cell - GROUT_PX * 2, cell - GROUT_PX * 2)
      }
    }
    texture = finish(canvas, repeat)
    cache.set(key, texture)
  }
  return texture
}

// 다이너 간판 (#57). 실제 가게 로고 이미지는 저작권 때문에 쓰지 않고, 그 스타일을 코드로 그립니다.
//   plain  색 바탕 + 글자
//   badge  타원 배지: bg 타원 + 가운데 흑백 체크 띠 + 흰 글자 (COMETS 스타일)
//   ribbon 리본 간판: bg 둥근 사각 + 어두운 테두리 + 기울인 큰 글자 + 작은 글자 (Townhouse 스타일)
//   tin    양철 간판: 베이지 바탕 + bg 색 두꺼운 테두리 + 두 줄 글자 (Mom's 스타일)
export type SignSpec = { text: string; bg: string; style?: 'plain' | 'badge' | 'ribbon' | 'tin'; sub?: string }
const SIGN = { cream: '#f3e9d2', dark: '#2b2b2b', white: '#ffffff', checker: ['#1a1a1a', '#f4f4f4'] as const }

// 메뉴판: 어두운 판에 제목과 [이름 … 값] 줄. 비율은 판 크기(w:h)를 따릅니다.
export const MENU_PX = 128 // 1m 당 픽셀
export function menuTexture(spec: { title: string; items: [string, string][]; bg: string; color: string; w: number; h: number }): CanvasTexture {
  const key = `menu|${spec.title}|${spec.items.map((i) => i.join('=')).join(';')}|${spec.bg}|${spec.color}|${spec.w}|${spec.h}`
  let texture = cache.get(key)
  if (!texture) {
    const W = Math.round(spec.w * MENU_PX)
    const H = Math.round(spec.h * MENU_PX)
    const { canvas, ctx } = makeCanvas(W, H)
    ctx.fillStyle = spec.bg
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = spec.color
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, W - 16, H - 16)
    ctx.fillStyle = spec.color
    ctx.textBaseline = 'middle'
    const titleH = Math.round(H * 0.22)
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.round(titleH * 0.6)}px system-ui, sans-serif`
    ctx.fillText(spec.title, W / 2, titleH / 2 + 8, W - 40)
    // 줄: 왼쪽 이름, 오른쪽 값, 사이는 점선
    const rows = Math.max(spec.items.length, 1)
    const rowH = (H - titleH - 16) / rows
    ctx.font = `${Math.round(Math.min(rowH * 0.55, 40))}px system-ui, sans-serif`
    spec.items.forEach(([name, value], i) => {
      const y = titleH + rowH * (i + 0.5)
      ctx.textAlign = 'left'
      ctx.fillText(name, 40, y, W * 0.6)
      ctx.textAlign = 'right'
      ctx.fillText(value, W - 40, y, W * 0.3)
      const nameW = ctx.measureText(name).width
      ctx.save()
      ctx.setLineDash([3, 6])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(40 + nameW + 12, y + 6)
      ctx.lineTo(W - 40 - ctx.measureText(value).width - 12, y + 6)
      ctx.stroke()
      ctx.restore()
    })
    texture = finish(canvas)
    cache.set(key, texture)
  }
  return texture
}

export function signTexture(spec: SignSpec): CanvasTexture {
  const style = spec.style ?? 'plain'
  const key = `sign|${style}|${spec.text}|${spec.sub ?? ''}|${spec.bg}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(POSTER_PX.w, POSTER_PX.h)
    const W = POSTER_PX.w
    const H = POSTER_PX.h
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (style === 'badge') {
      ctx.fillStyle = SIGN.cream
      ctx.fillRect(0, 0, W, H)
      // 타원 배지와 흰 테두리
      ctx.fillStyle = spec.bg
      ctx.beginPath()
      ctx.ellipse(W / 2, H / 2, W / 2 - 10, H / 2 - 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 6
      ctx.strokeStyle = SIGN.white
      ctx.stroke()
      // 가운데 체크 띠 (타원 안쪽만)
      ctx.save()
      ctx.clip()
      const band = { y: H / 2 - 44, h: 88, cell: 22 }
      for (let col = 0; col * band.cell < W; col++) {
        for (let row = 0; row < band.h / band.cell; row++) {
          ctx.fillStyle = SIGN.checker[(row + col) % 2]
          ctx.fillRect(col * band.cell, band.y + row * band.cell, band.cell, band.cell)
        }
      }
      ctx.restore()
      // 글자: 흰 바탕 상자 위에 bg 색 글자 (체크 위에서 읽히게)
      ctx.font = 'bold 58px system-ui, sans-serif'
      const tw = Math.min(ctx.measureText(spec.text).width + 36, W - 60)
      ctx.fillStyle = SIGN.white
      ctx.fillRect(W / 2 - tw / 2, H / 2 - 36, tw, 72)
      ctx.fillStyle = spec.bg
      ctx.fillText(spec.text, W / 2, H / 2 + 3, W - 80)
      if (spec.sub) {
        ctx.font = 'italic bold 26px system-ui, sans-serif'
        ctx.fillStyle = SIGN.white
        ctx.fillText(spec.sub, W / 2, H / 2 + 86, W - 100)
      }
    } else if (style === 'ribbon') {
      ctx.fillStyle = SIGN.cream
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = spec.bg
      ctx.beginPath()
      ctx.roundRect(14, 30, W - 28, H - 60, 40)
      ctx.fill()
      ctx.lineWidth = 8
      ctx.strokeStyle = SIGN.dark
      ctx.stroke()
      ctx.fillStyle = SIGN.white
      ctx.font = 'italic bold 66px system-ui, sans-serif'
      ctx.fillText(spec.text, W / 2, H / 2 - (spec.sub ? 16 : 0), W - 70)
      if (spec.sub) {
        ctx.font = 'bold 28px system-ui, sans-serif'
        ctx.fillText(spec.sub, W / 2, H / 2 + 52, W - 100)
      }
    } else if (style === 'tin') {
      ctx.fillStyle = SIGN.cream
      ctx.fillRect(0, 0, W, H)
      ctx.lineWidth = 14
      ctx.strokeStyle = spec.bg
      ctx.beginPath()
      ctx.roundRect(12, 12, W - 24, H - 24, 18)
      ctx.stroke()
      ctx.fillStyle = spec.bg
      ctx.font = 'italic bold 60px system-ui, sans-serif'
      ctx.fillText(spec.text, W / 2, H / 2 - (spec.sub ? 28 : 0), W - 70)
      if (spec.sub) {
        ctx.fillStyle = SIGN.dark
        ctx.font = 'bold 34px system-ui, sans-serif'
        ctx.fillText(spec.sub, W / 2, H / 2 + 48, W - 80)
      }
    } else {
      ctx.fillStyle = spec.bg
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = SIGN.white
      ctx.font = 'bold 64px system-ui, sans-serif'
      ctx.fillText(spec.text, W / 2, H / 2 + 4, W - 40) // 글자가 길면 안으로 줄여 그림
    }
    texture = finish(canvas)
    cache.set(key, texture)
  }
  return texture
}

// 매번 같은 무늬가 나오게 하는 고정 난수 (seed 가 같으면 같은 순서)
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

// 콘크리트 바닥: 바탕색 위에 큰 얼룩(옅은 원) 여러 개와 잔 점. repeat 는 면 전체에 몇 번 깔지
export function concreteTexture(colors: [string, string], repeat: { x: number; y: number }): CanvasTexture {
  const key = `concrete|${colors[0]}|${colors[1]}|${repeat.x}|${repeat.y}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const rand = seeded(11)
    ctx.fillStyle = colors[0]
    ctx.fillRect(0, 0, PATTERN_PX, PATTERN_PX)
    for (let i = 0; i < 40; i++) {
      const r = 20 + rand() * 90
      const x = rand() * PATTERN_PX
      const y = rand() * PATTERN_PX
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, colors[1])
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.08 + rand() * 0.12
      ctx.fillStyle = g
      // 이음매가 안 보이게 가장자리에 걸친 얼룩은 반대편에도 그림
      for (const dx of [-PATTERN_PX, 0, PATTERN_PX]) for (const dy of [-PATTERN_PX, 0, PATTERN_PX]) {
        ctx.save()
        ctx.translate(dx, dy)
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 0.25
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000'
      ctx.fillRect(rand() * PATTERN_PX, rand() * PATTERN_PX, 1, 1)
    }
    ctx.globalAlpha = 1
    texture = finish(canvas, repeat)
    cache.set(key, texture)
  }
  return texture
}

// 대리석: 어두운 바탕에 구리색 결(꺾인 선 여러 개, 굵기·밝기 제각각)
export function marbleTexture(colors: [string, string]): CanvasTexture {
  const key = `marble|${colors[0]}|${colors[1]}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const rand = seeded(23)
    ctx.fillStyle = colors[0]
    ctx.fillRect(0, 0, PATTERN_PX, PATTERN_PX)
    ctx.strokeStyle = colors[1]
    ctx.lineCap = 'round'
    for (let i = 0; i < 26; i++) {
      let x = rand() * PATTERN_PX
      let y = rand() * PATTERN_PX
      let angle = rand() * Math.PI * 2
      ctx.globalAlpha = 0.25 + rand() * 0.6
      ctx.lineWidth = 0.6 + rand() * (i < 6 ? 4 : 1.6)
      ctx.beginPath()
      ctx.moveTo(x, y)
      const steps = 8 + Math.floor(rand() * 18)
      for (let k = 0; k < steps; k++) {
        angle += (rand() - 0.5) * 1.2
        x += Math.cos(angle) * (10 + rand() * 22)
        y += Math.sin(angle) * (10 + rand() * 22)
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    texture = finish(canvas)
    cache.set(key, texture)
  }
  return texture
}

// 모자이크 타일: 작은 정사각 타일을 세 색 중 하나로 무작위(고정 순서) 칠하고 줄눈을 둡니다. 벽 둘레 띠용
export function mosaicTexture(colors: [string, string, string], repeat: { x: number; y: number }): CanvasTexture {
  const key = `mosaic|${colors.join('|')}|${repeat.x}|${repeat.y}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(PATTERN_PX, PATTERN_PX)
    const rand = seeded(5)
    const cells = 32
    const cell = PATTERN_PX / cells
    ctx.fillStyle = '#d9d2c4' // 줄눈
    ctx.fillRect(0, 0, PATTERN_PX, PATTERN_PX)
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const r = rand()
        ctx.fillStyle = r < 0.45 ? colors[0] : r < 0.8 ? colors[1] : colors[2]
        ctx.fillRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2)
      }
    }
    texture = finish(canvas, repeat)
    cache.set(key, texture)
  }
  return texture
}
