// 전체 지도 배치 계산 (#300). React·화면과 무관한 순수 로직입니다.
//
// 로비·지점·회의실은 3D 에서는 서로 다른 장면이라 "세상 좌표"가 따로 없습니다. 그래서 지도에서만 쓰는 좌표를 만듭니다.
//   - 로비를 가운데(0, 0)에 둔 광장으로 놓습니다.
//   - 로비 북쪽 벽의 문(lobby.json 의 doors)마다 그 지점을 문 바로 위(북쪽)에 건물로 놓고 길로 잇습니다.
//     지점이 넓어 서로 겹치면 옆으로 벌려 놓고, 길이 꺾여서 이어집니다.
//   - 회의실은 지점 동쪽 벽의 회의실 문(meetingDoor) 바깥에 붙은 방으로 놓습니다. 회의실의 문(남쪽)이 지점 쪽(서쪽)을 보도록 돌립니다.
// 그래서 지점 JSON 을 추가하고 로비에 문 한 줄만 넣으면 코드 수정 없이 지도에 나타납니다.
// 단위는 m 이고, 지도의 위쪽이 -Z(북쪽)입니다. 3D 의 위에서 보기와 같은 방향입니다.
import type { Box, BranchLayout } from '../space/layout'
import { LOBBY_PLACE } from '../realtime/online'
import { MEETING_PLACE_PREFIX } from '../meeting/meetingLogic'

export const ROAD_LENGTH = 6 // 로비 북쪽 벽에서 지점 남쪽 벽까지 (길이 지나가는 거리)
export const BUILDING_GAP = 3 // 이웃한 지점(회의실 포함) 사이 최소 간격
export const MARGIN = 4 // 지도 가장자리 여백 (나무가 들어가는 자리)
const TREE_STEP = 2.2 // 나무 후보를 놓는 격자 간격
const TREE_CLEARANCE = 1.6 // 건물·길에서 이만큼 떨어진 곳에만 나무

export type Rect = { x: number; z: number; w: number; d: number } // 가운데 좌표와 크기
export type Point = { x: number; z: number }

// 로비 배치 (lobby.json 모양)
export type LobbyLayout = {
  size: { w: number; d: number }
  doors: { no: number; slug: string; label: string; x: number; z: number; w: number; d: number }[]
}

// 지도에 놓인 공간 하나. rect 는 지도 좌표, turned 는 공간 안 좌표를 지도로 옮길 때 90도 돌리는지(회의실)
export type MapPlace = { place: string; name: string; rect: Rect; turned: boolean }
export type MapBranch = MapPlace & { slug: string; layout: BranchLayout; index: number; meeting: MapPlace | null }

export type WorldLayout = {
  lobby: MapPlace
  branches: MapBranch[]
  roads: Point[][] // 로비 문 → 지점 문 (꺾인 선)
  trees: Point[]
  bounds: Rect // 지도 전체 (여백 포함)
}

export function buildWorld(lobby: LobbyLayout, layouts: Record<string, BranchLayout>, meetingSize: { w: number; d: number }): WorldLayout {
  const top = -lobby.size.d / 2 // 로비 북쪽 벽
  const branchBottom = top - ROAD_LENGTH // 지점 남쪽 벽이 놓이는 줄

  // 왼쪽 문부터 차례로 놓습니다. 지점 출입문(door)이 로비 문과 같은 x 에 오는 것이 이상적인 자리입니다.
  const doors = lobby.doors.filter((d) => layouts[d.slug]).sort((a, b) => a.x - b.x)
  const plan = doors.map((door) => {
    const layout = layouts[door.slug]
    const exitX = layout.door?.x ?? 0
    const md = layout.meetingDoor
    const left = -layout.size.w / 2 // 지점 가운데 기준 왼쪽 끝
    const right = md ? Math.max(layout.size.w / 2, md.x + md.w / 2 + meetingSize.d) : layout.size.w / 2 // 회의실까지 포함한 오른쪽 끝
    return { door, layout, exitX, left, right, ideal: door.x - exitX }
  })
  const centers: number[] = []
  plan.forEach((p, i) => {
    const prev = i > 0 ? centers[i - 1] + plan[i - 1].right + BUILDING_GAP : -Infinity
    centers.push(Math.max(p.ideal, prev - p.left))
  })
  // 벌어진 만큼 전체를 다시 가운데로 (간격은 그대로)
  const shift = plan.length ? plan.reduce((s, p, i) => s + (p.ideal - centers[i]), 0) / plan.length : 0

  const branches: MapBranch[] = []
  const roads: Point[][] = []
  plan.forEach((p, i) => {
    const { layout, door } = p
    const x = centers[i] + shift
    const z = branchBottom - layout.size.d / 2
    const md = layout.meetingDoor
    // 회의실: 서쪽 가운데가 회의실 문(지점 동쪽 벽 바깥)에 닿게 둡니다. 돌려 놓으므로 지도에서는 w·d 가 바뀝니다.
    const meeting: MapPlace | null = md
      ? {
          place: MEETING_PLACE_PREFIX + door.slug, // 접속 상태의 "있는 곳"과 같은 이름 (meeting:byeol)
          name: '회의실',
          rect: { x: x + md.x + md.w / 2 + meetingSize.d / 2, z: z + md.z, w: meetingSize.d, d: meetingSize.w },
          turned: true,
        }
      : null
    branches.push({ place: door.slug, slug: door.slug, name: layout.name, layout, index: i, rect: { x, z, w: layout.size.w, d: layout.size.d }, turned: false, meeting })

    // 길: 로비 문에서 북쪽으로 반쯤 → 옆으로 → 지점 출입문까지
    const midZ = top - ROAD_LENGTH / 2
    const exitX = x + p.exitX
    roads.push([{ x: door.x, z: top }, { x: door.x, z: midZ }, { x: exitX, z: midZ }, { x: exitX, z: branchBottom }])
  })

  const lobbyPlace: MapPlace = { place: LOBBY_PLACE, name: '로비', rect: { x: 0, z: 0, w: lobby.size.w, d: lobby.size.d }, turned: false }
  const rects = [lobbyPlace.rect, ...branches.flatMap((b) => (b.meeting ? [b.rect, b.meeting.rect] : [b.rect]))]
  const bounds = grow(union(rects), MARGIN)
  return { lobby: lobbyPlace, branches, roads, trees: plantTrees(bounds, rects, roads), bounds }
}

