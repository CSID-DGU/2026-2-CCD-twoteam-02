// 캠리단길 지점 파사드 그림 (캔버스로 그림, 외부 그림 파일 없음). 한 번 그린 그림은 같이 씁니다.
//
//   interiorTexture  창 너머로 보이는 실내 (지점마다 다른 분위기: 책상과 스탠드, 다이너 카운터, 화분, 원반 조명, 술병 선반)
//                    밤에는 이 그림을 빛나게 해(emissiveMap) 실내 불빛이 새어 나오는 것처럼 보입니다
//   awningTexture    줄무늬 차양 (scallop: 아래 끝을 물결 모양으로 오려 냄)
//   signTexture      글자 간판 (배경색·글자색·글꼴 굵기)
import * as THREE from 'three'
import type { FacadeStyle } from './worldLogic'

const cache = new Map<string, THREE.CanvasTexture>()
function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, wrap = false) {
  let t = cache.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (wrap) t.wrapS = THREE.RepeatWrapping
  cache.set(key, t)
  return t
}

const rect = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}
const dot = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
// 따뜻한 불빛 번짐
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = 'rgba(255,214,140,0.55)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(255,214,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

// 지점별 실내
const INTERIOR: Record<FacadeStyle, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  // 별다방: 크림 벽, 책 꽂힌 선반, 긴 책상과 초록 스탠드
  classic(ctx, w, h) {
    rect(ctx, '#e9dcc3', 0, 0, w, h)
    rect(ctx, '#7a5534', 0, h * 0.78, w, h * 0.22)
    for (let s = 0; s < 2; s++) {
      const y = 22 + s * 34
      rect(ctx, '#6b4a2e', 12, y + 22, w - 24, 4)
      for (let x = 16; x < w - 20; x += 7) rect(ctx, ['#a33', '#2f5d8a', '#c9a24a', '#3d7a4a', '#7a3d6b'][(x + s) % 5], x, y + 6 + ((x * 7) % 5), 5, 16 - ((x * 7) % 5))
    }
    rect(ctx, '#5a3a22', 10, h * 0.66, w - 20, 8)
    for (const x of [50, 128, 206]) {
      rect(ctx, '#2c2c2c', x - 1, h * 0.56, 2, 14)
      ctx.fillStyle = '#1f6b45'
      ctx.beginPath()
      ctx.ellipse(x, h * 0.56, 12, 7, 0, Math.PI, 0)
      ctx.fill()
      glow(ctx, x, h * 0.62, 26)
    }
  },
  // 레트로카페: 민트 벽, 빨간 네온 줄, 둥근 시계, 체크 바닥, 빨간 카운터와 스툴
  diner(ctx, w, h) {
    rect(ctx, '#1fb6b3', 0, 0, w, h)
    rect(ctx, '#ff2d2d', 0, 18, w, 4)
    glow(ctx, w / 2, 20, 90, 'rgba(255,60,60,0.25)')
    dot(ctx, '#fff', w * 0.8, 50, 14)
    dot(ctx, '#1a1a1a', w * 0.8, 50, 2)
    for (let x = 0; x < w; x += 16) for (let y = h * 0.8; y < h; y += 16) rect(ctx, ((x + y) / 16) % 2 ? '#f4f4f4' : '#1a1a1a', x, y, 16, 16)
    rect(ctx, '#d9353a', 10, h * 0.55, w - 20, 12)
    rect(ctx, '#f4f4f4', 10, h * 0.62, w - 20, h * 0.18)
    for (let x = 30; x < w - 20; x += 40) {
      rect(ctx, '#c9ccd2', x - 1, h * 0.8, 3, 18)
      dot(ctx, '#d9353a', x, h * 0.8, 9)
    }
    for (const x of [60, 196]) glow(ctx, x, 40, 30)
  },
  // 올리브 테라스: 따뜻한 벽, 가득한 화분과 덩굴, 둥근 전등, 나무 테이블
  garden(ctx, w, h) {
    rect(ctx, '#efe0c8', 0, 0, w, h)
    rect(ctx, '#c9744a', 0, h * 0.82, w, h * 0.18)
    for (let i = 0; i < 26; i++) dot(ctx, ['#5ea84a', '#7cc254', '#4f9a48'][i % 3], (i * 37) % w, 8 + ((i * 13) % 26), 9 + (i % 4) * 2)
    for (const x of [64, 192]) {
      rect(ctx, '#333', x, 0, 1, 40)
      dot(ctx, '#fff4d6', x, 46, 7)
      glow(ctx, x, 46, 30)
    }
    for (const x of [40, 128, 216]) {
      rect(ctx, '#a7774d', x - 22, h * 0.68, 44, 6)
      rect(ctx, '#7a5534', x - 2, h * 0.68, 4, h * 0.14)
    }
    for (const x of [8, 244]) {
      rect(ctx, '#b4643c', x - 8, h * 0.66, 16, 18)
      dot(ctx, '#5ea84a', x, h * 0.6, 14)
    }
  },
  // 흑요 라운지: 어두운 벽, 원반 조명, 부스 의자 윤곽, 구리 선
  modern(ctx, w, h) {
    rect(ctx, '#1c1c1e', 0, 0, w, h)
    rect(ctx, '#2b2b2d', 0, h * 0.75, w, h * 0.25)
    for (const x of [48, 128, 208]) {
      rect(ctx, '#b07a5a', x - 1, 0, 2, 26)
      ctx.fillStyle = '#e8c9a0'
      ctx.fillRect(x - 16, 26, 32, 4)
      glow(ctx, x, 34, 40, 'rgba(255,190,120,0.5)')
    }
    for (const x of [30, 110, 190]) {
      ctx.fillStyle = '#3a2a1e'
      ctx.beginPath()
      ctx.roundRect(x, h * 0.5, 50, h * 0.3, 8)
      ctx.fill()
    }
    rect(ctx, '#b07a5a', 0, h * 0.75, w, 2)
  },
  // 월넛 바: 호두나무 뒷벽, 술병 선반, 금빛 펜던트, 바 카운터
  woodbar(ctx, w, h) {
    rect(ctx, '#4a2e1c', 0, 0, w, h)
    for (let s = 0; s < 3; s++) {
      const y = 14 + s * 26
      rect(ctx, '#c9a24a', 10, y + 18, w - 20, 2)
      for (let x = 14; x < w - 14; x += 9) {
        const bh = 10 + ((x * 3 + s) % 7)
        rect(ctx, ['#2f6b4a', '#7a2a2a', '#c9a24a', '#8fa9b8', '#5a3420'][(x + s * 2) % 5], x, y + 18 - bh, 6, bh)
      }
    }
    for (const x of [64, 128, 192]) {
      rect(ctx, '#222', x, 0, 1, h * 0.5)
      dot(ctx, '#ffd98a', x, h * 0.52, 5)
      glow(ctx, x, h * 0.54, 30)
    }
    rect(ctx, '#6b3f24', 0, h * 0.68, w, h * 0.32)
    rect(ctx, '#c9a24a', 0, h * 0.68, w, 3)
  },
}

