// 전체 지도 배치 계산 (#300, #315). React·화면과 무관한 순수 로직입니다.
//
// 지도는 3D 광장과 같은 좌표를 씁니다. 건물 자리·입구 방향·회의실 별관은 광장 배치(world.json)를
// worldLogic.placeBuildings 로 계산한 값 그대로라, 지도와 광장의 모양이 같습니다.
//   - 광장(가운데 돌바닥)이 접속 장소 'lobby'(화면 이름 "광장") 입니다. 광장 좌표가 곧 지도 좌표입니다.
//   - 지점 건물은 입구 방향만큼 90도 단위로 돌아가 있습니다(rot). 겉모습(10×8m)이 실내(16×16m)보다 작아서,
//     지점 "안" 좌표(책상·좌석·내 위치)는 같은 비율로 줄여(scale) 건물 안에 넣고 rot 만큼 돌려 옮깁니다.
//   - 회의실은 광장에 별관이 없으므로 지도에도 따로 그리지 않습니다. 회의실에 있는 사람은 그 지점 건물 가운데로 봅니다(scale 0).
//   - 여러 층 건물의 위층 지점(floors)은 그 건물과 같은 자리에 겹쳐 놓습니다. 지도는 1층 안만 그리고, 위층 인원은 이름표로 띄웁니다.
// 그래서 지점 JSON 을 추가하고 world.json 에 건물 한 줄만 넣으면 코드 수정 없이 지도에 나타납니다.
// 단위는 m 이고, 지도의 위쪽이 -Z(북쪽)입니다. 3D 의 위에서 보기와 같은 방향입니다.
import type { Box, BranchLayout } from '../space/layout'
import { LOBBY_PLACE } from '../realtime/online'
import { MEETING_PLACE_PREFIX } from '../meeting/meetingLogic'
import { normalizeAngle, placeBuildings, rotate } from '../world/worldLogic'
import type { PlazaLayout } from '../world/worldLogic'

export type Rect = { x: number; z: number; w: number; d: number } // 가운데 좌표와 크기
export type Point = { x: number; z: number }

// 지도에 놓인 공간 하나. rect 는 지도 좌표, rot 은 공간 안 좌표를 지도로 옮길 때 돌리는 각도(90도 단위 라디안),
// scale 은 공간 안 좌표를 줄이는 배율 (광장 1, 지점은 건물 겉모습에 맞춘 값, 회의실 0 = 건물 가운데)
export type MapPlace = { place: string; name: string; rect: Rect; rot: number; scale: number }
// 위층 지점 하나 (level 2부터). 자리·배율은 건물과 같고, 회의실은 건물 가운데
export type MapFloor = MapPlace & { level: number; meeting: MapPlace | null }
// roof: 지붕 색 (3D 광장의 건물 지붕과 같은 world.json 값), floors: 위층 지점 (없으면 빈 배열)
export type MapBranch = MapPlace & { slug: string; layout: BranchLayout; index: number; roof: string; meeting: MapPlace | null; floors: MapFloor[] }

export type WorldLayout = {
  lobby: MapPlace // 광장 (접속 장소 이름은 lobby 그대로)
  branches: MapBranch[]
  paths: Rect[] // 광장 → 건물 입구 돌길
  fountain?: { x: number; z: number; r: number } // 캠퍼스에는 없음
  trees: Point[]
  bounds: Rect // 지도 전체 = 월드 전체
}

// 회의실이 있는 지점만. 접속 상태의 "있는 곳"과 같은 이름 (meeting:byeol). 광장에 별관이 없어 건물 가운데(scale 0)
const meetingOf = (layout: BranchLayout, slug: string, rect: Rect, rot: number): MapPlace | null =>
  layout.meetingDoor ? { place: MEETING_PLACE_PREFIX + slug, name: '회의실', rect, rot, scale: 0 } : null

export function buildWorld(plaza: PlazaLayout, layouts: Record<string, BranchLayout>): WorldLayout {
  const branches: MapBranch[] = placeBuildings(plaza, layouts).map((b, index) => ({
    place: b.slug,
    slug: b.slug,
    name: b.name,
    layout: layouts[b.slug],
    index,
    roof: b.spec.roof,
    rect: b.rect,
    rot: b.angle,
    scale: b.scale,
    meeting: meetingOf(layouts[b.slug], b.slug, b.rect, b.angle),
    floors: b.floors.slice(1).map((f) => ({
      place: f.slug,
      name: f.name,
      level: f.level,
      rect: b.rect,
      rot: b.angle,
      scale: b.scale,
      meeting: meetingOf(layouts[f.slug], f.slug, b.rect, b.angle),
    })),
  }))
  return {
    lobby: { place: LOBBY_PLACE, name: '광장', rect: { x: 0, z: 0, w: plaza.plaza.w, d: plaza.plaza.d }, rot: 0, scale: 1 },
    branches,
    paths: plaza.paths,
    fountain: plaza.fountain,
    trees: plaza.trees,
    bounds: { x: 0, z: 0, w: plaza.size.w, d: plaza.size.d },
  }
}

// 공간 안 좌표(그 장면의 x, z, 바라보는 방향)를 지도 좌표로. 광장은 rot 0, scale 1, 가운데 (0, 0) 이라 그대로입니다.
export function toMap(p: MapPlace, x: number, z: number, heading: number): { x: number; z: number; heading: number } {
  const r = rotate(x * p.scale, z * p.scale, p.rot)
  return { x: p.rect.x + r.x, z: p.rect.z + r.z, heading: normalizeAngle(heading + p.rot) }
}

// 접속 상태의 "있는 곳"으로 지도의 공간을 찾습니다. 지도에 없는 곳(기록 페이지 등)이면 null
export function findPlace(world: WorldLayout, place: string): MapPlace | null {
  if (place === world.lobby.place) return world.lobby
  for (const b of world.branches) {
    if (b.place === place) return b
    if (b.meeting?.place === place) return b.meeting
    for (const f of b.floors) {
      if (f.place === place) return f
      if (f.meeting?.place === place) return f.meeting
    }
  }
  return null
}

// 있는 곳별 인원
export function countByPlace(places: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(p, (counts.get(p) ?? 0) + 1)
  return counts
}

// 상자(가운데·크기)를 지도 좌표로 옮깁니다. 크기도 scale 만큼 줄이고, 동·서로 돌린 공간(90도)은 w·d 를 바꿉니다.
export function boxToMap(p: MapPlace, b: Box): Rect {
  const c = toMap(p, b.x, b.z, 0)
  const w = b.w * p.scale
  const d = b.d * p.scale
  return Math.abs(Math.sin(p.rot)) > 0.5 ? { x: c.x, z: c.z, w: d, d: w } : { x: c.x, z: c.z, w, d }
}
