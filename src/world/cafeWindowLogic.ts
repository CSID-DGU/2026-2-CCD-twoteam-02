// 캠리단길 카페 안 통창. React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   cafeWindows  지점 실내 통창 자리. 창으로 실제 캠리단길 거리가 보입니다(CafeWindows 가 거리를 같이 그림).
//                - 출입문 벽(남쪽, front): 문 양옆으로 벽 끝까지 하나씩
//                - 옆벽(world.json 건물의 sideWindow: west·east): 그 벽에 길게 하나
//                벽에 걸린 액자·메뉴판, 회의실 문·엘리베이터 자리는 피하고 남은 가장 넓은 틈에 냄.
//                창틀은 그 건물 파사드(facade)와 같은 모양. 파사드 없는 건물(캠빛 대학교)은 창 없음.
//   windowHoles  한 벽에 난 창 → 그 벽에 낼 구멍 (벽을 따라가는 범위 a0~a1, 높이 y0~y1)
//   wallPieces   구멍 난 벽을 상자 조각으로 (화면에만. 부딪힘은 원래 벽 그대로라 창으로 나갈 수 없음)
import type { Box, BranchLayout } from '../space/layout'
import { FRAME } from '../space/theme'
import type { Frame } from '../space/theme'
import type { FacadeStyle, PlacedBuilding } from './worldLogic'

// sill·top: 창 아래·위 끝 높이 (가장 낮은 천장 2.5m, 월넛 바 벽 타일 띠 2.2m 아래), edge: 벽 끝에서 남길 기둥,
// doorGap: 문 옆에 남길 벽, decorPad: 걸린 것 둘레 여유, minW: 이보다 좁은 틈엔 창을 안 냄, pane: 유리 한 칸 폭(살 간격)
export const CAFE_WINDOW = { sill: 0.05, top: 2.2, edge: 0.4, doorGap: 0.4, decorPad: 0.15, minW: 1.2, pane: 1.6 }
export const FLOOR_H = 3.6 // 건물 한 층 높이 (WorldDecor 의 BUILDING_H 와 같음). 위층에서는 거리를 이만큼씩 내려다봄

export type WindowWall = 'front' | 'west' | 'east'
// x·z: 창 가운데 (벽 가운데 선 위), w: 벽을 따라가는 길이
export type CafeWindow = { wall: WindowWall; x: number; z: number; w: number }
export type CafeWindows = { style: FacadeStyle; level: number; spots: CafeWindow[] }
export type Hole = { a0: number; a1: number; y0: number; y1: number }
export type WallPiece = { x: number; y: number; z: number; w: number; h: number; d: number }
type Layout = Pick<BranchLayout, 'size' | 'door' | 'theme' | 'meetingDoor' | 'elevator'>
type Span = { a0: number; a1: number }

// [a, b] 구간에서 막힌 곳을 빼고 남은 가장 넓은 틈
function widestGap(a: number, b: number, blocked: Span[]): Span | null {
  let best: Span | null = null
  let x = a
  const keep = (a0: number, a1: number) => {
    if (!best || a1 - a0 > best.a1 - best.a0) best = { a0, a1 }
  }
  for (const k of [...blocked].sort((p, q) => p.a0 - q.a0)) {
    if (k.a1 <= x || k.a0 >= b) continue
    if (k.a0 > x) keep(x, k.a0)
    x = Math.max(x, k.a1)
  }
  if (b > x) keep(x, b)
  return best
}

// 벽에 걸린 액자의 face 는 액자가 보는 쪽: 출입문 벽(남)에 건 것은 n, 서쪽 벽은 e, 동쪽 벽은 w
const FACE_OF: Record<WindowWall, Frame['face']> = { front: 'n', west: 'e', east: 'w' }

