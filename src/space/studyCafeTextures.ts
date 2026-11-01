// Cam Study Cafe(별다방 자리) 실내 질감: 부드러운 원목 결, 골유리, 패브릭, 메시 의자, 큰 돌 타일, 회벽, 창밖 풍경, 책등.
// 이미지 파일 없이 캔버스로 그립니다. 같은 인자는 한 번만 그려 같이 씁니다 (patternTexture 와 같은 방식).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const cache = new Map<string, CanvasTexture>()

// 무늬가 매번 같게 나오도록 고정 씨앗 난수
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: { x: number; y: number }) {
  const full = repeat ? `${key}|${repeat.x}|${repeat.y}` : key
  let tex = cache.get(full)
  if (!tex) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d')!, w, h)
    tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    if (repeat) {
      tex.wrapS = RepeatWrapping
      tex.wrapT = RepeatWrapping
      tex.repeat.set(repeat.x, repeat.y)
    }
    cache.set(full, tex)
  }
  return tex
}

// 원목: 세로로 흐르는 부드러운 나뭇결. 결 줄을 옅게 여러 겹 겹쳐 매끈하게 (텍스처 한 장 = 판 하나)
export function woodTexture(base: string, repeat?: { x: number; y: number }) {
  return cached(`wood|${base}`, 256, 512, (ctx, w, h) => {
    const rnd = seeded(11)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    // 판 전체에 아주 옅은 밝기 얼룩
    for (let i = 0; i < 6; i++) {
      const g = ctx.createLinearGradient(rnd() * w, 0, rnd() * w, h)
      g.addColorStop(0, 'rgba(255,240,215,0)')
      g.addColorStop(0.5, `rgba(255,240,215,${0.06 + rnd() * 0.06})`)
      g.addColorStop(1, 'rgba(255,240,215,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
    // 결: 천천히 굽이치는 세로 줄
    for (let i = 0; i < 70; i++) {
      const x0 = rnd() * w
      const amp = 2 + rnd() * 6
      const freq = 0.006 + rnd() * 0.01
      const phase = rnd() * 10
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(90,55,25,${0.05 + rnd() * 0.08})` : `rgba(255,235,200,${0.05 + rnd() * 0.07})`
      ctx.lineWidth = 0.6 + rnd() * 1.6
      ctx.beginPath()
      for (let y = 0; y <= h; y += 8) {
        const x = x0 + Math.sin(y * freq + phase) * amp
        if (y === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }, repeat)
}

// 골유리(세로 홈이 난 반투명 유리): 밝고 어두운 세로 줄이 번갈아
export function flutedTexture() {
  return cached('fluted', 256, 64, (ctx, w, h) => {
    const ribs = 32
    const rw = w / ribs
    for (let i = 0; i < ribs; i++) {
      const g = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0)
      g.addColorStop(0, '#cfc8bb')
      g.addColorStop(0.45, '#f6f1e7')
      g.addColorStop(1, '#bdb5a7')
      ctx.fillStyle = g
      ctx.fillRect(i * rw, 0, rw, h)
    }
  })
}

// 패브릭(부드러운 천): 바탕색 위에 촘촘한 실 점과 옅은 짜임
export function fabricTexture(base: string) {
  return cached(`fabric|${base}`, 128, 128, (ctx, w, h) => {
    const rnd = seeded(5)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
      ctx.fillRect(0, y, w, 1)
    }
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
      ctx.fillRect(rnd() * w, rnd() * h, 1, 1)
    }
  }, { x: 2, y: 2 })
}

// 메시 의자 등받이: 어두운 바탕에 촘촘한 그물눈
export function meshTexture() {
  return cached('mesh', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1c1c1e'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(120,120,125,0.55)'
    ctx.lineWidth = 1
    for (let i = 0; i <= w; i += 4) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(w, i)
      ctx.stroke()
    }
  }, { x: 4, y: 4 })
}

// 큰 돌 타일 바닥: 텍스처 한 장에 2×2 장, 장마다 밝기를 조금 다르게 + 고운 얼룩 + 옅은 줄눈
export function stoneTileTexture(colors: [string, string], repeat: { x: number; y: number }) {
  return cached(`stone|${colors[0]}|${colors[1]}`, 512, 512, (ctx, w, h) => {
    const rnd = seeded(23)
    const n = 2
    const s = w / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = colors[0]
        ctx.fillRect(i * s, j * s, s, s)
        ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`
        ctx.fillRect(i * s, j * s, s, s)
      }
    for (let k = 0; k < 9000; k++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : colors[1] + '22'
      const r = rnd() * 2.2
      ctx.beginPath()
      ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(70,60,50,0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i <= n; i++) {
      ctx.beginPath()
      ctx.moveTo(i * s, 0)
      ctx.lineTo(i * s, h)
      ctx.moveTo(0, i * s)
      ctx.lineTo(w, i * s)
      ctx.stroke()
    }
  }, repeat)
}

// 회벽: 바탕색에 아주 옅은 손자국 얼룩 (매끈하지만 밋밋하지 않게)
export function plasterTexture(base: string, repeat: { x: number; y: number }) {
  return cached(`plaster|${base}`, 256, 256, (ctx, w, h) => {
    const rnd = seeded(31)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 160; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const r = 10 + rnd() * 40
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      const c = rnd() < 0.5 ? '255,255,255' : '120,105,90'
      g.addColorStop(0, `rgba(${c},${0.03 + rnd() * 0.03})`)
      g.addColorStop(1, `rgba(${c},0)`)
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }, repeat)
}

// 블라인드: 가로 살이 촘촘히 내려온 어두운 회색 (통창 위쪽)
export function blindTexture() {
  return cached('blind', 64, 128, (ctx, w, h) => {
    for (let y = 0; y < h; y += 8) {
      const g = ctx.createLinearGradient(0, y, 0, y + 8)
      g.addColorStop(0, '#3a3c40')
      g.addColorStop(0.6, '#55585d')
      g.addColorStop(1, '#2a2b2e')
      ctx.fillStyle = g
      ctx.fillRect(0, y, w, 8)
    }
  }, { x: 1, y: 3 })
}

// 책등 한 줄: 차분한 색 책들이 높이가 조금씩 다르게 꽂힘 (책장 칸 안쪽에 붙임)
export function booksTexture(seed: number) {
  return cached(`books|${seed}`, 256, 128, (ctx, w, h) => {
    const rnd = seeded(seed)
    const palette = ['#e8e1d3', '#c9b48f', '#8a6b4a', '#4f5b4a', '#2f3a3f', '#b8a07a', '#d9cdb6', '#6e5a48', '#a3946f']
    let x = 0
    while (x < w) {
      if (rnd() < 0.12) {
        x += 18 + rnd() * 30 // 빈 자리 (소품이 들어갈 틈)
        continue
      }
      const bw = 8 + rnd() * 14
      const bh = h * (0.55 + rnd() * 0.4)
      ctx.fillStyle = palette[Math.floor(rnd() * palette.length)]
      ctx.fillRect(x, h - bh, bw - 1, bh)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(x + 2, h - bh + 8, bw - 5, 2)
      x += bw
    }
  })
}

// 글자 간판: 검은 판에 아이콘 + 글자 세 줄 (Focus · Learn · Grow)
export function mottoTexture(lines: string[]) {
  return cached(`motto|${lines.join('|')}`, 256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#151515'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e9e2d4'
    ctx.fillStyle = '#e9e2d4'
    ctx.lineWidth = 3
    ctx.font = '500 40px "Noto Sans KR", sans-serif'
    ctx.textBaseline = 'middle'
    lines.forEach((t, i) => {
      const y = h * ((i + 1) / (lines.length + 1))
      ctx.beginPath()
      ctx.arc(56, y, 16, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillText(t, 92, y + 2)
    })
  })
}

// 불빛 웅덩이: 가운데가 따뜻하고 가장자리로 사라지는 둥근 빛 (스탠드 아래 책상, 펜던트 아래 바 상판)
export function glowTexture() {
  return cached('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,214,150,0.75)')
    g.addColorStop(0.5, 'rgba(255,200,130,0.25)')
    g.addColorStop(1, 'rgba(255,190,120,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}