// 공간 안 좌표(그 장면의 x, z, 바라보는 방향)를 지도 좌표로. 회의실은 문(+Z, 남쪽)이 서쪽을 보도록 90도 돌려 놓았습니다.
export function toMap(p: MapPlace, x: number, z: number, heading: number): { x: number; z: number; heading: number } {
  if (!p.turned) return { x: p.rect.x + x, z: p.rect.z + z, heading }
  return { x: p.rect.x - z, z: p.rect.z + x, heading: heading - Math.PI / 2 }
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

// 상자(가운데·크기)를 지도 좌표로 옮깁니다. 회의실처럼 돌린 공간은 w·d 를 바꿉니다.
export function boxToMap(p: MapPlace, b: Box): Rect {
  const c = toMap(p, b.x, b.z, 0)
  return p.turned ? { x: c.x, z: c.z, w: b.d, d: b.w } : { x: c.x, z: c.z, w: b.w, d: b.d }
}

function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x - r.w / 2)), x1 = Math.max(...rects.map((r) => r.x + r.w / 2))
  const z0 = Math.min(...rects.map((r) => r.z - r.d / 2)), z1 = Math.max(...rects.map((r) => r.z + r.d / 2))
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
}

const grow = (r: Rect, m: number): Rect => ({ ...r, w: r.w + m * 2, d: r.d + m * 2 })

const inside = (p: Point, r: Rect, pad: number) => Math.abs(p.x - r.x) < r.w / 2 + pad && Math.abs(p.z - r.z) < r.d / 2 + pad

// 점에서 선분까지 거리
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

// 빈 땅에 나무를 심습니다(장식). 격자 자리마다 좌표로 정해지는 의사 난수를 써서 열 때마다 같은 자리에 납니다.
function plantTrees(bounds: Rect, rects: Rect[], roads: Point[][]): Point[] {
  const trees: Point[] = []
  const x0 = bounds.x - bounds.w / 2 + TREE_STEP / 2, z0 = bounds.z - bounds.d / 2 + TREE_STEP / 2
  for (let gx = x0; gx < bounds.x + bounds.w / 2; gx += TREE_STEP) {
    for (let gz = z0; gz < bounds.z + bounds.d / 2; gz += TREE_STEP) {
      const r = noise(gx, gz)
      if (r > 0.45) continue
      const p = { x: gx + (noise(gz, gx) - 0.5) * TREE_STEP * 0.6, z: gz + (noise(gx + 7, gz) - 0.5) * TREE_STEP * 0.6 }
      if (rects.some((rect) => inside(p, rect, TREE_CLEARANCE))) continue
      if (roads.some((road) => road.slice(1).some((b, i) => distToSegment(p, road[i], b) < TREE_CLEARANCE + 0.5))) continue
      trees.push(p)
    }
  }
  return trees
}

// 좌표 → 0~1 (같은 좌표면 늘 같은 값)
function noise(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return s - Math.floor(s)
}
