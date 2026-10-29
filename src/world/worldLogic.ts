// 광장 월드 배치 계산 (#315). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사 — 타입 말고는 다른 파일을 import 하지 않음)
//
// 배치는 world.json 에 있고, 여기서는 그 값으로 건물 자리·입구·회의실 별관·부딪히는 상자·방향을 계산합니다.
// 3D 광장(WorldScene)과 전체 지도(mapLogic)가 같은 계산을 써서 둘의 모양이 같습니다.
//
// ── 좌표와 방향 ─────────────────────────────────────────────────────
//   단위 m, 위쪽(-Z)이 북쪽. 방향(heading)은 라디안, 0이 +Z(남쪽)이고 방향 벡터는 (sin h, cos h) 입니다. (지점 화면과 같음)
//   건물의 입구 방향은 각도 대신 "south" 처럼 적고 90도 단위로만 돌립니다. (지도 좌표 변환이 단순하고 JSON 을 바로 읽을 수 있음)
//     south 0, west -π/2, north π, east π/2
//
// ── 실내와 광장 ─────────────────────────────────────────────────────
//   지점 실내는 입구(door)가 늘 남쪽 벽(z = +size.d/2)에 있습니다. 건물을 입구 방향만큼 돌려 광장에 놓습니다.
//     광장 좌표 = 건물 가운데 + rotate(실내 좌표, 입구 각도)
//     광장 방향 = 실내 방향 + 입구 각도
//   들어갈 때는 보던 방향에서 입구 각도를 빼서 넘기고(toBranchHeading), 나올 때는 더합니다(toWorldHeading).
//   예: 동쪽 건물(입구가 서쪽, -π/2)에 동쪽(π/2)을 보며 들어가면 실내에서는 π(북쪽, 안쪽)를 봅니다.
import type { Box, BranchLayout } from '../space/layout'

export type Facing = 'south' | 'north' | 'east' | 'west'
export type Point = { x: number; z: number }

// world.json 의 건물 한 채. slug 는 지점 JSON 이름(BRANCH_LAYOUTS 키), x·z 는 건물 가운데
export type BuildingSpec = { slug: string; x: number; z: number; facing: Facing; wall: string; roof: string }

// world.json 모양
export type PlazaLayout = {
  size: { w: number; d: number } // 월드 전체 (가운데 0, 0)
  plaza: { w: number; d: number } // 가운데 돌바닥
  spawn: { x: number; z: number; heading: number } // 주소로 바로 들어오면 서는 자리
  fountain: { x: number; z: number; r: number }
  buildings: BuildingSpec[]
  paths: Box[] // 광장 → 건물 입구 돌길
  trees: Point[]
  benches: (Point & { facing: Facing })[] // facing: 앉은 사람이 보는 쪽
  lamps: Point[]
}

// 건물을 놓는 데 필요한 지점 정보
export type BranchShape = Pick<BranchLayout, 'name' | 'size' | 'door' | 'meetingDoor'>

// 광장에 놓인 건물
export type PlacedBuilding = {
  no: number // 1부터. Player 의 "앉는 자리" 번호로 씁니다 (입구 앞에서 E)
  slug: string
  name: string
  spec: BuildingSpec
  angle: number // 입구 방향 각도
  rect: Box // 광장 좌표, 돌린 뒤의 바닥 사각형
  door: Box // 광장 좌표, 입구 문 상자
  entry: { no: number; x: number; z: number; rot: number } // 입구 앞 자리. rot 은 입구를 바라보는 방향
  arrive: Point // 지점에서 나왔을 때 서는 자리
  annex: (Box & { angle: number }) | null // 회의실 별관 바닥 사각형. angle 은 별관 문이 보는 방향 (지점 쪽)
}

export const DOOR_GAP = 1.1 // 입구 바깥 이만큼 앞이 입장 자리 (지금 로비와 같음)
export const ARRIVE_GAP = 2.1 // 지점에서 나오면 입구 바깥 이만큼 앞에 섭니다. 입장 자리보다 멀어 나오자마자 "입장" 안내가 뜨지 않음
export const FENCE_T = 0.3 // 가장자리 울타리 두께
export const TRUNK = 0.5 // 나무 줄기 부딪힘 상자 한 변
export const LAMP_POST = 0.3 // 가로등 기둥 부딪힘 상자 한 변
export const BENCH = { w: 1.6, d: 0.6 } // 벤치 부딪힘 상자 (남·북을 볼 때. 동·서를 보면 w·d 가 바뀜)

const FACING_ANGLE: Record<Facing, number> = { south: 0, west: -Math.PI / 2, north: Math.PI, east: Math.PI / 2 }
const TWO_PI = Math.PI * 2

