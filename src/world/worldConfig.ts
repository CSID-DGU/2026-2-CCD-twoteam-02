// 바깥 공간(월드) 설정: 광장(첫 화면)과 캠빛 대학교 캠퍼스. WorldScene 이 이 설정 하나로 두 월드를 그립니다.
// 월드마다 배치 JSON, 실시간 방, 접속 장소 이름, 주소가 다릅니다. 광장은 예전 로비 이름(lobby)을 그대로 씁니다
// (develop·experiment 사이 실시간·접속 상태가 어긋나지 않게, #315).
import { BRANCH_LAYOUTS } from '../space/branches'
import { CAMPUS_CHANNEL, LOBBY_CHANNEL } from '../realtime/participants'
import { CAMPUS_PLACE, LOBBY_PLACE } from '../realtime/online'
import { benchSeats, boardSpot, buildingOf, courtyardSeats, placeBuildings, placeGates, plazaObstacles, restSpots } from './worldLogic'
import type { PlacedBuilding, PlacedGate, PlazaLayout, WorldId } from './worldLogic'
import type { Box, Spot } from '../space/layout'
import world from './world.json'
import campus from './campus.json'

export type WorldConfig = {
  id: WorldId
  layout: PlazaLayout
  channel: string // 실시간 방 (같은 월드에 있는 사람끼리 보임)
  place: string // 사이트 전체 접속 상태의 "있는 곳"
  path: string // 주소
  title: string // 안내 글자 ("캠리단길", "캠빛 대학교")
  // 바깥에서 공부하는 자리: DB 의 카페 종류 지점 slug 와 안내 글자. 광장은 벤치(0038), 캠퍼스는 등불 나무 광장 빈백(0043)
  study: { slug: string; label: string }
}

// JSON 은 facing·kind 가 string 으로 읽혀 타입만 맞춥니다. (값은 worldLogic 검사로 확인)
export const PLAZA_WORLD: WorldConfig = { id: 'plaza', layout: world as PlazaLayout, channel: LOBBY_CHANNEL, place: LOBBY_PLACE, path: '/', title: (world as PlazaLayout).title ?? '캠리단길', study: { slug: 'plaza', label: '벤치' } }
export const CAMPUS_WORLD: WorldConfig = {
  id: 'campus',
  layout: campus as PlazaLayout,
  channel: CAMPUS_CHANNEL,
  place: CAMPUS_PLACE,
  path: '/campus',
  title: (campus as PlazaLayout).title ?? '캠빛 대학교',
  study: { slug: 'campus', label: '등불나무 빈백' },
}
export const worldOf = (id: WorldId): WorldConfig => (id === 'campus' ? CAMPUS_WORLD : PLAZA_WORLD)

// 배치는 실행 중에 바뀌지 않으므로 월드마다 한 번만 계산합니다.
export type WorldComputed = {
  placed: PlacedBuilding[]
  gates: PlacedGate[]
  rests: Spot[] // 쉬는 자리 (돗자리·빈백)
  studySpots: Spot[] // 공부 자리: 광장은 벤치 자리, 캠퍼스는 등불 나무 광장 빈백
  obstacles: Box[]
  entries: Spot[] // Player 의 "앉는 자리": 건물 입구 + 정문 입장 자리 + 쉬는 자리 + 순위 게시판 앞(#59)
  litLamps: PlazaLayout['lamps'] // 밤에 점광원을 켜는 가로등 (JSON 의 light)
}
const computed = new Map<WorldId, WorldComputed>()
export function computedOf(w: WorldConfig): WorldComputed {
  let c = computed.get(w.id)
  if (!c) {
    const placed = placeBuildings(w.layout, BRANCH_LAYOUTS, console.warn)
    const gates = placeGates(w.layout)
    const rests = restSpots(w.layout)
    const board = boardSpot(w.layout)
    c = {
      placed,
      gates,
      rests,
      studySpots: w.id === 'campus' ? courtyardSeats(w.layout) : benchSeats(w.layout),
      obstacles: plazaObstacles(w.layout, placed),
      entries: [...placed.map((b) => b.entry), ...gates.map((g) => g.entry), ...rests, ...(board ? [board] : [])],
      litLamps: w.layout.lamps.filter((l) => l.light),
    }
    computed.set(w.id, c)
  }
  return c
}

// 그 지점(위층 포함)이 있는 월드. 지점에서 나가면 이 월드의 그 건물 앞으로 돌아갑니다. 없는 지점이면 광장
export function worldOfBranch(slug: string): WorldConfig {
  return [CAMPUS_WORLD, PLAZA_WORLD].find((w) => buildingOf(computedOf(w).placed, slug)) ?? PLAZA_WORLD
}
