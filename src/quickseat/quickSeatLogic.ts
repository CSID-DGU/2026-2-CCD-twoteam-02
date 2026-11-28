// 바로 앉기 (#116): 접속 직후 한 번 눌러 최애 공간의 빈자리에 앉아 공부를 시작합니다. 화면·DB와 무관한 순수 로직입니다.
//
//   quickPlaces   고를 수 있는 공간 목록. 바깥 공부 자리(places.ts 에서 넘김: 캠리단길 벤치·캠프파이어, 캠퍼스 빈백, 해변 비치체어)와
//                 지점(휴식방 아님) 중 지금 월드에 건물로 서 있는 것(open). 닫힌 지점(레트로카페·흑요 라운지·월넛 바, 0049)은 건물이 없어 빠집니다.
//                 카페형 지점은 앉으면 내 자리라 빈자리에 바로 앉힙니다.
//                 키오스크 지점(Cam Study Cafe)은 이용권이 있어야 앉으므로, 앉히지 않고 키오스크 앞에 세웁니다(kiosk). 키오스크가 다른 층에 있는 층(2층)은 뺍니다.
//   countByPlace  접속 상태(online)에서 공간마다 몇 명이 있는지. 나는 뺍니다.
//   countByKey    고르는 창의 줄마다 보여 줄 인원. 바깥 공부 자리는 앉은 사람만 셉니다.
//   choosePlace   어디로 갈지. 최애가 있으면 그곳. 없으면 사람이 있는 공간 중 자리가 남은 곳에서 하나(랜덤),
//                 그런 곳이 없으면 아무 곳(랜덤). 최애가 아닐 때는 키오스크 지점을 고르지 않습니다(앉지 못하고 키오스크 앞에 서게 되므로). 서비스 취지가 "같이 공부하는 긴장감"이라 아무도 없는 곳보다 사람이 있는 곳을 고릅니다.
//   pickSpot      빈자리 중 하나를 랜덤으로. 이미 시도해 실패한 자리는 뺍니다.
//   kioskFront    키오스크 지점에 도착했을 때 설 자리. 키오스크 화면 앞에서 키오스크를 바라봄
import type { BranchLayout } from '../space/layout'

export const REQUEST_TTL_MS = 30_000 // 이만큼 지난 요청은 버림 (도착한 화면이 늦게 떠도 엉뚱한 때 앉지 않게)
export const MAX_SEAT_TRIES = 4 // 자리 잡기를 몇 번까지 다시 해 볼지 (같은 순간 다른 사람이 앉으면 DB 가 거절함)
export const KIOSK_FRONT = 0.7 // 키오스크 중심에서 앞으로 떨어져 설 거리(m). 키오스크를 쓸 수 있는 거리(Player 의 KIOSK_RANGE 1m) 안

export type QuickPlace = {
  key: string // 저장·요청에 쓰는 이름. 지점은 slug, 바깥은 월드 id(plaza·campus·beach)
  label: string // 고르는 창에 보이는 이름
  place: string // 접속 상태(online)의 "있는 곳" 이름 (인원을 셀 때)
  route: string // 주소 (지점은 /space?branch=slug, 바깥은 월드 주소)
  seats: number // 공부 자리 수
  // 바깥 공부 자리만: DB 지점 slug 와 이 줄에 속한 DB 좌석 번호. 캠리단길 벤치·캠프파이어는 같은 지점(plaza)의 다른 번호
  outside?: { slug: string; seatNos: number[] }
  kiosk?: true // 키오스크 지점: 앉히지 않고 키오스크 앞에 세움 (이용권을 받아야 앉을 수 있음)
}

