// 전체 지도 한 장(아틀라스): 캠리단길과 캠빛 대학교를 같이 놓고, 확대·이동하는 계산. React·화면과 무관한 순수 로직입니다. (Node 로 검사)
//
// 두 월드는 좌표가 따로인 다른 공간이고 정문으로만 이어집니다. 지도에서는 캠퍼스를 왼쪽으로 90도 돌려(CAMPUS_TURN)
// 남쪽 정문이 동쪽(캠리단길 쪽)을 보게 하고, 그 정문이 캠리단길 서쪽 돌길 끝과 한 줄이 되게 옮깁니다(campusOffset).
// 두 정문 사이는 곧은 "캠빛 대학교 가는 길"(linkRoad)입니다. 캠리단길은 위쪽이 북쪽(-Z), 캠퍼스는 왼쪽이 캠퍼스의 북쪽입니다.
//   turnPoint  월드 안 좌표를 돌린 좌표로 (turn: 라디안, worldLogic.rotate 와 같은 방향. π/2 면 동쪽이 위쪽으로 = 왼쪽으로 90도)
//   fitView    한 곳(월드 하나 또는 전체)이 지도 창 비율에 맞게 보이는 viewBox
//   zoomView   한 점을 중심으로 확대·축소 (휠·버튼), panView 끌어서 옮기기. 둘 다 전체 범위 밖으로 너무 나가지 않게
//   textWidth  이름표 글자 폭 어림 (한글은 글자 크기만큼, 영문·숫자는 조금 좁게)
//   storyHeight 건물을 비스듬히 위에서 본 모양으로 그릴 때 앞벽 높이 (층수만큼)
import type { Box } from '../space/layout'
import type { GateSpec, PlazaLayout } from '../world/worldLogic'

export type Point = { x: number; z: number }
export type Rect = { x: number; z: number; w: number; d: number } // 가운데 좌표와 크기
export type View = { x: number; z: number; w: number; d: number } // 왼쪽 위 모서리와 크기 (SVG viewBox 그대로)

export const CAMPUS_TURN = Math.PI / 2 // 캠퍼스를 왼쪽으로 90도: 남쪽 정문이 동쪽(캠리단길)을 봄
export const ROAD_LEN = 8 // 캠리단길 서쪽 끝에서 캠퍼스 정문까지 길이(m)
export const ASPECT = 1.6 // 지도 창 가로 ÷ 세로
export const PHONE = { width: 640, aspect: 1 } // 이보다 좁은 화면(폰)은 정사각형 지도 (가로로 길면 너무 낮아짐)
export const aspectFor = (screenW: number) => (screenW < PHONE.width ? PHONE.aspect : ASPECT)
export const VIEW_PAD = 4 // 한 곳을 맞춰 보여 줄 때 둘레 여유(m)
// minW: 가장 크게 확대했을 때 보이는 가로(m), step: 버튼 한 번에 바뀌는 배율, out: "전체"보다 이만큼 더 넓게까지 축소
export const ZOOM = { minW: 24, step: 1.4, out: 2.5 }
export const STORY_H = 1.4 // 지도에서 건물 한 층 앞벽 높이(m). 실제 높이(3.6)보다 낮게 해 지붕이 덜 가려지게

// 돌리기 (worldLogic.rotate 와 같은 식). 90도 단위만 쓰므로 반올림해 작은 오차를 없앰
const round = (v: number) => Math.round(v * 1e6) / 1e6
export function turnPoint(p: Point, turn: number): Point {
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  return { x: round(p.x * c + p.z * s), z: round(p.z * c - p.x * s) }
}
// 90도·270도 돌리면 가로·세로가 바뀜
export const quarterOdd = (turn: number) => Math.abs(Math.sin(turn)) > 0.5
export function turnRect(r: Rect, turn: number): Rect {
  const c = turnPoint(r, turn)
  return quarterOdd(turn) ? { x: c.x, z: c.z, w: r.d, d: r.w } : { x: c.x, z: c.z, w: r.w, d: r.d }
}

// 월드 전체 사각형 (월드 가운데가 offset, turn 만큼 돌림)
export const worldRect = (layout: Pick<PlazaLayout, 'size'>, offset: Point = { x: 0, z: 0 }, turn = 0): Rect => {
  const r = turnRect({ x: 0, z: 0, w: layout.size.w, d: layout.size.d }, turn)
  return { ...r, x: offset.x, z: offset.z }
}

// 여러 사각형을 모두 담는 사각형
export function unionRect(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x - r.w / 2))
  const x1 = Math.max(...rects.map((r) => r.x + r.w / 2))
  const z0 = Math.min(...rects.map((r) => r.z - r.d / 2))
  const z1 = Math.max(...rects.map((r) => r.z + r.d / 2))
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
}

const inBox = (p: Point, b: Box) => Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.z - b.z) <= b.d / 2

