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
// ── 건물 겉모습과 실내 ───────────────────────────────────────────────
//   광장의 건물은 실내(16×16m)보다 작은 겉모습(world.json 의 w·d, 지금 10×8m)입니다. 들어가면 화면이 바뀌므로
//   밖에서 본 크기가 실내와 같을 필요가 없고, 그래야 광장이 작아져 걷기 편합니다. (2026-10-30 사용자 결정)
//   회의실은 지점 안의 문으로만 가므로 광장에 별관을 두지 않습니다.
//   한 건물에 지점을 여러 층으로 쌓을 수 있습니다(floors). 입구는 하나이고 1층으로만 들어갑니다. 위층은 지점 안의 엘리베이터로 갑니다
//   (처음부터 위층으로 가면 엘리베이터를 쓸 일이 없어서, 2026-10-30 사용자 결정).
//   어느 층에서 나와도 그 건물 입구 앞에 섭니다. 광장 자리를 더 쓰지 않고 지점을 늘리려는 것입니다. (2026-10-30 사용자 결정)
//   건물 모양은 입구가 +Z 쪽(남쪽)이고, 입구 방향만큼 돌려 광장에 놓습니다.
//     광장 좌표 = 건물 가운데 + rotate(건물 기준 좌표, 입구 각도)
//     광장 방향 = 실내 방향 + 입구 각도
//   들어갈 때는 보던 방향에서 입구 각도를 빼서 넘기고(toBranchHeading), 나올 때는 더합니다(toWorldHeading).
//   예: 동쪽 건물(입구가 서쪽, -π/2)에 동쪽(π/2)을 보며 들어가면 실내에서는 π(북쪽, 안쪽)를 봅니다.
//
// ── 월드 사이 정문과 쉬는 자리 (캠빛 대학교) ─────────────────────────────
//   바깥 공간(월드)이 광장과 캠퍼스 둘입니다. 정문(gates)은 다른 월드로 가는 문이고, 건물 입구처럼
//   문 앞 입장 자리에서 E 를 누르면 넘어갑니다. 넘어가면 그쪽 월드에서 "이쪽으로 오는 정문" 앞에 문을 등지고 섭니다.
//   쉬는 자리(rests)는 캠퍼스 쿼드의 돗자리·빈백. 앉아도 기록 없이 쉬기만 합니다.
//   Player 의 "앉는 자리" 번호가 건물 입구(1~)·정문(GATE_NO_BASE~)·쉬는 자리(REST_NO_BASE~)로 나뉩니다(spotKindOf).
import type { Box, BranchLayout, Spot } from '../space/layout'

export type Facing = 'south' | 'north' | 'east' | 'west'
export type Point = { x: number; z: number }

// world.json 의 건물 한 채. slug 는 지점 JSON 이름(BRANCH_LAYOUTS 키), x·z 는 건물 가운데,
// w·d 는 겉모습 폭(입구 면)·깊이 (실내 크기와 따로)
// floors: 2층부터 위로 쌓는 지점. window 는 그 층 창 색(지점 분위기). 1층은 slug 의 지점입니다.
export type FloorSpec = { slug: string; window?: string }
export type BuildingSpec = { slug: string; x: number; z: number; w: number; d: number; facing: Facing; wall: string; roof: string; floors?: FloorSpec[] }

// world.json 모양
// 바깥 공간(월드) 이름. 광장(첫 화면)과 캠빛 대학교 캠퍼스
export type WorldId = 'plaza' | 'campus'
// 다른 월드로 가는 정문. x·z 문 가운데, w 문 폭(두 기둥 사이), facing 문 앞면(입장 쪽)이 보는 방향, label 현판 글자
export type GateSpec = { to: WorldId; x: number; z: number; w: number; facing: Facing; label: string }
// 쉬는 자리(돗자리·빈백). rot: 앉은 사람이 보는 방향
export type RestSpec = { x: number; z: number; rot: number; kind: 'mat' | 'beanbag' }

export type PlazaLayout = {
  size: { w: number; d: number } // 월드 전체 (가운데 0, 0)
  plaza: { w: number; d: number } // 가운데 바닥 (광장 돌바닥, 캠퍼스 쿼드)
  ground?: 'stone' | 'lawn' // 가운데 바닥 모양. 없으면 돌바닥(광장), lawn 이면 잔디 쿼드(캠퍼스)
  title?: string // 이 월드의 이름 (안내·지도). 없으면 "광장"
  spawn: { x: number; z: number; heading: number } // 주소로 바로 들어오면 서는 자리
  fountain?: { x: number; z: number; r: number } // 가운데 분수 (캠퍼스에는 없음)
  gates?: GateSpec[]
  rests?: RestSpec[]
  buildings: BuildingSpec[]
  paths: Box[] // 광장 → 건물 입구 돌길
  trees: Point[]
  benches: (Point & { facing: Facing })[] // facing: 앉은 사람이 보는 쪽
  lamps: (Point & { light?: boolean })[] // light: 밤에 둘레를 비추는 점광원을 단 가로등 (#316)
}

