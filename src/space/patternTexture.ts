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