// 그 벽을 따라 막힌 범위 (액자·메뉴판·회의실 문·엘리베이터)
function blockedOn(layout: Layout, wall: WindowWall, line: number): Span[] {
  const t = layout.theme
  const along = (o: { x: number; z: number }) => (wall === 'front' ? o.x : o.z)
  const onWall = (o: { x: number; z: number; face: Frame['face'] }) => o.face === FACE_OF[wall] && Math.abs((wall === 'front' ? o.z : o.x) - line) < 0.3
  const spans: Span[] = []
  const add = (at: number, w: number) => spans.push({ a0: at - w / 2 - CAFE_WINDOW.decorPad, a1: at + w / 2 + CAFE_WINDOW.decorPad })
  for (const f of t?.frames ?? []) if (onWall(f)) add(along(f), FRAME.w)
  if (t?.menu && onWall(t.menu)) add(along(t.menu), t.menu.w)
  for (const box of [layout.meetingDoor, layout.elevator, layout.door]) {
    if (!box) continue
    const hits = wall === 'front' ? Math.abs(box.z - line) < 0.3 : Math.abs(box.x - line) < 0.3
    if (hits) add(along(box), (wall === 'front' ? box.w : box.d) + (box === layout.door ? CAFE_WINDOW.doorGap * 2 - CAFE_WINDOW.decorPad * 2 : 0))
  }
  return spans
}

export function cafeWindows(building: PlacedBuilding | undefined, layout: Layout & { id: string }): CafeWindows | null {
  const style = building?.spec.facade
  const floor = building?.floors.find((f) => f.slug === layout.id)
  const door = layout.door
  if (!style || !floor || !door) return null
  const W = CAFE_WINDOW
  const { w: sw, d: sd } = layout.size
  const spots: CafeWindow[] = []
  // 출입문 벽: 문 왼쪽·오른쪽 반마다 가장 넓은 틈
  const front = blockedOn(layout, 'front', door.z)
  for (const [a, b] of [
    [-sw / 2 + W.edge, door.x],
    [door.x, sw / 2 - W.edge],
  ]) {
    const g = widestGap(a, b, front)
    if (g && g.a1 - g.a0 >= W.minW) spots.push({ wall: 'front', x: (g.a0 + g.a1) / 2, z: door.z, w: g.a1 - g.a0 })
  }
  // 옆벽 하나
  const side = building.spec.sideWindow
  if (side) {
    const x = side === 'west' ? -sw / 2 : sw / 2
    const g = widestGap(-sd / 2 + W.edge, sd / 2 - W.edge, blockedOn(layout, side, x))
    if (g && g.a1 - g.a0 >= W.minW) spots.push({ wall: side, x, z: (g.a0 + g.a1) / 2, w: g.a1 - g.a0 })
  }
  return { style, level: floor.level, spots }
}

export const windowHoles = (spots: CafeWindow[], wall: WindowWall): Hole[] =>
  spots
    .filter((s) => s.wall === wall)
    .map((s) => {
      const at = wall === 'front' ? s.x : s.z
      return { a0: at - s.w / 2, a1: at + s.w / 2, y0: CAFE_WINDOW.sill, y1: CAFE_WINDOW.top }
    })

// 유리 칸 수 (살 사이). 넓은 창은 pane 폭마다 세로 살
export const paneCount = (w: number) => Math.max(1, Math.round(w / CAFE_WINDOW.pane))

// 벽(동서로 길면 x 를, 남북으로 길면 z 를 따라)에 구멍을 냅니다: 구멍 사이 조각 + 구멍마다 아래(창턱 밑)·위 조각
export function wallPieces(wall: Box, height: number, holes: Hole[]): WallPiece[] {
  const alongX = wall.w >= wall.d
  const piece = (a0: number, a1: number, y0: number, y1: number): WallPiece =>
    alongX
      ? { x: (a0 + a1) / 2, y: (y0 + y1) / 2, z: wall.z, w: a1 - a0, h: y1 - y0, d: wall.d }
      : { x: wall.x, y: (y0 + y1) / 2, z: (a0 + a1) / 2, w: wall.w, h: y1 - y0, d: a1 - a0 }
  const start = alongX ? wall.x - wall.w / 2 : wall.z - wall.d / 2
  const end = alongX ? wall.x + wall.w / 2 : wall.z + wall.d / 2
  const pieces: WallPiece[] = []
  let a = start
  for (const h of [...holes].sort((p, q) => p.a0 - q.a0)) {
    if (h.a0 > a) pieces.push(piece(a, h.a0, 0, height))
    if (h.y0 > 0) pieces.push(piece(h.a0, h.a1, 0, h.y0))
    if (h.y1 < height) pieces.push(piece(h.a0, h.a1, h.y1, height))
    a = h.a1
  }
  if (end > a) pieces.push(piece(a, end, 0, height))
  return pieces
}
