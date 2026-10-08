// 머리 위 표시등: 상태 색 동그라미와, 자리 이탈·졸음일 때 붙는 아이콘
import { Billboard } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { LIGHT_COLOR, STATUS_ICON, lightOf } from './status'
import type { PresenceStatus } from './status'

const HEIGHT = 1.85 // 앉은 캐릭터 머리 위 높이 (머리에 가리지 않도록 조금 띄웁니다)
const RADIUS = 0.16
const BORDER = 0.03 // 바닥·벽과 구분되도록 두르는 테두리 두께
const ICON_SIZE = 0.4

// 이모지를 작은 캔버스에 그려 텍스처로 만듭니다. 폰트 파일 없이 시스템 이모지를 그대로 씁니다.
// 아이콘 종류가 몇 개뿐이라, 종류마다 한 번만 만들어 모든 참여자가 같이 씁니다.
const emojiTextures = new Map<string, CanvasTexture>()
function emojiTexture(emoji: string) {
  let t = emojiTextures.get(emoji)
  if (!t) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.font = '112px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, 64, 70)
    t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    emojiTextures.set(emoji, t)
  }
  return t
}

function Icon({ emoji }: { emoji: string }) {
  const texture = emojiTexture(emoji)
  return (
    <mesh position={[RADIUS + ICON_SIZE / 2 + 0.02, 0, 0.002]}>
      <planeGeometry args={[ICON_SIZE, ICON_SIZE]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  )
}

export function StatusMarker({ x, z, status }: { x: number; z: number; status: PresenceStatus }) {
  const icon = STATUS_ICON[status]
  return (
    // Billboard: 카메라가 어디서 보든 항상 정면을 향하게 돌려 줍니다. (2D 위쪽 시점, 3D 1인칭 모두)
    <Billboard position={[x, HEIGHT, z]}>
      <mesh>
        <circleGeometry args={[RADIUS + BORDER, 32]} />
        <meshBasicMaterial color="#20232a" />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <circleGeometry args={[RADIUS, 32]} />
        <meshBasicMaterial color={LIGHT_COLOR[lightOf(status)]} />
      </mesh>
      {icon && <Icon emoji={icon} />}
    </Billboard>
  )
}