// outside: 바깥 공부 자리 목록(앞에 둠). open: 월드에 건물로 서 있는 지점 slug (위층 포함)
export function quickPlaces(layouts: Record<string, BranchLayout>, outside: QuickPlace[], open: Set<string>): QuickPlace[] {
  const branches = Object.entries(layouts)
    .filter(([slug, b]) => open.has(slug) && !b.kioskAt && !b.rest) // kioskAt: 키오스크가 다른 층에 있는 층. 그 층 키오스크로 가면 되므로 뺌
    .map(([slug, b]): QuickPlace => ({ key: slug, label: b.name, place: slug, route: `/space?branch=${slug}`, seats: b.seats.length, ...(b.kiosk ? { kiosk: true as const } : {}) }))
  return [...outside, ...branches]
}

export function countByPlace(entries: Iterable<[string, { place: string }]>, myId: string | null): Map<string, number> {
  const counts = new Map<string, number>()
  for (const [id, e] of entries) {
    if (id === myId) continue
    counts.set(e.place, (counts.get(e.place) ?? 0) + 1)
  }
  return counts
}

// 줄(key)마다 보여 줄 인원. 지점은 그 안에 있는 사람 수(online), 바깥 공부 자리는 그 자리에 앉은 사람 수(DB 좌석)입니다.
// 바깥 자리를 online 으로 세면 월드를 돌아다니는 사람이 벤치·캠프파이어 줄에 모두 겹쳐 셉니다.
// occupied: DB 지점 slug → 이용 중인 좌석 번호. 아직 못 읽은 지점은 결과에 넣지 않습니다(화면은 인원을 비워 둠)
export function countByKey(places: QuickPlace[], online: Map<string, number>, occupied: Record<string, number[]>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of places) {
    if (!p.outside) {
      counts.set(p.key, online.get(p.place) ?? 0)
      continue
    }
    const taken = occupied[p.outside.slug]
    if (!taken) continue
    const mine = new Set(p.outside.seatNos)
    counts.set(p.key, taken.filter((no) => mine.has(no)).length)
  }
  return counts
}

const pick = <T>(list: T[], random: () => number): T | null => (list.length === 0 ? null : list[Math.min(list.length - 1, Math.floor(random() * list.length))])

// counts: 줄(key)마다의 인원 (countByKey)
export function choosePlace(favorite: string | null, places: QuickPlace[], counts: Map<string, number>, random: () => number = Math.random): QuickPlace | null {
  const fav = favorite === null ? undefined : places.find((p) => p.key === favorite)
  if (fav) return fav
  const seatable = places.filter((p) => !p.kiosk) // 최애가 아니면 바로 앉을 수 있는 곳만
  const lively = seatable.filter((p) => {
    const n = counts.get(p.key) ?? 0
    return n > 0 && n < p.seats
  })
  return pick(lively, random) ?? pick(seatable, random)
}

// 키오스크 화면은 방 가운데(0, 0)를 향해 있습니다(KioskStand). 그 앞 KIOSK_FRONT 만큼에서 키오스크를 바라보고 섭니다.
// heading: 캐릭터가 바라보는 방향 (atan2(x 방향, z 방향), Player 와 같은 기준)
export function kioskFront(kiosk: { x: number; z: number }, dist = KIOSK_FRONT): { x: number; z: number; heading: number } {
  const len = Math.hypot(kiosk.x, kiosk.z)
  const [dx, dz] = len > 0 ? [-kiosk.x / len, -kiosk.z / len] : [0, -1] // 키오스크 앞쪽 방향. 방 가운데에 있으면 -z (KioskStand 도 그쪽을 봄)
  return { x: kiosk.x + dx * dist, z: kiosk.z + dz * dist, heading: Math.atan2(-dx, -dz) }
}

export function pickSpot<T extends { no: number }>(free: T[], tried: Set<number>, random: () => number = Math.random): T | null {
  return pick(
    free.filter((s) => !tried.has(s.no)),
    random,
  )
}

// 저장된 최애 이름이 지금 목록에 있는지 (지점이 없어졌으면 없는 것으로)
export const isValidPlace = (key: string | null, places: QuickPlace[]) => key !== null && places.some((p) => p.key === key)
