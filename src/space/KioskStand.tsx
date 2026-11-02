// 스터디카페 키오스크 3D 모델: 흰색 스탠드형 (사진 참고 IMG_4584).
// 세로 화면 + 앞으로 나온 받침(카드 대는 곳) + 영수증 나오는 곳 + 앞뒤로 휘어 바닥에 닿는 다리.
// 조작은 예전과 같습니다. 앞에서 E 를 누르면 KioskScreen 이 뜨고, 부딪힘은 layout.ts 의 KIOSK 상자 그대로입니다.
//
// 좌표: 키오스크 기준 앞이 +z. 옆모습을 그려 폭만큼 뽑아(Extrude) 몸통을 만듭니다.
// 모양과 재질은 지점이 달라도 같이 씁니다(화면 그림만 지점 이름별로 한 번씩 만듦).
import { useMemo } from 'react'
import { CanvasTexture, ExtrudeGeometry, MeshStandardMaterial, SRGBColorSpace, Shape, ShapeGeometry } from 'three'

const W = 0.52 // 몸통 폭 (부딪힘 상자 KIOSK.w 0.6 안)
const BODY_TOP = 0.98 // 몸통이 화면 판과 만나는 높이
const BODY_BEVEL = 0.01 // 몸통 모서리 둥글기
const PANEL = { y0: 0.9, y1: 1.82, r: 0.05, t: 0.035, bevel: 0.008, back: 0.02 } // 화면 판: 아래·위 높이, 모서리, 두께, 뒤판 두께
const BEZEL = { pad: 0.012, r: 0.04 } // 검은 테두리: 판 가장자리에서 들어온 길이, 모서리
const SCREEN = { pad: 0.022, top: 0.022, bottom: 0.03 } // 화면: 테두리 안쪽 여백
const SCREEN_PX = { w: 360, h: 660 } // 화면 그림 크기
const READER = { w: 0.13, h: 0.12, t: 0.006, x: 0.14, y: 0.876, z: 0.1, tilt: 0.95 } // 받침 위 카드 대는 곳: 크기, 자리, 기울기(앞으로 눕힘)
const PRINTER = { w: 0.17, h: 0.17, t: 0.008, y: 0.6, z: 0.126, tilt: -0.055 } // 영수증 덮개: 몸통 앞면에 맞춰 기울임
const SLOT = { w: 0.12, h: 0.012, y: 0.05 } // 영수증 나오는 틈 (덮개 가운데 기준 높이)
const PAPER = { w: 0.1, h: 0.04, y: 0.024 } // 나와 있는 영수증
const LEDS = [
  { w: 0.11, y: 0.905, z: 0.052, tilt: 0.95 },
  { w: 0.14, y: 0.836, z: 0.138, tilt: 0.95 },
  { w: 0.13, y: 0.71, z: 0.135, tilt: -0.055 },
] // 하늘색 불빛 줄: 폭, 자리, 놓인 면 기울기
const LED_H = 0.006
const COLOR = {
  body: '#eef0f2',
  edge: '#3a3d42',
  bezel: '#0e0f12',
  led: '#7fe7ec',
  slot: '#1b1c1f',
  reader: '#dfe2e6',
  paper: '#ffffff',
  screen: { bg: ['#f4f7f9', '#dfe6ec'], ink: '#23272c', soft: '#5f666e', line: '#c9d0d7' },
}

// ── 모양 (한 번만 만듦) ─────────────────────────────────────────

function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new Shape()
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  s.moveTo(x0 + r, y0)
  s.lineTo(x0 + w - r, y0)
  s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x0 + w, y0 + h - r)
  s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x0 + r, y0 + h)
  s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + r)
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

// 몸통 옆모습 (가로 = z, 세로 = y). 뒤쪽 다리 → 등 → 화면 아래 → 받침 → 앞면 → 앞쪽 다리
function bodyProfile() {
  const s = new Shape()
  s.moveTo(-0.17, 0)
  s.lineTo(-0.17, 0.008)
  s.quadraticCurveTo(-0.045, 0.02, -0.04, 0.2) // 뒤쪽 다리가 등으로 휘어 올라감
  s.lineTo(-0.04, BODY_TOP)
  s.lineTo(0, BODY_TOP) // 화면 판 뒤에 숨는 부분. 앞면(둥글기 포함)이 화면보다 앞으로 나오면 화면을 뚫고 보임
  s.lineTo(0, PANEL.y0 + 0.005)
  s.quadraticCurveTo(0.02, 0.88, 0.17, 0.815) // 화면 아래에서 앞으로 나오는 받침 윗면
  s.quadraticCurveTo(0.19, 0.8, 0.178, 0.782) // 받침 앞 끝
  s.quadraticCurveTo(0.14, 0.75, 0.135, 0.72) // 받침 아래가 앞면으로 들어감
  s.lineTo(0.105, 0.22) // 앞면은 아래로 갈수록 살짝 좁아짐
  s.quadraticCurveTo(0.105, 0.03, 0.27, 0.008) // 앞쪽 다리가 바닥으로 휘어 나감
  s.lineTo(0.27, 0)
  s.closePath()
  return s
}

