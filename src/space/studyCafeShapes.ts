// Cam Study Cafe 가구 모양 (React 와 무관한 three 도형). 한 가구의 같은 재질 조각을 한 도형으로 합쳐 둡니다.
// 칸막이 책상은 수십 개라, 조각마다 메시를 만들면 그리기 호출이 너무 많아져 느려집니다 (일반 노트북 30FPS 목표).
// 합친 도형 하나를 InstancedMesh 로 자리마다 찍으면 재질 하나당 한 번만 그립니다 (StudyCafeDecor 의 Cubicles).
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry, Shape } from 'three'
import type { BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 칸막이 책상: 폭·깊이는 자리 책상 상자(SEAT 1.2×0.6)와 같음. 앉는 사람은 -z 쪽, 앞 칸막이는 +z 쪽
export const CUBICLE = {
  w: 1.2,
  d: 0.6,
  deskH: 0.74,
  top: 0.035,
  panelT: 0.03,
  height: 1.32, // 칸막이 높이
  glassFrom: 1.0, // 앞 칸막이: 이 높이까지 원목, 위는 골유리
  cap: 0.04, // 앞 칸막이 맨 위 원목 띠
  cornerR: 0.24, // 옆 칸막이 통로 쪽 위 모서리 둥글기
  sideX: 0.58, // 옆 칸막이 가운데 (옆 자리 칸막이와 겹치지 않게 0.6 보다 안쪽)
  lamp: { x: 0.4, z: 0.16, armTo: 0.17, h: 0.44 }, // 스탠드 기둥 자리, 갓 자리(x), 기둥 높이
}

// 조각 하나: 돌리고 옮긴 뒤 합치기 좋게 인덱스를 풉니다 (Extrude 는 인덱스가 없어 모두 맞춤)
function piece(geo: BufferGeometry, x: number, y: number, z: number, rot?: { x?: number; y?: number; z?: number }) {
  if (rot?.x) geo.rotateX(rot.x)
  if (rot?.y) geo.rotateY(rot.y)
  if (rot?.z) geo.rotateZ(rot.z)
  geo.translate(x, y, z)
  return geo.index ? geo.toNonIndexed() : geo
}
const merge = (parts: BufferGeometry[]) => mergeGeometries(parts, false)!

// 옆 칸막이 판: 뒤(앉는 쪽, -z) 위 모서리를 둥글린 판. 모양은 (z, y) 평면에 그리고 x 쪽으로 두께를 줍니다
function sidePanel(x: number) {
  const C = CUBICLE
  const s = new Shape()
  const back = -C.d / 2 - 0.02
  const front = C.d / 2
  s.moveTo(front, 0)
  s.lineTo(front, C.height)
  s.lineTo(back + C.cornerR, C.height)
  s.quadraticCurveTo(back, C.height, back, C.height - C.cornerR)
  s.lineTo(back, 0)
  s.closePath()
  const geo = new ExtrudeGeometry(s, { depth: C.panelT, bevelEnabled: false, curveSegments: 8 })
  // 모양의 x(=z 방향 거리)를 월드 z 로: y 축으로 -90° 돌리면 모양 x → z, 두께(z) → -x
  geo.rotateY(-Math.PI / 2)
  // 나뭇결 텍스처 한 장이 판 하나에 들어가도록 UV 를 0~1 로 줄임 (Extrude UV 는 m 단위)
  const uv = geo.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / C.d, uv.getY(i) / C.height)
  return piece(geo, x + C.panelT / 2, 0, 0)
}

let cubicleCache: Record<'wood' | 'glass' | 'dark' | 'glow' | 'pool', BufferGeometry> | null = null
// 칸막이 책상 도형 다섯 벌: 원목(칸막이·상판), 골유리, 검은 것(스탠드·콘센트), 빛나는 것(LED 띠·전구), 책상 위 불빛 웅덩이
export function cubicleGeometries() {
  if (cubicleCache) return cubicleCache
  const C = CUBICLE
  const L = C.lamp
  const frontZ = C.d / 2 - C.panelT / 2
  const innerW = C.sideX * 2 - C.panelT
  const wood = merge([
    sidePanel(-C.sideX),
    sidePanel(C.sideX),
    piece(new BoxGeometry(innerW, C.top, C.d - C.panelT), 0, C.deskH - C.top / 2, -C.panelT / 2), // 상판
    piece(new BoxGeometry(innerW, C.glassFrom, C.panelT), 0, C.glassFrom / 2, frontZ), // 앞 칸막이 아래 원목
    piece(new BoxGeometry(innerW, C.cap, C.panelT + 0.01), 0, C.height - C.cap / 2, frontZ), // 맨 위 원목 띠
  ])
  const glass = merge([piece(new BoxGeometry(innerW, C.height - C.cap - C.glassFrom, 0.012), 0, (C.height - C.cap + C.glassFrom) / 2, frontZ)])
  const dark = merge([
    piece(new CylinderGeometry(0.065, 0.07, 0.02, 20), L.x, C.deskH + 0.01, L.z), // 스탠드 받침
    piece(new CylinderGeometry(0.008, 0.008, L.h, 8), L.x, C.deskH + L.h / 2, L.z), // 기둥
    piece(new BoxGeometry(L.x - L.armTo, 0.012, 0.012), (L.x + L.armTo) / 2, C.deskH + L.h, L.z), // 팔
    piece(new CylinderGeometry(0.03, 0.095, 0.12, 20, 1, true), L.armTo, C.deskH + L.h - 0.05, L.z), // 갓 (아래가 열림)
    piece(new BoxGeometry(0.14, 0.07, 0.012), -0.3, C.deskH + 0.12, C.d / 2 - C.panelT - 0.006), // 콘센트 판
  ])
  const glow = merge([
    piece(new BoxGeometry(innerW - 0.2, 0.012, 0.02), 0, C.height - C.cap - 0.012, C.d / 2 - C.panelT - 0.012), // 칸막이 LED 띠
    piece(new CylinderGeometry(0.07, 0.07, 0.006, 20), L.armTo, C.deskH + L.h - 0.1, L.z), // 갓 속 전구
  ])
  const pool = merge([piece(new PlaneGeometry(0.62, 0.5), L.armTo - 0.02, C.deskH + 0.003, L.z - 0.06, { x: -Math.PI / 2 })]) // 스탠드 불빛이 책상에 번진 자리
  cubicleCache = { wood, glass, dark, glow, pool }
  return cubicleCache
}

