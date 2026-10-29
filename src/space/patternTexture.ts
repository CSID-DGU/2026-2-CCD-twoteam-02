// 이미지 파일 없이 캔버스로 그리는 무늬 텍스처 (#57 지점 테마): 체크 바닥, 타일 카운터, 액자 포스터.
// 같은 인자는 한 번만 그려 같이 씁니다 (labelTexture 와 같은 방식). 렌더마다 새로 만들면 메모리가 새기 때문입니다.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export const PATTERN_PX = 512 // 체크·타일 텍스처 한 변 (칸 8개면 한 칸 64px)
export const POSTER_PX = { w: 404, h: 300 } // 액자 안판 0.78:0.58 과 같은 비율
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

// 액자 안의 포스터: 색 배경 가운데 굵은 글자. 둥근 모서리 없이 꽉 채웁니다(labelTexture 는 비율이 달라 쓰지 않음).
export function posterTexture(text: string, bg: string, color = '#fff'): CanvasTexture {
  const key = `poster|${text}|${bg}|${color}`
  let texture = cache.get(key)
  if (!texture) {
    const { canvas, ctx } = makeCanvas(POSTER_PX.w, POSTER_PX.h)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, POSTER_PX.w, POSTER_PX.h)
    ctx.fillStyle = color
    ctx.font = 'bold 64px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, POSTER_PX.w / 2, POSTER_PX.h / 2 + 4, POSTER_PX.w - 40) // 글자가 길면 안으로 줄여 그림
    texture = finish(canvas)
    cache.set(key, texture)
  }
  return texture
}