let shapes: { body: ExtrudeGeometry; panel: ExtrudeGeometry; bezel: ShapeGeometry; screen: ShapeGeometry; back: ExtrudeGeometry } | null = null
function kioskShapes() {
  if (shapes) return shapes
  const body = new ExtrudeGeometry(bodyProfile(), { depth: W - BODY_BEVEL * 2, bevelEnabled: true, bevelSize: BODY_BEVEL, bevelThickness: BODY_BEVEL, bevelSegments: 2, curveSegments: 14 })
  body.rotateY(-Math.PI / 2) // 옆모습의 가로가 z, 뽑은 방향이 -x 가 됨
  body.translate(W / 2 - BODY_BEVEL, 0, 0)

  const h = PANEL.y1 - PANEL.y0
  const cy = (PANEL.y0 + PANEL.y1) / 2
  const panel = new ExtrudeGeometry(roundedRect(W - PANEL.bevel * 2, h - PANEL.bevel * 2, PANEL.r, 0, cy), { depth: PANEL.t, bevelEnabled: true, bevelSize: PANEL.bevel, bevelThickness: PANEL.bevel, bevelSegments: 3, curveSegments: 8 })
  panel.translate(0, 0, -0.023)
  const back = new ExtrudeGeometry(roundedRect(W - PANEL.bevel * 2, h - PANEL.bevel * 2, PANEL.r, 0, cy), { depth: PANEL.back, bevelEnabled: false, curveSegments: 8 })
  back.translate(0, 0, -0.023 - PANEL.bevel - PANEL.back)

  const bw = W - BEZEL.pad * 2
  const bh = h - BEZEL.pad * 2
  const bezel = new ShapeGeometry(roundedRect(bw, bh, BEZEL.r, 0, cy), 8)
  const sw = bw - SCREEN.pad * 2
  const sh = bh - SCREEN.top - SCREEN.bottom
  const sy = cy + (SCREEN.bottom - SCREEN.top) / 2
  const screen = new ShapeGeometry(roundedRect(sw, sh, BEZEL.r * 0.5, 0, sy), 6)
  // 화면 그림이 판 전체에 한 장 맞게 UV 를 0~1 로 맞춤
  const pos = screen.attributes.position
  const uv = screen.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, (pos.getY(i) - sy) / sh + 0.5)
  uv.needsUpdate = true
  shapes = { body, panel, bezel, screen, back }
  return shapes
}

// ── 재질 ────────────────────────────────────────────────────

const mats = {
  body: new MeshStandardMaterial({ color: COLOR.body, roughness: 0.38, metalness: 0.08 }),
  edge: new MeshStandardMaterial({ color: COLOR.edge, roughness: 0.5, metalness: 0.4 }),
  bezel: new MeshStandardMaterial({ color: COLOR.bezel, roughness: 0.25, metalness: 0.2 }),
  reader: new MeshStandardMaterial({ color: COLOR.reader, roughness: 0.45 }),
  slot: new MeshStandardMaterial({ color: COLOR.slot, roughness: 0.8 }),
  paper: new MeshStandardMaterial({ color: COLOR.paper, roughness: 0.9 }),
}

