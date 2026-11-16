// 여러 층 스터디카페의 키오스크·자리 안내. 화면·DB와 무관한 순수 로직입니다.
//
// Cam Study Cafe 는 실제 스터디카페처럼 1층 입구 키오스크 하나에서 1·2층 자리를 모두 받습니다.
// 두 층은 DB 에서 서로 다른 지점이라, 키오스크는 고른 층의 지점 번호로 배정하고(KioskFloor),
// 지점 화면은 내 자리가 다른 층에 있으면 그 층으로 가라고 알려 줍니다(floorSeatHint).
import type { BranchLayout } from '../space/layout'

// 키오스크에서 고를 수 있는 층 하나. branchId 는 그 층의 DB 지점 번호
export type KioskFloor = { level: number; layout: BranchLayout; branchId: number }

// 내 자리가 다른 층에 있을 때 지금 층에서 보여 줄 안내
export function floorSeatHint(hereLevel: number, mine: { level: number; seat: number }): string {
  const way = mine.level > hereLevel ? '올라가세요' : '내려가세요'
  return `내 자리: ${mine.level}층 ${mine.seat}번 · 계단으로 ${way}`
}

// 자리가 없을 때 안내. 키오스크가 다른 층에 있으면 그 층을 알려 줍니다(kioskLevel)
export function noSeatHint(kioskLevel: number | null): string {
  return kioskLevel === null ? '키오스크에서 자리를 지정하세요' : `${kioskLevel}층 키오스크에서 자리를 받으세요`
}