export function interiorTexture(style: FacadeStyle) {
  return cached(`in|${style}`, 256, 160, (ctx, w, h) => {
    INTERIOR[style](ctx, w, h)
    // 유리 반사 (비스듬한 흰 띠)
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(w * 0.15, 0)
    ctx.lineTo(w * 0.35, 0)
    ctx.lineTo(w * 0.1, h)
    ctx.lineTo(-w * 0.1, h)
    ctx.fill()
    ctx.restore()
  })
}

// 줄무늬 차양. stripes: 줄 수, scallop: 아래 끝 물결 (투명하게 오려 냄)
export function awningTexture(a: string, b: string, stripes: number, scallop: boolean) {
  return cached(`aw|${a}|${b}|${stripes}|${scallop}`, 512, 128, (ctx, w, h) => {
    const sw = w / stripes
    for (let i = 0; i < stripes; i++) rect(ctx, i % 2 ? b : a, i * sw, 0, sw, h)
    if (scallop) {
      ctx.globalCompositeOperation = 'destination-out'
      const r = sw / 2
      for (let i = 0; i < stripes; i++) {
        ctx.beginPath()
        ctx.rect(i * sw, h - r, sw, r)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? b : a
        ctx.beginPath()
        ctx.arc(i * sw + r, h - r, r, 0, Math.PI)
        ctx.fill()
      }
    }
  })
}

// 글자 간판. weight: 글꼴 굵기, spacing: 글자 사이 (영문 간판)
export function signTexture(text: string, bg: string, color: string, spacing = 0) {
  return cached(`sg|${text}|${bg}|${color}|${spacing}`, 512, 128, (ctx, w, h) => {
    if (bg !== 'transparent') rect(ctx, bg, 0, 0, w, h)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 64px "KerisKedyuche", system-ui, sans-serif`
    if (spacing) ctx.letterSpacing = `${spacing}px`
    ctx.fillText(text, w / 2, h / 2 + 4, w - 30)
  })
}