// 화면 그림: 지점 이름, 환영 인사, 시작 안내, 아래 아이콘 세 개 (실제 조작 화면은 E 로 뜨는 KioskScreen)
const screens = new Map<string, CanvasTexture>()
function screenTexture(name: string) {
  let t = screens.get(name)
  if (t) return t
  const { w: PW, h: PH } = SCREEN_PX
  const c = document.createElement('canvas')
  c.width = PW
  c.height = PH
  const g = c.getContext('2d')!
  const { bg, ink, soft, line } = COLOR.screen
  const grad = g.createLinearGradient(0, 0, PW, PH)
  grad.addColorStop(0, bg[0])
  grad.addColorStop(1, bg[1])
  g.fillStyle = grad
  g.fillRect(0, 0, PW, PH)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = soft
  g.font = '600 24px system-ui, sans-serif'
  g.fillText(name, PW / 2, 56)
  g.fillStyle = ink
  g.font = '800 54px system-ui, sans-serif'
  g.fillText('환영합니다', PW / 2, 248)
  g.font = '400 26px system-ui, sans-serif'
  g.fillStyle = soft
  g.fillText('좌석 이용권', PW / 2, 298)
  g.font = '400 22px system-ui, sans-serif'
  g.fillText('화면을 눌러 시작하세요', PW / 2, 372)
  g.strokeStyle = line
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(30, 520)
  g.lineTo(PW - 30, 520)
  g.stroke()
  const icons: [number, string][] = [[PW * 0.2, '좌석'], [PW * 0.5, '이용 시간'], [PW * 0.8, '도움말']]
  g.strokeStyle = ink
  g.lineWidth = 3
  icons.forEach(([x, label], i) => {
    const y = 566
    g.beginPath()
    if (i === 0) {
      // 의자: 등받이와 방석
      g.moveTo(x - 10, y - 18)
      g.lineTo(x - 10, y + 12)
      g.moveTo(x - 10, y + 2)
      g.lineTo(x + 12, y + 2)
      g.lineTo(x + 12, y + 16)
    } else if (i === 1) {
      // 시계
      g.arc(x, y, 17, 0, Math.PI * 2)
      g.moveTo(x, y - 10)
      g.lineTo(x, y)
      g.lineTo(x + 8, y + 4)
    } else {
      g.arc(x, y, 17, 0, Math.PI * 2)
    }
    g.stroke()
    if (i === 2) {
      g.fillStyle = ink
      g.font = '700 22px system-ui, sans-serif'
      g.fillText('?', x, y + 1)
    }
    g.fillStyle = soft
    g.font = '400 17px system-ui, sans-serif'
    g.fillText(label, x, y + 40)
  })
  t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  screens.set(name, t)
  return t
}

// x·z: 지점 JSON 의 kiosk 자리, name: 화면에 보일 지점 이름
// 방 가운데 쪽을 바라보게 돌립니다 (JSON 에 방향을 따로 두지 않음).
export function KioskStand({ x, z, name }: { x: number; z: number; name: string }) {
  const g = kioskShapes()
  const rot = useMemo(() => Math.atan2(-x, -z), [x, z])
  const panelFront = -0.023 + PANEL.t + PANEL.bevel
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={g.body} material={mats.body} />
      <mesh geometry={g.panel} material={mats.body} />
      <mesh geometry={g.back} material={mats.edge} />
      <mesh geometry={g.bezel} material={mats.bezel} position-z={panelFront + 0.001} />
      <mesh geometry={g.screen} position-z={panelFront + 0.002}>
        {/* 화면은 스스로 빛나서 지점 조명과 상관없이 잘 보임 */}
        <meshBasicMaterial map={screenTexture(name)} toneMapped={false} />
      </mesh>

      {/* 받침 위 카드 대는 곳 */}
      <mesh position={[READER.x, READER.y, READER.z]} rotation-x={READER.tilt} material={mats.reader}>
        <boxGeometry args={[READER.w, READER.h, READER.t]} />
      </mesh>

      {/* 영수증 덮개와 틈, 나와 있는 영수증 */}
      <group position={[0, PRINTER.y, PRINTER.z]} rotation-x={PRINTER.tilt}>
        <mesh material={mats.reader}>
          <boxGeometry args={[PRINTER.w, PRINTER.h, PRINTER.t]} />
        </mesh>
        <mesh position={[0, SLOT.y, PRINTER.t / 2 + 0.001]} material={mats.slot}>
          <planeGeometry args={[SLOT.w, SLOT.h]} />
        </mesh>
        <mesh position={[0, PAPER.y, PRINTER.t / 2 + 0.003]} material={mats.paper}>
          <planeGeometry args={[PAPER.w, PAPER.h]} />
        </mesh>
      </group>

      {/* 하늘색 불빛 줄 */}
      {LEDS.map((l, i) => (
        <mesh key={i} position={[0, l.y, l.z]} rotation-x={l.tilt}>
          <planeGeometry args={[l.w, LED_H]} />
          <meshBasicMaterial color={COLOR.led} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
