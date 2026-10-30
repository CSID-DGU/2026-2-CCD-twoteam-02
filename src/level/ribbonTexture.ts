// 닉네임 위 칭호 리본 텍스처 (꽃 피는 칭호). 닉네임판(NameTag)처럼 작은 캔버스에 그려 텍스처로 씁니다.
// 단계가 8개뿐이라 단계마다 한 번만 만들어 두고 다시 씁니다(사람이 많아도 텍스처는 8장).
// 모양: 단계 색 띠 + 양 끝 제비꼬리(조금 어두운 색), 가운데 "🌷 꽃봉오리" 굵은 흰 글씨. 꽃밭(8단계)은 금색 그라데이션.
import { CanvasTexture, SRGBColorSpace } from 'three'
import { MAX_LEVEL, titleOf } from './levelLogic'

const FONT = 52 // 캔버스 글자 크기(픽셀). 닉네임(64)보다 조금 작게
const PAD_X = 26 // 띠 안쪽 좌우 여백
const BAND_H = 76 // 띠 높이
const TAIL = 30 // 제비꼬리 폭
const TAIL_DROP = 10 // 제비꼬리가 띠보다 아래로 처지는 정도
const GOLD = ['#c8902c', '#f3d27a', '#c8902c'] // 꽃밭(마지막 단계) 금색 띠

const textures = new Map<number, { texture: CanvasTexture; w: number; h: number }>()

// 색을 amount(0~1)만큼 어둡게 (제비꼬리용)
function darker(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.round(v * (1 - amount))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

// 그 단계의 리본. 칭호가 없거나(0단계) 이상한 값이면 null
export function ribbonTexture(level: number) {
  const title = titleOf(level)
  if (!title) return null
  let made = textures.get(level)
  if (!made) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `700 ${FONT}px system-ui, sans-serif`
    const text = `${title.emoji} ${title.name}`
    ctx.font = font
    const bandW = Math.ceil(ctx.measureText(text).width) + PAD_X * 2
    const width = bandW + TAIL * 2
    const height = BAND_H + TAIL_DROP
    canvas.width = width
    canvas.height = height

    // 제비꼬리: 띠 양 끝 뒤로, 조금 처지고 끝이 V 자로 파임
    ctx.fillStyle = darker(level === MAX_LEVEL ? GOLD[0] : title.color, 0.25)
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? TAIL : width - TAIL // 띠와 닿는 쪽
      const x1 = side < 0 ? 0 : width // 바깥 끝
      ctx.beginPath()
      ctx.moveTo(x0 - side * 6, TAIL_DROP)
      ctx.lineTo(x1, TAIL_DROP)
      ctx.lineTo(x1 - side * TAIL * 0.45, TAIL_DROP + BAND_H / 2)
      ctx.lineTo(x1, height)
      ctx.lineTo(x0 - side * 6, height)
      ctx.closePath()
      ctx.fill()
    }
    // 띠
    if (level === MAX_LEVEL) {
      const g = ctx.createLinearGradient(TAIL, 0, TAIL + bandW, 0)
      GOLD.forEach((c, i) => g.addColorStop(i / (GOLD.length - 1), c))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = title.color
    }
    ctx.beginPath()
    ctx.roundRect(TAIL, 0, bandW, BAND_H, 10)
    ctx.fill()
    // 글자 (밝은 띠에서도 읽히게 얇은 그림자)
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,.35)'
    ctx.shadowBlur = 4
    ctx.fillStyle = '#fff'
    ctx.fillText(text, width / 2, BAND_H / 2 + 2)

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    made = { texture, w: width, h: height }
    textures.set(level, made)
  }
  return made
}
