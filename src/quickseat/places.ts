// 바로 앉기 (#116)에서 고를 수 있는 공간 목록. 배치는 실행 중에 바뀌지 않으므로 한 번만 만듭니다.
// 바깥 공부 자리(캠리단길 벤치, 캠리단길 캠프파이어 통나무, 캠빛 대학교 빈백, 캠빛 해변 비치체어)가 앞,
// 월드에 건물로 서 있는 카페형 지점이 뒤. 규칙은 quickSeatLogic.quickPlaces
import { BRANCH_LAYOUTS } from '../space/branches'
import { BEACH_WORLD, CAMPUS_WORLD, PLAZA_WORLD, computedOf } from '../world/worldConfig'
import { quickPlaces } from './quickSeatLogic'
import type { QuickPlace } from './quickSeatLogic'

export const PLAZA_CAMPFIRE_KEY = 'plaza-campfire' // 캠리단길 캠프파이어 통나무 (벤치와 같은 월드·같은 DB 지점이지만 따로 고름)

const WORLDS = [PLAZA_WORLD, CAMPUS_WORLD, BEACH_WORLD]
const plaza = computedOf(PLAZA_WORLD)
const outside: QuickPlace[] = [
  { key: PLAZA_WORLD.id, label: `${PLAZA_WORLD.title} ${PLAZA_WORLD.study.label}`, place: PLAZA_WORLD.place, route: PLAZA_WORLD.path, seats: plaza.studySpots.length - plaza.campfireSpots.length },
  { key: PLAZA_CAMPFIRE_KEY, label: `${PLAZA_WORLD.title} 캠프파이어`, place: PLAZA_WORLD.place, route: PLAZA_WORLD.path, seats: plaza.campfireSpots.length },
  ...[CAMPUS_WORLD, BEACH_WORLD].map((w) => ({ key: w.id, label: `${w.title} ${w.study.label}`, place: w.place, route: w.path, seats: computedOf(w).studySpots.length })),
]
// 월드에 서 있는 건물의 지점(위층 포함). 닫힌 지점은 건물이 없습니다
const open = new Set(WORLDS.flatMap((w) => computedOf(w).placed.flatMap((b) => b.floors.map((f) => f.slug))))

export const PLACES = quickPlaces(BRANCH_LAYOUTS, outside, open)

// 저장된 이름 → 화면에 보일 이름. 목록에 없으면(지점이 없어짐) null
export const placeLabelOf = (key: string | null) => PLACES.find((p) => p.key === key)?.label ?? null