// 건물을 놓는 데 필요한 지점 정보 (이름, 지도에서 줄일 실내 크기, 입구 문 폭)
export type BranchShape = Pick<BranchLayout, 'name' | 'size' | 'door'>

// 광장에 놓인 건물
// 건물의 한 층. level 1 이 1층(건물 slug 의 지점)
export type PlacedFloor = { level: number; slug: string; name: string; window?: string }

export type PlacedBuilding = {
  no: number // 1부터. Player 의 "앉는 자리" 번호로 씁니다 (입구 앞에서 E)
  slug: string // 1층 지점
  name: string // 1층 지점 이름 (입구 간판)
  floors: PlacedFloor[] // 1층부터. 한 층뿐이면 길이 1. 지점 안 엘리베이터가 이 목록으로 층을 고릅니다
  spec: BuildingSpec
  angle: number // 입구 방향 각도
  rect: Box // 광장 좌표, 돌린 뒤의 바닥 사각형
  door: Box // 광장 좌표, 입구 문 상자 (입구 면 가운데)
  entry: { no: number; x: number; z: number; rot: number } // 입구 앞 자리. rot 은 입구를 바라보는 방향
  arrive: Point // 지점에서 나왔을 때 서는 자리
  scale: number // 지도에서 실내를 겉모습 안에 같은 비율로 줄여 넣는 배율 (실내 16×16 → 10×8 이면 0.5)
}

export const DOOR_GAP = 1.1 // 입구 바깥 이만큼 앞이 입장 자리 (지금 로비와 같음)
export const ARRIVE_GAP = 2.1 // 지점에서 나오면 입구 바깥 이만큼 앞에 섭니다. 입장 자리보다 멀어 나오자마자 "입장" 안내가 뜨지 않음
export const FENCE_T = 0.3 // 가장자리 울타리 두께
export const TRUNK = 0.5 // 나무 줄기 부딪힘 상자 한 변
export const LAMP_POST = 0.3 // 가로등 기둥 부딪힘 상자 한 변
export const BENCH = { w: 1.6, d: 0.6 } // 벤치 부딪힘 상자 (남·북을 볼 때. 동·서를 보면 w·d 가 바뀜)
export const GATE_POST = 1.2 // 정문 벽돌 기둥 한 변 (부딪힘)
export const GATE_FENCE = { len: 5, t: 0.2, endPost: 0.6 } // 정문 양옆 철제 울타리: 길이, 두께, 끝 작은 기둥 한 변
export const GATE_NO_BASE = 50 // 정문 입장 자리 번호 시작 (건물 입구 번호와 겹치지 않게)
export const REST_NO_BASE = 100 // 쉬는 자리 번호 시작
export const MAT_SIT = { y: -0.38 } // 돗자리: 바닥에 앉음 (앉은 자세를 의자 높이만큼 내림)
export const BEANBAG = { y: -0.12, lie: 0.45 } // 빈백: 조금 낮게, 뒤로 기대 누움(라디안)
const DOOR_W = 1.6 // 지점 JSON 에 출입문이 없을 때 입구 문 폭
const DOOR_T = 0.3 // 입구 문 두께

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
export function placeBuildings(plaza: PlazaLayout, layouts: Record<string, BranchShape>, warn?: (msg: string) => void): PlacedBuilding[] {
  const placed: PlacedBuilding[] = []
  for (const spec of plaza.buildings) {
    const layout = layouts[spec.slug]
    if (!layout) {
      warn?.(`광장 건물 ${spec.slug}: 지점 배치(src/space/branches)에 없어 그리지 않습니다.`)
      continue
    }
    const no = placed.length + 1
    const floors: PlacedFloor[] = [{ level: 1, slug: spec.slug, name: layout.name }]
    for (const f of spec.floors ?? []) {
      const upper = layouts[f.slug]
      if (!upper) {
        warn?.(`광장 건물 ${spec.slug}의 층 ${f.slug}: 지점 배치(src/space/branches)에 없어 넣지 않습니다.`)
        continue
      }
      floors.push({ level: floors.length + 1, slug: f.slug, name: upper.name, window: f.window })
    }
    const angle = facingAngle(spec.facing)
    const front = spec.d / 2 // 입구 면 (건물 기준 +Z)
    const doorBox = { x: 0, z: front, w: layout.door?.w ?? DOOR_W, d: layout.door?.d ?? DOOR_T }
    const entry = pointToWorld(spec, 0, front + DOOR_GAP)
    placed.push({
      no,
      slug: spec.slug,
      name: layout.name,
      floors,
      spec,
      angle,
      rect: boxToWorld(spec, { x: 0, z: 0, w: spec.w, d: spec.d }),
      door: boxToWorld(spec, doorBox),
      entry: { no, ...entry, rot: normalizeAngle(angle + Math.PI) },
      arrive: pointToWorld(spec, 0, front + ARRIVE_GAP),
      scale: Math.min(spec.w / layout.size.w, spec.d / layout.size.d),
    })
  }
  return placed
}

