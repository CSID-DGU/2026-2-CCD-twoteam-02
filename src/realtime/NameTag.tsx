// 캐릭터 머리 위 닉네임.
//
// 글자를 작은 캔버스에 그려 텍스처로 씁니다. 폰트 파일을 따로 받지 않아도 되고,
// 한글도 시스템 폰트로 그대로 나옵니다. (StatusMarker 가 이모지를 그리는 방식과 같습니다)
// 닉네임 종류가 사람 수만큼뿐이라, 이름마다 한 번만 만들어 두고 다시 씁니다.
import { Billboard } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace } from 'three'

const HEIGHT = 2.2 // 표시등(1.85)보다 위에 둡니다.
const FONT = 64 // 캔버스에 그릴 글자 크기(픽셀)
const PAD = 16
const SCALE = 0.004 // 캔버스 픽셀 → 공간 크기

const textures = new Map<string, { texture: CanvasTexture; w: number; h: number }>()

function nameTexture(name: string) {
  let made = textures.get(name)
  if (!made) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `600 ${FONT}px system-ui, sans-serif`
    ctx.font = font
    const width = Math.ceil(ctx.measureText(name).width) + PAD * 2
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
    ctx.fillStyle = '#fff'
    ctx.fillText(name, width / 2, height / 2 + 2)

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    made = { texture, w: width, h: height }
    textures.set(name, made)
  }
  return made
}

export function NameTag({ x, z, name }: { x: number; z: number; name: string }) {
  const { texture, w, h } = nameTexture(name)
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