// 길이 시작하는 곳: 캠리단길 정문이 놓인 돌길의 서쪽 끝 (정문이 돌길 위에 없으면 정문 자리)
function roadStart(plaza: PlazaLayout, plazaGate: GateSpec): Point {
  const path = plaza.paths.find((p) => inBox(plazaGate, p))
  return path ? { x: path.x - path.w / 2, z: path.z } : { x: plazaGate.x, z: plazaGate.z }
}

// 캠퍼스를 옮길 자리: 돌린 캠퍼스 정문이 길 시작에서 서쪽으로 ROAD_LEN 떨어진 곳에 오게
export function campusOffset(plaza: PlazaLayout, plazaGate: GateSpec, campusGate: GateSpec, turn = CAMPUS_TURN): Point {
  const start = roadStart(plaza, plazaGate)
  const gate = turnPoint(campusGate, turn)
  return { x: start.x - ROAD_LEN - gate.x, z: start.z - gate.z }
}

// 캠리단길 → 캠퍼스 곧은 길: 길 시작에서 돌린 캠퍼스 정문까지
export function linkRoad(plaza: PlazaLayout, plazaGate: GateSpec, campusGate: GateSpec, offset: Point, turn = CAMPUS_TURN): Point[] {
  const gate = turnPoint(campusGate, turn)
  return [roadStart(plaza, plazaGate), { x: gate.x + offset.x, z: gate.z + offset.z }]
}

// r 이 다 보이고 가로·세로 비율이 aspect 인 viewBox (가운데 정렬, 둘레 pad)
export function fitView(r: Rect, aspect = ASPECT, pad = VIEW_PAD): View {
  let w = r.w + pad * 2
  let d = r.d + pad * 2
  if (w / d > aspect) d = w / aspect
  else w = d * aspect
  return { x: r.x - w / 2, z: r.z - d / 2, w, d }
}

// at(지도 좌표)을 그 자리에 둔 채 factor 배로 (1 보다 크면 확대 = 보이는 범위가 좁아짐). 가로는 minW ~ 전체(bounds) 맞춘 크기
export function zoomView(v: View, factor: number, at: Point, bounds: Rect, aspect = ASPECT, minW = ZOOM.minW): View {
  const maxW = fitView(withTitle(bounds), aspect).w * ZOOM.out // "전체"보다 더 넓게까지
  const w = Math.min(maxW, Math.max(minW, v.w / factor))
  const k = w / v.w
  const next = { x: at.x - (at.x - v.x) * k, z: at.z - (at.z - v.z) * k, w, d: v.d * k }
  return clampView(next, bounds)
}

// 끌어서 옮기기 (dx·dz 는 지도 m)
export const panView = (v: View, dx: number, dz: number, bounds: Rect): View => clampView({ ...v, x: v.x + dx, z: v.z + dz }, bounds)

// 보이는 범위의 가운데가 전체 범위 밖으로 나가지 않게
export function clampView(v: View, bounds: Rect): View {
  const cx = Math.min(bounds.x + bounds.w / 2, Math.max(bounds.x - bounds.w / 2, v.x + v.w / 2))
  const cz = Math.min(bounds.z + bounds.d / 2, Math.max(bounds.z - bounds.d / 2, v.z + v.d / 2))
  return { ...v, x: cx - v.w / 2, z: cz - v.d / 2 }
}

// 이름표 글자 폭 어림 (m). 한글·한자 등은 글자 크기, 영문·숫자 0.6배, 띄어쓰기 0.3배
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) w += ch === ' ' ? 0.3 : /[ -~]/.test(ch) ? 0.6 : 1
  return w * size
}

export const storyHeight = (stories: number) => STORY_H * Math.max(1, stories)

// 이름표 크기 배율: 확대·화면 폭과 상관없이 건물 이름 글자가 화면에서 늘 비슷한 크기(px)로 보이게.
// 이름 글자 크기(1.25m) × 배율 × (화면 px ÷ 보이는 가로 m) = LABEL_PX. 폰은 건물이 작게 보여 글자도 조금 작게
export const LABEL_PX = { desk: 15, phone: 11, name: 1.25 }
export function labelScale(viewW: number, screenW: number): number {
  const px = screenW < PHONE.width ? LABEL_PX.phone : LABEL_PX.desk
  return Math.min(4, Math.max(0.3, (px * viewW) / (LABEL_PX.name * Math.max(1, screenW))))
}

export const TITLE_ROOM = 6 // 월드 이름표가 섬 위 바깥에 붙어서, 맞춰 볼 때 위쪽에 더 두는 여유(m)
// 맞춰 볼 사각형: 위쪽에 월드 이름표 자리를 더함
export const withTitle = (r: Rect): Rect => ({ ...r, z: r.z - TITLE_ROOM / 2, d: r.d + TITLE_ROOM })
