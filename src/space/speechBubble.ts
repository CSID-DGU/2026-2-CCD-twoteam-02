// 바리스타 말풍선 텍스처: 글 길이에 맞춰 판 너비를 늘립니다. (labelTexture 는 고정 너비라 긴 글·이모지가 옆으로 눌림)
// 너무 길면 가운데 가까운 띄어쓰기에서 두 줄로 나눕니다. 아래 가운데에 꼬리. 같은 글은 한 번만 그려 같이 씁니다.
import { CanvasTexture, SRGBColorSpace } from 'three'

const PX = { line: 56, padX: 34, padY: 22, tail: 16, maxLine: 460, font: 'bold 42px system-ui, sans-serif' }
export const BUBBLE_PX_PER_M = 340 // 1m 에 그릴 픽셀 수 (판 크기 = 텍스처 크기 / 이것)

const cache = new Map<string, { texture: CanvasTexture; w: number; h: number }>()

// 한 줄이 maxLine 을 넘으면 가운데에 가장 가까운 띄어쓰기에서 나눔
function splitLines(ctx: CanvasRenderingContext2D, text: string) {
  if (ctx.measureText(text).width <= PX.maxLine) return [text]
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index)
  if (spaces.length === 0) return [text]
  const mid = text.length / 2
  const cut = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
  return [text.slice(0, cut), text.slice(cut + 1)]
}

export function bubbleTexture(text: string) {
  let hit = cache.get(text)
  if (!hit) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = PX.font
    const lines = splitLines(ctx, text)
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + PX.padX * 2
    const boxH = lines.length * PX.line + PX.padY * 2
    canvas.width = w
    canvas.height = boxH + PX.tail
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(4, 4, w - 8, boxH - 8, 28)
    ctx.fill()
    ctx.beginPath() // 꼬리
    ctx.moveTo(w / 2 - PX.tail, boxH - 6)
    ctx.lineTo(w / 2, boxH + PX.tail - 2)
    ctx.lineTo(w / 2 + PX.tail, boxH - 6)
    ctx.fill()
    ctx.fillStyle = '#2b2b2b'
    ctx.font = PX.font // 캔버스 크기를 바꾸면 글꼴이 초기화됨
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => ctx.fillText(l, w / 2, PX.padY + PX.line * (i + 0.5) + 2))
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    hit = { texture, w: canvas.width, h: canvas.height }
    cache.set(text, hit)
  }
  return hit
}