// 정문이 놓인 자리 (건물과 같은 규칙: 문 기준 +Z 가 앞면, facing 만큼 돌림)
export type PlacedGate = {
  no: number // GATE_NO_BASE + 순서. Player 의 "앉는 자리" 번호
  spec: GateSpec
  angle: number
  entry: { no: number; x: number; z: number; rot: number } // 입장 자리. rot 은 문을 바라보는 방향
  arrive: Point // 다른 월드에서 넘어오면 서는 자리 (문을 등짐)
  posts: Box[] // 양쪽 벽돌 기둥 (부딪힘)
  fences: Box[] // 양옆 철제 울타리와 끝 작은 기둥 (부딪힘)
}

const gateFrame = (g: GateSpec) => ({ x: g.x, z: g.z, facing: g.facing })
function gatePoint(g: GateSpec, x: number, z: number): Point {
  const c = rotate(x, z, facingAngle(g.facing))
  return { x: g.x + c.x, z: g.z + c.z }
}

export function placeGates(layout: PlazaLayout): PlacedGate[] {
  return (layout.gates ?? []).map((spec, i) => {
    const no = GATE_NO_BASE + i
    const angle = facingAngle(gateFrame(spec).facing)
    const entry = gatePoint(spec, 0, DOOR_GAP)
    const postX = spec.w / 2 + GATE_POST / 2
    const fenceX = spec.w / 2 + GATE_POST + GATE_FENCE.len / 2 // 울타리 가운데 (기둥 바깥)
    const endX = spec.w / 2 + GATE_POST + GATE_FENCE.len + GATE_FENCE.endPost / 2
    // 문 기준 상자를 월드로: 동·서를 보면 가로·세로가 바뀜
    const box = (x: number, w: number, d: number) => {
      const c = gatePoint(spec, x, 0)
      return sideways(spec.facing) ? { ...c, w: d, d: w } : { ...c, w, d }
    }
    return {
      no,
      spec,
      angle,
      entry: { no, ...entry, rot: normalizeAngle(angle + Math.PI) },
      arrive: gatePoint(spec, 0, ARRIVE_GAP),
      posts: [-postX, postX].map((x) => ({ ...gatePoint(spec, x, 0), w: GATE_POST, d: GATE_POST })),
      fences: [-1, 1].flatMap((sx) => [box(sx * fenceX, GATE_FENCE.len, GATE_FENCE.t), box(sx * endX, GATE_FENCE.endPost, GATE_FENCE.endPost)]),
    }
  })
}

// 쉬는 자리 → Player·다른 참여자 그리기에 쓰는 자리. 돗자리는 바닥에 앉고(y 음수), 빈백은 조금 낮게 기대 눕습니다(lie).
export function restSpots(layout: PlazaLayout): Spot[] {
  return (layout.rests ?? []).map((r, i) => ({
    no: REST_NO_BASE + i,
    x: r.x,
    z: r.z,
    rot: r.rot,
    ...(r.kind === 'mat' ? { y: MAT_SIT.y } : { y: BEANBAG.y, lie: BEANBAG.lie }),
  }))
}

// Player 의 "앉는 자리" 번호가 무엇인지
export const spotKindOf = (no: number): 'building' | 'gate' | 'rest' => (no >= REST_NO_BASE ? 'rest' : no >= GATE_NO_BASE ? 'gate' : 'building')

// 광장에서 부딪히는 상자: 울타리, 건물, 분수, 나무 줄기, 가로등 기둥, 벤치, 정문 기둥
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
    ...placed.map((b) => b.rect),
    ...(f ? [{ x: f.x, z: f.z, w: f.r * 2, d: f.r * 2 }] : []),
    ...plaza.trees.map((t) => ({ x: t.x, z: t.z, w: TRUNK, d: TRUNK })),
    ...plaza.lamps.map((l) => ({ x: l.x, z: l.z, w: LAMP_POST, d: LAMP_POST })),
    ...plaza.benches.map((b) =>
      sideways(b.facing) ? { x: b.x, z: b.z, w: BENCH.d, d: BENCH.w } : { x: b.x, z: b.z, w: BENCH.w, d: BENCH.d },
    ),
    ...placeGates(plaza).flatMap((g) => [...g.posts, ...g.fences]),
  ]
}

