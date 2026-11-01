// 지점 배치로 카페 통창 정보 찾기 (월드 배치에서 그 지점 건물을 찾아 cafeWindowLogic 에 넘김)
import type { Box, BranchLayout } from '../space/layout'
import { cafeWindows, wallPieces, windowHoles } from './cafeWindowLogic'
import type { WallPiece, WindowWall } from './cafeWindowLogic'
import { buildingOf } from './worldLogic'
import { computedOf, worldOfBranch } from './worldConfig'
import { BRANCH_LAYOUTS } from '../space/branches'

type Layout = Pick<BranchLayout, 'id' | 'size' | 'door' | 'theme' | 'meetingDoor' | 'elevator'>

// 위층은 출입문이 없어(계단으로만 오감) 같은 건물 1층 출입문 자리를 빌려 씁니다.
// 창 밖 거리를 건물 위치에 맞추고 출입문 벽(앞면)을 찾는 기준으로만 쓰고, 문을 그리지는 않습니다.
export function windowLayoutOf<T extends Layout>(layout: T): T {
  if (layout.door) return layout
  const ground = buildingOf(computedOf(worldOfBranch(layout.id)).placed, layout.id)?.floors[0]
  const door = ground ? BRANCH_LAYOUTS[ground.slug]?.door : undefined
  return door ? { ...layout, door } : layout
}

export function cafeWindowsOf(raw: Layout) {
  const layout = windowLayoutOf(raw)
  return cafeWindows(buildingOf(computedOf(worldOfBranch(layout.id)).placed, layout.id), layout)
}

// 지점 벽 하나를 그릴 조각들. 통창이 난 벽(출입문 벽·옆벽)이면 창 구멍을 낸 조각, 아니면 null (원래대로 상자 하나)
export function cafeWallPieces(raw: Layout, wall: Box, height: number): WallPiece[] | null {
  const layout = windowLayoutOf(raw)
  const windows = cafeWindowsOf(layout)
  if (!windows || !layout.door) return null
  const half = layout.size.w / 2
  const which: WindowWall | null =
    wall.w > wall.d ? (Math.abs(wall.z - layout.door.z) < 0.3 ? 'front' : null) : Math.abs(wall.x + half) < 0.3 ? 'west' : Math.abs(wall.x - half) < 0.3 ? 'east' : null
  if (!which) return null
  const holes = windowHoles(windows.spots, which)
  return holes.length > 0 ? wallPieces(wall, height, holes) : null
}
