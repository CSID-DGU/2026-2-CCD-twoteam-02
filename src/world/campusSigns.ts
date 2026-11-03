// 캠퍼스 글자·그림 판 (학교 이름, 교표, 시계판, 현수막, 포스터 등). 그림 파일 없이 캔버스로 그립니다. 그림마다 한 번만 만듭니다.
import * as THREE from 'three'

const FONT = '"Noto Serif KR", "AppleMyungjo", serif'
const SANS = '"Noto Sans KR", system-ui, sans-serif'
export const NAVY = '#1f3a5f'
const GOLD = '#c9a24b'

const cache = new Map<string, THREE.CanvasTexture>()
function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  let t = cache.get(key)
  if (!t) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d')!)
    t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    cache.set(key, t)
  }
  return t
}

// 방패 모양 교표
function shield(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.beginPath()
  c.moveTo(x, y)
  c.lineTo(x + w, y)
  c.lineTo(x + w, y + h * 0.58)
  c.quadraticCurveTo(x + w, y + h * 0.85, x + w / 2, y + h)
  c.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.58)
  c.closePath()
  c.fillStyle = NAVY
  c.fill()
  c.lineWidth = w * 0.05
  c.strokeStyle = GOLD
  c.stroke()
  c.fillStyle = GOLD
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `bold ${h * 0.42}px ${FONT}`
  c.fillText('빛', x + w / 2, y + h * 0.44)
}

export const emblemTexture = () => make('emblem', 128, 148, (c) => shield(c, 8, 6, 112, 136))

export const schoolNameTexture = () =>
  make('name', 1024, 160, (c) => {
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `bold 118px ${FONT}`
    c.letterSpacing = '26px'
    c.fillStyle = 'rgba(40,30,20,0.55)' // 돌에 파인 그늘
    c.fillText('캠빛대학교', 515, 85)
    c.fillStyle = '#6b4f28'
    c.fillText('캠빛대학교', 512, 82)
  })

export const clockFaceTexture = () =>
  make('clock', 256, 256, (c) => {
    c.fillStyle = '#f6f0df'
    c.fillRect(0, 0, 256, 256)
    c.translate(128, 128)
    c.fillStyle = '#2d2a25'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `bold 30px ${FONT}`
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.fillText(String(i), Math.sin(a) * 96, -Math.cos(a) * 96)
    }
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue
      const a = (i / 60) * Math.PI * 2
      c.beginPath()
      c.arc(Math.sin(a) * 118, -Math.cos(a) * 118, 1.8, 0, Math.PI * 2)
      c.fill()
    }
  })

// 벽 세로 현수막: 글자를 위에서 아래로
export const bannerTexture = (text: string, color: string) =>
  make(`banner|${text}|${color}`, 128, 720, (c) => {
    c.fillStyle = color
    c.fillRect(0, 0, 128, 720)
    c.fillStyle = 'rgba(255,255,255,0.85)'
    c.fillRect(8, 8, 112, 4)
    c.fillRect(8, 708, 112, 4)
    shield(c, 42, 24, 44, 54)
    c.fillStyle = '#fff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const chars = [...text.replace(/ /g, '')]
    const step = Math.min(88, 590 / chars.length)
    c.font = `bold ${Math.floor(step * 0.86)}px ${SANS}`
    const start = 92 + (610 - step * chars.length) / 2 + step / 2
    chars.forEach((ch, i) => c.fillText(ch, 64, start + i * step))
  })

export const flagTexture = () =>
  make('flag', 256, 170, (c) => {
    c.fillStyle = NAVY
    c.fillRect(0, 0, 256, 170)
    shield(c, 88, 24, 80, 104)
    c.fillStyle = GOLD
    c.textAlign = 'center'
    c.font = `bold 20px ${FONT}`
    c.fillText('캠빛대학교', 128, 150)
  })

// 천막 간판
export const tentSignTexture = (text: string, color: string) =>
  make(`tent|${text}|${color}`, 512, 96, (c) => {
    c.fillStyle = '#fffdf6'
    c.fillRect(0, 0, 512, 96)
    c.fillStyle = color
    c.fillRect(0, 84, 512, 12)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `bold 50px ${SANS}`
    c.fillText(`${text} 부원 모집`, 256, 44)
  })

// 건물 간판: 짙은 남색 판에 금색 테두리, 교표와 세리프 글자 (대학 건물 현판)
export const hallSignTexture = (text: string, open: boolean) =>
  make(`hall|${text}|${open}`, 640, 150, (c) => {
    c.fillStyle = open ? NAVY : '#4b5563'
    c.fillRect(0, 0, 640, 150)
    c.strokeStyle = GOLD
    c.lineWidth = 5
    c.strokeRect(9, 9, 622, 132)
    c.lineWidth = 1.5
    c.strokeRect(18, 18, 604, 114)
    c.fillStyle = '#f3e3b4'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `bold 62px ${FONT}`
    c.letterSpacing = '8px'
    c.fillText(text.replace(/^캠빛\s*/, ''), 350, 80)
    c.letterSpacing = '0px'
    shield(c, 44, 34, 66, 84)
  })
