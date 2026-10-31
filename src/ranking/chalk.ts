// 분필 칠판 그리기 도우미 (순위 게시판 캔버스·순위 창 공용). React 와 무관합니다.
//
//   CHALK         색 (판, 분필 흰색·노랑·분홍·연두, 나무 테두리)
//   CHALK_FONT    케리스 케듀체 (index.css 의 @font-face). 오기 전에는 시스템 글꼴로 보임
//   loadChalkFont 글꼴 두 굵기를 받아 둠 → 끝나면 캔버스를 다시 그리면 케듀체로 바뀜
//   drawBoard     칠판 바탕: 짙은 초록 + 가운데 밝은 얼룩 + 지우개 자국 + 분필 가루
//   chalkText     번진 분필 글씨 (흐린 그림자 몇 겹 + 본 글씨)
//   chalkCircle   점선 분필 동그라미 (얼굴 테두리)
//   doodles       구석 낙서 (물결·별·지그재그)
// 무늬는 매번 같은 모양이 나오도록 정해진 난수(seed)로 그립니다. (다시 그려도 깜빡이지 않게)

export const CHALK = {
  board: '#2b4636',
  boardLight: '#3a5a48',
  boardDark: '#1f362a',
  white: '#f3f0e4',
  yellow: '#ffe9a8',
  gold: '#ffd27a',
  pink: '#f7c6d9',
  green: '#bfe3a8',
  wood: '#8a5a32',
}
export const CHALK_FONT = "'KerisKedyuche', system-ui, sans-serif"

let fontPromise: Promise<void> | null = null
// 글꼴을 한 번만 받습니다. 실패해도(오프라인 등) 시스템 글꼴로 계속 보입니다.
export function loadChalkFont(): Promise<void> {
  fontPromise ??= Promise.all([document.fonts.load(`400 20px ${CHALK_FONT}`), document.fonts.load(`700 20px ${CHALK_FONT}`)])
    .then(() => undefined)
    .catch(() => undefined)
  return fontPromise
}

// 정해진 난수 (같은 seed 면 같은 순서)
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w * 0.35, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75)
  g.addColorStop(0, CHALK.boardLight)
  g.addColorStop(0.5, CHALK.board)
  g.addColorStop(1, CHALK.boardDark)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const r = random(7)
  // 지우개로 문지른 흐린 자국
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.fillStyle = CHALK.white
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(r() * w, r() * h, w * (0.12 + r() * 0.15), h * (0.05 + r() * 0.06), (r() - 0.5) * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // 분필 가루
  ctx.globalAlpha = 0.12
  for (let i = 0; i < (w * h) / 300; i++) ctx.fillRect(r() * w, r() * h, 1, 1)
  ctx.restore()
}

type TextOpts = { size: number; color?: string; bold?: boolean; align?: CanvasTextAlign; maxWidth?: number }

export function chalkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextOpts) {
  ctx.save()
  ctx.font = `${o.bold ? 700 : 400} ${o.size}px ${CHALK_FONT}`
  ctx.textAlign = o.align ?? 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = o.color ?? CHALK.white
  // 번짐: 조금씩 어긋난 흐린 글씨를 먼저 깔고 본 글씨를 올림
  ctx.globalAlpha = 0.15
  ctx.shadowColor = ctx.fillStyle
  ctx.shadowBlur = o.size * 0.08
  for (const [dx, dy] of [[0.8, 0.6], [-0.6, 0.3]]) ctx.fillText(text, x + dx, y + dy, o.maxWidth)
  ctx.globalAlpha = 0.95
  ctx.shadowBlur = o.size * 0.03
  ctx.fillText(text, x, y, o.maxWidth)
  ctx.restore()
}

export function chalkCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string = CHALK.white, width = 4) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash([width * 2.5, width * 1.6])
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// 별 하나 (외곽선만)
export function chalkStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 === 0 ? r : r * 0.45
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
  }
  ctx.closePath()
  ctx.stroke()
}

// 구석 낙서: 왼쪽 위 물결, 오른쪽 별 두 개, 왼쪽 아래 지그재그, 오른쪽 아래 하트 (s: 크기 배율)
export function doodles(ctx: CanvasRenderingContext2D, w: number, h: number, s = 1) {
  ctx.save()
  ctx.lineWidth = 3 * s
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.7
  ctx.strokeStyle = CHALK.white
  ctx.beginPath()
  ctx.moveTo(w * 0.04, h * 0.17)
  ctx.bezierCurveTo(w * 0.07, h * 0.06, w * 0.1, h * 0.2, w * 0.13, h * 0.09)
  ctx.stroke()
  ctx.strokeStyle = CHALK.pink
  chalkStar(ctx, w * 0.93, h * 0.36, 14 * s)
  ctx.strokeStyle = CHALK.yellow
  chalkStar(ctx, w * 0.88, h * 0.12, 9 * s)
  ctx.strokeStyle = CHALK.green
  ctx.beginPath()
  ctx.moveTo(w * 0.04, h * 0.86)
  for (let i = 1; i <= 5; i++) ctx.lineTo(w * (0.04 + i * 0.016), h * (i % 2 ? 0.8 : 0.86))
  ctx.stroke()
  ctx.strokeStyle = CHALK.pink
  const hx = w * 0.94, hy = h * 0.84, hr = 8 * s
  ctx.beginPath()
  ctx.moveTo(hx, hy + hr)
  ctx.bezierCurveTo(hx - hr * 2, hy - hr * 0.2, hx - hr * 0.6, hy - hr * 1.6, hx, hy - hr * 0.4)
  ctx.bezierCurveTo(hx + hr * 0.6, hy - hr * 1.6, hx + hr * 2, hy - hr * 0.2, hx, hy + hr)
  ctx.stroke()
  ctx.restore()
}
