// 글자판 텍스처: 둥근 사각형 배경 위에 글자를 그려 3D 화면에 붙입니다. (폰트 파일 없이 시스템 글꼴)
// 같은 글자·색은 한 번만 그려 같이 씁니다. "내 자리" 표시, 로비 지점 간판 등에서 씁니다.
import { CanvasTexture, SRGBColorSpace } from 'three'

export const LABEL_PX = { w: 256, h: 96 } // 텍스처 크기. 화면에 붙일 판의 가로:세로 비율도 이것과 같게 합니다.

const cache = new Map<string, CanvasTexture>()

export function labelTexture(text: string, background: string, color = '#fff') {
  const key = `${text}|${background}|${color}`
  let texture = cache.get(key)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL_PX.w
    canvas.height = LABEL_PX.h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = background
    ctx.beginPath()
    ctx.roundRect(4, 4, LABEL_PX.w - 8, LABEL_PX.h - 8, 24)
    ctx.fill()
    ctx.fillStyle = color
    ctx.font = 'bold 48px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, LABEL_PX.w / 2, LABEL_PX.h / 2 + 2, LABEL_PX.w - 24) // 글자가 길면 판 안으로 줄여 그림
    texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    cache.set(key, texture)
  }
  return texture
}
