// 내 자리 표시: 책상 위에 "내 자리" 글자판을 띄웁니다. 항상 카메라를 향해서 2D에서도 잘 보입니다.
import { Billboard } from '@react-three/drei'
import { LABEL_PX, labelTexture } from './labelTexture'

const HEIGHT = 1.4 // 책상 위 높이
const WIDTH = 1.0
const COLOR = '#3b82f6' // 내 자리 의자와 같은 파랑

export function MySeatMarker({ x, z }: { x: number; z: number }) {
  return (
    <Billboard position={[x, HEIGHT, z]}>
      <mesh>
        <planeGeometry args={[WIDTH, (WIDTH * LABEL_PX.h) / LABEL_PX.w]} />
        <meshBasicMaterial map={labelTexture('내 자리', COLOR)} transparent />
      </mesh>
    </Billboard>
  )
}

export const MY_SEAT_COLOR = COLOR
