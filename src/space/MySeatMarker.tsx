// 내 자리 표시: 책상 위에 "내 자리" 글자판을 띄웁니다. 항상 카메라를 향해서 2D에서도 잘 보입니다.
import { Billboard } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace } from 'three'

const HEIGHT = 1.4 // 책상 위 높이
const WIDTH = 1.0
const COLOR = '#3b82f6' // 내 자리 의자와 같은 파랑

// 글자는 바뀌지 않으므로 처음 한 번만 그립니다.
let texture: CanvasTexture | null = null
function labelTexture() {
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 96
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = COLOR
    ctx.beginPath()
    ctx.roundRect(4, 4, 248, 88, 24)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 48px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('내 자리', 128, 50)
    texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
  }
  return texture
}

export function MySeatMarker({ x, z }: { x: number; z: number }) {
  return (
    <Billboard position={[x, HEIGHT, z]}>
      <mesh>
        <planeGeometry args={[WIDTH, (WIDTH * 96) / 256]} />
        <meshBasicMaterial map={labelTexture()} transparent />
      </mesh>
    </Billboard>
  )
}

export const MY_SEAT_COLOR = COLOR
