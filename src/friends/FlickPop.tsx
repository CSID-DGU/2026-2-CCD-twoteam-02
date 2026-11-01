// 딱밤을 맞은 사람 머리 위에 1초 뜨는 "딱!" 말풍선 (#304). 닉네임판 바로 위, 늘 화면을 봄
import { Billboard } from '@react-three/drei'
import { LABEL_PX, labelTexture } from '../space/labelTexture'

const POP = { y: 2.62, width: 0.7 } // 닉네임판(2.2m, NameTag)보다 위, 판 가로(m)

export function FlickPop({ x, z }: { x: number; z: number }) {
  return (
    <Billboard position={[x, POP.y, z]}>
      <mesh renderOrder={10}>
        <planeGeometry args={[POP.width, (POP.width * LABEL_PX.h) / LABEL_PX.w]} />
        <meshBasicMaterial map={labelTexture('딱!', '#f59e0b', '#1b1e24')} transparent depthTest={false} />
      </mesh>
    </Billboard>
  )
}