// 메시 사무용 의자 (앉는 사람이 +z 를 봄, 등받이는 -z): 검은 뼈대, 방석(강조색), 메시 등받이
export const OFFICE_CHAIR = { seatH: 0.47 }
let officeCache: Record<'frame' | 'seat' | 'back', BufferGeometry> | null = null
export function officeChairGeometries() {
  if (officeCache) return officeCache
  const H = OFFICE_CHAIR.seatH
  const star = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2
    return piece(new BoxGeometry(0.04, 0.03, 0.3), Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, { y: a })
  })
  const wheels = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2
    return piece(new CylinderGeometry(0.025, 0.025, 0.03, 10), Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29, { z: Math.PI / 2, y: a })
  })
  const frame = merge([
    ...star,
    ...wheels,
    piece(new CylinderGeometry(0.025, 0.03, H - 0.1, 10), 0, (H - 0.1) / 2 + 0.05, 0), // 가스 실린더
    piece(new BoxGeometry(0.3, 0.03, 0.3), 0, H - 0.06, 0), // 방석 받침
    ...[-1, 1].flatMap((sx) => [
      piece(new BoxGeometry(0.03, 0.22, 0.03), sx * 0.25, H + 0.08, -0.02), // 팔걸이 기둥
      piece(new BoxGeometry(0.06, 0.025, 0.24), sx * 0.25, H + 0.2, 0.02), // 팔걸이
    ]),
    piece(new BoxGeometry(0.04, 0.3, 0.03), 0, H + 0.1, -0.25), // 등받이 기둥
    piece(new BoxGeometry(0.48, 0.035, 0.05), 0, H + 0.62, -0.27, { x: -0.12 }), // 등받이 위 테
  ])
  const seat = merge([piece(new BoxGeometry(0.48, 0.07, 0.46), 0, H, 0.02)])
  const back = merge([piece(new BoxGeometry(0.44, 0.44, 0.025), 0, H + 0.38, -0.25, { x: -0.12 })])
  officeCache = { frame, seat, back }
  return officeCache
}

// 패브릭 셸 의자 (창가 바): 둥근 패브릭 몸통(방석 + 감싸는 등받이) + 벌어진 원목 다리 네 개
export const SHELL_CHAIR = { seatH: 0.46, backR: 0.25 }
let shellCache: Record<'body' | 'legs', BufferGeometry> | null = null
export function shellChairGeometries() {
  if (shellCache) return shellCache
  const S = SHELL_CHAIR
  const body = merge([
    piece(new CylinderGeometry(S.backR, S.backR - 0.02, 0.08, 28), 0, S.seatH - 0.04, 0), // 방석 (둥근)
    // 감싸는 등받이: 뒤쪽(-z) 반원 띠. θ=π 가 -z
    piece(new CylinderGeometry(S.backR, S.backR - 0.02, 0.34, 28, 1, true, Math.PI - 1.35, 2.7), 0, S.seatH + 0.15, 0),
    piece(new CylinderGeometry(S.backR - 0.035, S.backR - 0.05, 0.32, 28, 1, true, Math.PI - 1.3, 2.6), 0, S.seatH + 0.15, 0), // 안쪽 면 (두께감)
  ])
  const legs = merge(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => piece(new CylinderGeometry(0.018, 0.012, S.seatH - 0.07, 8), sx * 0.15, (S.seatH - 0.07) / 2, sz * 0.15, { x: -sz * 0.12, z: sx * 0.12 })),
  )
  shellCache = { body, legs }
  return shellCache
}
