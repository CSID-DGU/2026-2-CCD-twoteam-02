// 바로 앉기 (#116)에서 고를 수 있는 공간 목록. 배치는 실행 중에 바뀌지 않으므로 한 번만 만듭니다.
// 바깥 공부 자리(캠리단길 벤치, 캠리단길 캠프파이어 통나무, 캠빛 대학교 빈백, 캠빛 해변 비치체어)가 앞,
// 월드에 건물로 서 있는 카페형 지점이 뒤. 규칙은 quickSeatLogic.quickPlaces
// 고르는 창·설정에서는 구역(캠리단길·캠빛 대학교·캠빛 해변)별로 묶어 보여 줍니다(PLACE_GROUPS). 위치를 잘 몰라도 고르기 쉽게
import { BRANCH_LAYOUTS } from '../space/branches'
import { BEACH_WORLD, CAMPUS_WORLD, PLAZA_WORLD, computedOf } from '../world/worldConfig'
import { benchSeatNumber } from '../world/worldLogic'
import { quickPlaces } from './quickSeatLogic'
import type { QuickPlace } from './quickSeatLogic'

export const PLAZA_CAMPFIRE_KEY = 'plaza-campfire' // 캠리단길 캠프파이어 통나무 (벤치와 같은 월드·같은 DB 지점이지만 따로 고름)

const WORLDS = [PLAZA_WORLD, CAMPUS_WORLD, BEACH_WORLD]
const plaza = computedOf(PLAZA_WORLD)
// 자리 목록 → DB 좌석 번호 (Player 자리 번호에서 BENCH_SEAT_BASE 를 뺀 값). 인원을 앉은 사람으로 셀 때 씁니다
const seatNosOf = (spots: { no: number }[]) => spots.map((s) => benchSeatNumber(s.no))
const campfireNos = new Set(seatNosOf(plaza.campfireSpots))
const benchNos = seatNosOf(plaza.studySpots).filter((no) => !campfireNos.has(no))
const outside: QuickPlace[] = [
  { key: PLAZA_WORLD.id, label: `${PLAZA_WORLD.title} ${PLAZA_WORLD.study.label}`, place: PLAZA_WORLD.place, route: PLAZA_WORLD.path, seats: benchNos.length, outside: { slug: PLAZA_WORLD.study.slug, seatNos: benchNos } },
  { key: PLAZA_CAMPFIRE_KEY, label: `${PLAZA_WORLD.title} 캠프파이어`, place: PLAZA_WORLD.place, route: PLAZA_WORLD.path, seats: campfireNos.size, outside: { slug: PLAZA_WORLD.study.slug, seatNos: [...campfireNos] } },
  ...[CAMPUS_WORLD, BEACH_WORLD].map((w) => {
    const seatNos = seatNosOf(computedOf(w).studySpots)
    return { key: w.id, label: `${w.title} ${w.study.label}`, place: w.place, route: w.path, seats: seatNos.length, outside: { slug: w.study.slug, seatNos } }
  }),
]
// 바깥 공부 자리가 있는 DB 지점 slug (plaza·campus·beach). 앉은 사람 수를 읽을 때 씁니다
export const OUTSIDE_SLUGS = WORLDS.map((w) => w.study.slug)
// 월드에 서 있는 건물의 지점(위층 포함). 닫힌 지점은 건물이 없습니다
const open = new Set(WORLDS.flatMap((w) => computedOf(w).placed.flatMap((b) => b.floors.map((f) => f.slug))))

export const PLACES = quickPlaces(BRANCH_LAYOUTS, outside, open)

// 구역별 묶음. 바깥 자리는 그 월드, 지점은 건물이 서 있는 월드로 나눕니다. 순서는 WORLDS 순서
// short: 묶음 안에서 보일 이름. 구역 이름이 앞에 붙어 있으면 뗍니다 ("캠리단길 벤치" → "벤치")
export type PlaceGroup = { area: string; places: (QuickPlace & { short: string })[] }
const areaOf = new Map<string, string>()
for (const w of WORLDS) {
  areaOf.set(w.place, w.title) // 바깥 자리 (place = 그 월드의 접속 장소 이름)
  for (const b of computedOf(w).placed) for (const f of b.floors) areaOf.set(f.slug, w.title) // 지점 (place = slug)
}
const shortOf = (label: string, area: string) => (label.startsWith(`${area} `) ? label.slice(area.length + 1) : label)
export const PLACE_GROUPS: PlaceGroup[] = WORLDS.map((w) => ({
  area: w.title,
  places: PLACES.filter((p) => areaOf.get(p.place) === w.title).map((p) => ({ ...p, short: shortOf(p.label, w.title) })),
})).filter((g) => g.places.length > 0)

// 저장된 이름 → 화면에 보일 이름. 목록에 없으면(지점이 없어짐) null
export const placeLabelOf = (key: string | null) => PLACES.find((p) => p.key === key)?.label ?? null
