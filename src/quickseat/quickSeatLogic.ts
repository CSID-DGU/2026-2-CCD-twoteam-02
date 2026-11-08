// 바로 앉기 (#116): 접속 직후 한 번 눌러 최애 공간의 빈자리에 앉아 공부를 시작합니다. 화면·DB와 무관한 순수 로직입니다.
//
//   quickPlaces   고를 수 있는 공간 목록. 바깥 공부 자리(places.ts 에서 넘김: 캠리단길 벤치·캠프파이어, 캠퍼스 빈백, 해변 비치체어)와
//                 앉으면 내 자리가 되는 카페형 지점(키오스크 없음, 휴식방 아님) 중 지금 월드에 건물로 서 있는 것(open).
//                 닫힌 지점(레트로카페·흑요 라운지·월넛 바, 0049)은 건물이 없어 빠집니다.
//                 키오스크 지점(Cam Study Cafe)은 이용권이 있어야 앉으므로 1차에서는 뺍니다(팀 논의 중).
//   countByPlace  접속 상태(online)에서 공간마다 몇 명이 있는지. 나는 뺍니다.
//   choosePlace   어디로 갈지. 최애가 있으면 그곳. 없으면 사람이 있는 공간 중 자리가 남은 곳에서 하나(랜덤),
//                 그런 곳이 없으면 아무 곳(랜덤). 서비스 취지가 "같이 공부하는 긴장감"이라 아무도 없는 곳보다 사람이 있는 곳을 고릅니다.
//   pickSpot      빈자리 중 하나를 랜덤으로. 이미 시도해 실패한 자리는 뺍니다.
import type { BranchLayout } from '../space/layout'

export const REQUEST_TTL_MS = 30_000 // 이만큼 지난 요청은 버림 (도착한 화면이 늦게 떠도 엉뚱한 때 앉지 않게)
export const MAX_SEAT_TRIES = 4 // 자리 잡기를 몇 번까지 다시 해 볼지 (같은 순간 다른 사람이 앉으면 DB 가 거절함)

export type QuickPlace = {
  key: string // 저장·요청에 쓰는 이름. 지점은 slug, 바깥은 월드 id(plaza·campus·beach)
  label: string // 고르는 창에 보이는 이름
  place: string // 접속 상태(online)의 "있는 곳" 이름 (인원을 셀 때)
  route: string // 주소 (지점은 /space?branch=slug, 바깥은 월드 주소)
  seats: number // 공부 자리 수
}

// outside: 바깥 공부 자리 목록(앞에 둠). open: 월드에 건물로 서 있는 지점 slug (위층 포함)
export function quickPlaces(layouts: Record<string, BranchLayout>, outside: QuickPlace[], open: Set<string>): QuickPlace[] {
  const branches = Object.entries(layouts)
    .filter(([slug, b]) => open.has(slug) && !b.kiosk && !b.rest)
    .map(([slug, b]) => ({ key: slug, label: b.name, place: slug, route: `/space?branch=${slug}`, seats: b.seats.length }))
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

const pick = <T>(list: T[], random: () => number): T | null => (list.length === 0 ? null : list[Math.min(list.length - 1, Math.floor(random() * list.length))])

export function choosePlace(favorite: string | null, places: QuickPlace[], counts: Map<string, number>, random: () => number = Math.random): QuickPlace | null {
  const fav = favorite === null ? undefined : places.find((p) => p.key === favorite)
  if (fav) return fav
  const lively = places.filter((p) => {
    const n = counts.get(p.place) ?? 0
    return n > 0 && n < p.seats
  })
  return pick(lively, random) ?? pick(places, random)
}

export function pickSpot<T extends { no: number }>(free: T[], tried: Set<number>, random: () => number = Math.random): T | null {
  return pick(
    free.filter((s) => !tried.has(s.no)),
    random,
  )
}

// 저장된 최애 이름이 지금 목록에 있는지 (지점이 없어졌으면 없는 것으로)
export const isValidPlace = (key: string | null, places: QuickPlace[]) => key !== null && places.some((p) => p.key === key)