// 광장에 들어올 때 설 자리와 방향.
// 지점에서 나왔으면(from) 그 건물 입구 앞에 건물을 등지고 섭니다. 위층 지점에서 나와도 그 건물입니다.
// heading 은 실내에서 보던 방향(없으면 0, 출입문 쪽).
// 다른 월드에서 정문으로 넘어왔으면(from 'world:<WorldId>') 그 월드로 가는 정문 앞에 문을 등지고 섭니다.
// 광장에 없는 지점이거나 주소로 바로 들어오면 시작 위치에 섭니다.
export function arrivalOf(plaza: PlazaLayout, placed: PlacedBuilding[], from?: string, heading?: number): { spawn: Point; heading: number } {
  if (from?.startsWith(WORLD_FROM)) {
    const g = placeGates(plaza).find((x) => x.spec.to === from.slice(WORLD_FROM.length))
    if (g) return { spawn: g.arrive, heading: g.angle }
  }
  const b = from === undefined ? undefined : buildingOf(placed, from)
  // world.json 의 시작 방향(3.1416 등)도 범위를 맞춰 다른 방향 값들과 같게 둡니다.
  if (!b) return { spawn: { x: plaza.spawn.x, z: plaza.spawn.z }, heading: normalizeAngle(plaza.spawn.heading) }
  return { spawn: b.arrive, heading: toWorldHeading(heading ?? 0, b.spec.facing) }
}

// 정문으로 넘어갈 때 넘기는 from 값의 앞부분 ('world:plaza' 처럼)
export const WORLD_FROM = 'world:'

// 그 지점(slug)이 있는 건물. 위층 지점이면 그 층이 있는 건물입니다.
export function buildingOf(placed: PlacedBuilding[], slug: string): PlacedBuilding | undefined {
  return placed.find((p) => p.floors.some((f) => f.slug === slug))
}

// ── 문 사이로 걸어 들어가기 · 울타리 틈 ───────────────────────────────
// 정문은 E 를 눌러도 되고, 문 사이로 걸어 들어가도 넘어갑니다(실제 길을 걸어 들어가는 느낌).
// 문 앞면(입장 쪽)에서 GATE_PASS 안쪽까지 들어오고 두 기둥 사이에 있으면 넘어갑니다.
// 도착 자리(ARRIVE_GAP)·입장 자리(DOOR_GAP)는 그보다 바깥이라, 넘어오자마자 다시 넘어가지 않습니다.
export const GATE_PASS = 0.6
const GATE_BEHIND = 1.5 // 문 뒤로 이보다 멀면 넘어가지 않음 (문 뒤쪽 다른 길에서 잘못 넘어가지 않게)
export function gateCrossed(g: PlacedGate, x: number, z: number): boolean {
  const local = rotate(x - g.spec.x, z - g.spec.z, -g.angle) // 문 기준 좌표 (+Z 가 앞면)
  return local.z < GATE_PASS && local.z > -GATE_BEHIND && Math.abs(local.x) < g.spec.w / 2
}

// 울타리를 그릴 상자. 정문이 붙은 쪽 울타리는 문 폭만큼 비워, 문 너머로 이어지는 길이 보이게 합니다.
// (부딪힘은 plazaObstacles 의 통울타리 그대로 — 문 뒤로 걸어 나가지 않고 문 앞에서 넘어갑니다)
const GATE_NEAR_FENCE = 3 // 울타리에서 이만큼 안쪽까지의 정문은 그 쪽 울타리에 붙은 것으로 봄
export function fenceSegments(plaza: PlazaLayout): Box[] {
  const { w, d } = plaza.size
  const gates = plaza.gates ?? []
  // 한 쪽 울타리: along 축(x 또는 z)으로 -len/2 ~ len/2, 다른 축은 fixed
  const side = (alongX: boolean, fixed: number, len: number): Box[] => {
    const gaps = gates
      .filter((g) => Math.abs((alongX ? g.z : g.x) - fixed) < GATE_NEAR_FENCE)
      .map((g) => [(alongX ? g.x : g.z) - g.w / 2, (alongX ? g.x : g.z) + g.w / 2] as [number, number])
      .sort((a, b) => a[0] - b[0])
    const out: Box[] = []
    let from = -len / 2
    for (const [a, b] of [...gaps, [len / 2, len / 2] as [number, number]]) {
      if (a > from) {
        const c = (from + a) / 2
        out.push(alongX ? { x: c, z: fixed, w: a - from, d: FENCE_T } : { x: fixed, z: c, w: FENCE_T, d: a - from })
      }
      from = Math.max(from, b)
    }
    return out
  }
  return [
    ...side(true, -(d / 2 - FENCE_T / 2), w),
    ...side(true, d / 2 - FENCE_T / 2, w),
    ...side(false, -(w / 2 - FENCE_T / 2), d),
    ...side(false, w / 2 - FENCE_T / 2, d),
  ]
}
