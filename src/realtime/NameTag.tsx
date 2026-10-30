// 캐릭터 머리 위 닉네임. 칭호(꽃 피는 칭호 단계)가 있으면 닉네임판 왼쪽에 꽃 그림을 넣고 테두리를 단계 색으로 칠합니다.
// (머리 위를 단순하게 두려고 따로 리본을 달지 않습니다. 칭호 이름은 프로필 창에서 보입니다)
//
// 글자를 작은 캔버스에 그려 텍스처로 씁니다. 폰트 파일을 따로 받지 않아도 되고,
// 한글도 시스템 폰트로 그대로 나옵니다. (StatusMarker 가 이모지를 그리는 방식과 같습니다)
// 닉네임·단계 조합이 사람 수만큼뿐이라, 조합마다 한 번만 만들어 두고 다시 씁니다.
import { Billboard } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { MAX_LEVEL, titleOf } from '../level/levelLogic'

const HEIGHT = 2.2 // 표시등(1.85)보다 위에 둡니다.
const FONT = 64 // 캔버스에 그릴 글자 크기(픽셀)
const PAD = 16
const SCALE = 0.004 // 캔버스 픽셀 → 공간 크기
const BORDER = 8 // 칭호 테두리 두께(픽셀)
const ICON_GAP = 16 // 꽃 그림과 닉네임 사이(픽셀)
const GOLD = ['#c8902c', '#f3d27a', '#c8902c'] // 꽃밭(마지막 단계) 금색 테두리

const textures = new Map<string, { texture: CanvasTexture; w: number; h: number }>()

// level: 칭호 단계. 0이거나 이상한 값이면 꽃 그림·테두리 없이 닉네임만
function nameTexture(name: string, level: number) {
  const title = titleOf(level)
  const key = `${title ? level : 0}:${name}`
  let made = textures.get(key)
  if (!made) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `600 ${FONT}px system-ui, sans-serif`
    ctx.font = font
    const nameW = Math.ceil(ctx.measureText(name).width)
    const iconW = title ? Math.ceil(ctx.measureText(title.emoji).width) + ICON_GAP : 0
    const width = iconW + nameW + PAD * 2
    const height = FONT + PAD * 2
    canvas.width = width
    canvas.height = height

    // 크기를 바꾸면 설정이 지워지므로 다시 잡습니다.
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 바닥이 밝아 흰 글자만으로는 안 보이므로 어두운 판을 깔아 줍니다.
    ctx.fillStyle = 'rgba(32,35,42,.78)'
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, height / 2)
    ctx.fill()
    if (title) {
      // 테두리: 캔버스 밖으로 잘리지 않게 두께 절반만큼 안쪽에 그립니다.
      if (level === MAX_LEVEL) {
        const g = ctx.createLinearGradient(0, 0, width, 0)
        GOLD.forEach((c, i) => g.addColorStop(i / (GOLD.length - 1), c))
        ctx.strokeStyle = g
      } else {
        ctx.strokeStyle = title.color
      }
      ctx.lineWidth = BORDER
      ctx.beginPath()
      ctx.roundRect(BORDER / 2, BORDER / 2, width - BORDER, height - BORDER, (height - BORDER) / 2)
      ctx.stroke()
      ctx.fillText(title.emoji, PAD + (iconW - ICON_GAP) / 2, height / 2 + 2)
    }
    ctx.fillStyle = '#fff'
    ctx.fillText(name, PAD + iconW + nameW / 2, height / 2 + 2)

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    made = { texture, w: width, h: height }
    textures.set(key, made)
  }
  return made
}

// level: 칭호 단계(받은 위치 메시지의 lv). 없거나 0·이상한 값이면 닉네임만
export function NameTag({ x, z, name, level }: { x: number; z: number; name: string; level?: number }) {
  const { texture, w, h } = nameTexture(name, level ?? 0)
  return (
    // Billboard: 카메라가 어디서 보든 항상 정면을 향하게 돌려 줍니다.
    <Billboard position={[x, HEIGHT, z]}>
      <mesh>
        <planeGeometry args={[w * SCALE, h * SCALE]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
    </Billboard>
  )
}