// 각도를 (-π, π] 로 맞춥니다. 더하고 빼다 보면 -3π/2 처럼 범위를 벗어나 비교·전송이 흔들리기 때문입니다.
export function normalizeAngle(h: number): number {
  const a = ((((h + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI // [-π, π)
  return a <= -Math.PI ? Math.PI : a
}

export const facingAngle = (f: Facing) => FACING_ANGLE[f]

// 동·서를 보면 가로·세로가 바뀝니다.
const sideways = (f: Facing) => f === 'east' || f === 'west'

// (x, z) 를 angle 만큼 돌립니다. 방향(heading)에 angle 을 더한 것과 같은 회전입니다.
export function rotate(x: number, z: number, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: x * c + z * s, z: z * c - x * s }
}

export const toBranchHeading = (worldHeading: number, f: Facing) => normalizeAngle(worldHeading - facingAngle(f))
export const toWorldHeading = (branchHeading: number, f: Facing) => normalizeAngle(branchHeading + facingAngle(f))

// 실내 좌표의 상자를 광장 좌표로 옮깁니다.
function boxToWorld(spec: BuildingSpec, b: Box): Box {
  const c = rotate(b.x, b.z, facingAngle(spec.facing))
  const [w, d] = sideways(spec.facing) ? [b.d, b.w] : [b.w, b.d]
  return { x: spec.x + c.x, z: spec.z + c.z, w, d }
}

function pointToWorld(spec: BuildingSpec, x: number, z: number): Point {
  const c = rotate(x, z, facingAngle(spec.facing))
  return { x: spec.x + c.x, z: spec.z + c.z }
}

// world.json 의 건물을 광장에 놓습니다. 지점 JSON 이 없는 건물은 건너뛰고 warn 으로 알립니다.
export function placeBuildings(
  plaza: PlazaLayout,
  layouts: Record<string, BranchShape>,
  meetingSize: { w: number; d: number },
  warn?: (msg: string) => void,
): PlacedBuilding[] {
  const placed: PlacedBuilding[] = []
  for (const spec of plaza.buildings) {
    const layout = layouts[spec.slug]
    if (!layout) {
      warn?.(`광장 건물 ${spec.slug}: 지점 배치(src/space/branches)에 없어 그리지 않습니다.`)
      continue
    }
    const no = placed.length + 1
    const angle = facingAngle(spec.facing)
    const front = layout.size.d / 2 // 입구 벽 (실내 남쪽)
    const doorX = layout.door?.x ?? 0
    const doorBox = layout.door ?? { x: 0, z: front, w: 1.6, d: 0.3 }
    const entry = pointToWorld(spec, doorX, front + DOOR_GAP)
    const md = layout.meetingDoor
    placed.push({
      no,
      slug: spec.slug,
      name: layout.name,
      spec,
      angle,
      rect: boxToWorld(spec, { x: 0, z: 0, w: layout.size.w, d: layout.size.d }),
      door: boxToWorld(spec, doorBox),
      entry: { no, ...entry, rot: normalizeAngle(angle + Math.PI) },
      arrive: pointToWorld(spec, doorX, front + ARRIVE_GAP),
      // 회의실: 지점 동쪽 벽의 회의실 문 바깥에 붙은 방 (전체 지도가 지금 그리는 자리와 같음)
      annex: md
        ? {
            ...boxToWorld(spec, { x: md.x + md.w / 2 + meetingSize.d / 2, z: md.z, w: meetingSize.d, d: meetingSize.w }),
            angle: normalizeAngle(angle - Math.PI / 2),
          }
        : null,
    })
  }
  return placed
}

// 광장에서 부딪히는 상자: 울타리, 건물, 별관, 분수, 나무 줄기, 가로등 기둥, 벤치
export function plazaObstacles(plaza: PlazaLayout, placed: PlacedBuilding[]): Box[] {
  const { w, d } = plaza.size
  const fence: Box[] = [
    { x: 0, z: -(d / 2 - FENCE_T / 2), w, d: FENCE_T },
    { x: 0, z: d / 2 - FENCE_T / 2, w, d: FENCE_T },
    { x: -(w / 2 - FENCE_T / 2), z: 0, w: FENCE_T, d },
    { x: w / 2 - FENCE_T / 2, z: 0, w: FENCE_T, d },
  ]
  const f = plaza.fountain
  return [
    ...fence,
    ...placed.flatMap((b) => (b.annex ? [b.rect, b.annex] : [b.rect])),
    { x: f.x, z: f.z, w: f.r * 2, d: f.r * 2 },
    ...plaza.trees.map((t) => ({ x: t.x, z: t.z, w: TRUNK, d: TRUNK })),
    ...plaza.lamps.map((l) => ({ x: l.x, z: l.z, w: LAMP_POST, d: LAMP_POST })),
    ...plaza.benches.map((b) =>
      sideways(b.facing) ? { x: b.x, z: b.z, w: BENCH.d, d: BENCH.w } : { x: b.x, z: b.z, w: BENCH.w, d: BENCH.d },
    ),
  ]
}

// 광장에 들어올 때 설 자리와 방향.
// 지점에서 나왔으면(from) 그 건물 입구 앞에 건물을 등지고 섭니다. heading 은 실내에서 보던 방향(없으면 0, 출입문 쪽).
// 광장에 없는 지점이거나 주소로 바로 들어오면 시작 위치에 섭니다.
export function arrivalOf(plaza: PlazaLayout, placed: PlacedBuilding[], from?: string, heading?: number): { spawn: Point; heading: number } {
  const b = from === undefined ? undefined : placed.find((p) => p.slug === from)
  // world.json 의 시작 방향(3.1416 등)도 범위를 맞춰 다른 방향 값들과 같게 둡니다.
  if (!b) return { spawn: { x: plaza.spawn.x, z: plaza.spawn.z }, heading: normalizeAngle(plaza.spawn.heading) }
  return { spawn: b.arrive, heading: toWorldHeading(heading ?? 0, b.spec.facing) }
}
