// 전체 지도 배치 계산 (#300, #315). React·화면과 무관한 순수 로직입니다.
//
// 지도는 3D 광장과 같은 좌표를 씁니다. 건물 자리·입구 방향·회의실 별관은 광장 배치(world.json)를
// worldLogic.placeBuildings 로 계산한 값 그대로라, 지도와 광장의 모양이 같습니다.
//   - 광장(가운데 돌바닥)이 접속 장소 'lobby'(화면 이름 "광장") 입니다. 광장 좌표가 곧 지도 좌표입니다.
//   - 지점 건물은 입구 방향만큼 90도 단위로 돌아가 있고(rot), 회의실은 그 지점 동쪽 벽 바깥에 붙은 별관입니다.
//   - 지점·회의실 "안" 좌표(책상·좌석·내 위치)는 그 공간 가운데에서 rot 만큼 돌려 지도로 옮깁니다.
// 그래서 지점 JSON 을 추가하고 world.json 에 건물 한 줄만 넣으면 코드 수정 없이 지도에 나타납니다.
// 단위는 m 이고, 지도의 위쪽이 -Z(북쪽)입니다. 3D 의 위에서 보기와 같은 방향입니다.
import type { Box, BranchLayout } from '../space/layout'
import { LOBBY_PLACE } from '../realtime/online'
import { MEETING_PLACE_PREFIX } from '../meeting/meetingLogic'
import { normalizeAngle, placeBuildings, rotate } from '../world/worldLogic'
import type { PlazaLayout } from '../world/worldLogic'

export type Rect = { x: number; z: number; w: number; d: number } // 가운데 좌표와 크기
export type Point = { x: number; z: number }

// 지도에 놓인 공간 하나. rect 는 지도 좌표, rot 은 공간 안 좌표를 지도로 옮길 때 돌리는 각도(90도 단위 라디안)
export type MapPlace = { place: string; name: string; rect: Rect; rot: number }
// roof: 지붕 색 (3D 광장의 건물 지붕과 같은 world.json 값)
export type MapBranch = MapPlace & { slug: string; layout: BranchLayout; index: number; roof: string; meeting: MapPlace | null }

export type WorldLayout = {
  lobby: MapPlace // 광장 (접속 장소 이름은 lobby 그대로)
  branches: MapBranch[]
  paths: Rect[] // 광장 → 건물 입구 돌길
  fountain: { x: number; z: number; r: number }
  trees: Point[]
  bounds: Rect // 지도 전체 = 월드 전체
}

export function buildWorld(plaza: PlazaLayout, layouts: Record<string, BranchLayout>, meetingSize: { w: number; d: number }): WorldLayout {
  const branches: MapBranch[] = placeBuildings(plaza, layouts, meetingSize).map((b, index) => ({
    place: b.slug,
    slug: b.slug,
    name: b.name,
    layout: layouts[b.slug],
    index,
    roof: b.spec.roof,
    rect: b.rect,
    rot: b.angle,
    meeting: b.annex
      ? {
          place: MEETING_PLACE_PREFIX + b.slug, // 접속 상태의 "있는 곳"과 같은 이름 (meeting:byeol)
          name: '회의실',
          rect: { x: b.annex.x, z: b.annex.z, w: b.annex.w, d: b.annex.d },
          rot: b.annex.angle,
        }
      : null,
  }))
  return {
    lobby: { place: LOBBY_PLACE, name: '광장', rect: { x: 0, z: 0, w: plaza.plaza.w, d: plaza.plaza.d }, rot: 0 },
    branches,
    paths: plaza.paths,
    fountain: plaza.fountain,
    trees: plaza.trees,
    bounds: { x: 0, z: 0, w: plaza.size.w, d: plaza.size.d },
  }
}

// 공간 안 좌표(그 장면의 x, z, 바라보는 방향)를 지도 좌표로. 광장은 rot 0, 가운데 (0, 0) 이라 그대로입니다.
export function toMap(p: MapPlace, x: number, z: number, heading: number): { x: number; z: number; heading: number } {
  const r = rotate(x, z, p.rot)
  return { x: p.rect.x + r.x, z: p.rect.z + r.z, heading: normalizeAngle(heading + p.rot) }
}

// 접속 상태의 "있는 곳"으로 지도의 공간을 찾습니다. 지도에 없는 곳(기록 페이지 등)이면 null
export function findPlace(world: WorldLayout, place: string): MapPlace | null {
  if (place === world.lobby.place) return world.lobby
  for (const b of world.branches) {
    if (b.place === place) return b
    if (b.meeting?.place === place) return b.meeting
  }
  return null
}

// 있는 곳별 인원
export function countByPlace(places: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of places) counts.set(p, (counts.get(p) ?? 0) + 1)
  return counts
}

// 상자(가운데·크기)를 지도 좌표로 옮깁니다. 동·서로 돌린 공간(90도)은 w·d 를 바꿉니다.
export function boxToMap(p: MapPlace, b: Box): Rect {
  const c = toMap(p, b.x, b.z, 0)
  return Math.abs(Math.sin(p.rot)) > 0.5 ? { x: c.x, z: c.z, w: b.d, d: b.w } : { x: c.x, z: c.z, w: b.w, d: b.d }
}
