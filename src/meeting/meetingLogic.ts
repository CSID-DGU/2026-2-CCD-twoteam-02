// 회의 화면의 자리 계산 (#45). React·화면과 무관한 순수 함수입니다.
//
// 원형 테이블 둘레에 지금 참석자 수만큼만 의자를 같은 간격으로 놓습니다.
// 2명이면 마주 보고, 3명이면 삼각형, 8명이면 팔각형입니다.
// 둘러앉는 순서는 DB 자리 번호(meeting_members.seat_no, 1~8) 순서라서 사람이 늘거나 줄어도 옆 사람이 바뀌지 않습니다.
// 모든 참석자가 같은 순서로 계산하므로, 내 화면과 다른 사람 화면에서 누가 어디 앉았는지가 같습니다.
import type { Spot } from '../space/layout'

export const MEETING_CAPACITY = 8 // 정원 (0021 meetings.capacity 기본값)
const TABLE_RADIUS_BASE = 0.9 // 테이블 반지름 = 기본 + 1명당 늘어나는 만큼 × 인원
const TABLE_RADIUS_PER_PERSON = 0.08 // 2명이면 약 1.06, 8명이면 약 1.54
const CHAIR_GAP = 0.55 // 테이블 가장자리에서 의자(앉은 사람)까지 거리

export type MeetingMember = { userId: string; seatNo: number }

// 인원에 맞춘 테이블 반지름. 혼자여도 2명 크기로 둡니다(너무 작아 보이지 않게).
export function tableRadius(count: number): number {
  return TABLE_RADIUS_BASE + TABLE_RADIUS_PER_PERSON * Math.max(2, count)
}

// 참석자마다 앉을 자리. 자리 번호 순으로 정렬해 테이블 둘레에 같은 간격으로 놓고, 모두 테이블 가운데(0,0)를 봅니다.
// no 에는 DB 자리 번호를 그대로 넣습니다.
export function meetingSpots(members: MeetingMember[]): (Spot & { userId: string })[] {
  const sorted = [...members].sort((a, b) => a.seatNo - b.seatNo)
  const r = tableRadius(sorted.length) + CHAIR_GAP
  return sorted.map((m, i) => {
    // 첫 자리는 남쪽(+Z)에서 시작해 시계 반대 방향으로 돕니다.
    const angle = (i / sorted.length) * Math.PI * 2
    const x = Math.sin(angle) * r
    const z = Math.cos(angle) * r
    // rot: 바라보는 방향(0 이면 +Z). 가운데를 보려면 내 위치의 반대 방향입니다.
    return { userId: m.userId, no: m.seatNo, x, z, rot: Math.atan2(-x, -z) }
  })
}

// 친구 탭 접속 상태에 쓰는 "있는 곳" 값. 지점 slug 앞에 붙여 "별다방 회의 중"으로 보이게 합니다.
export const MEETING_PLACE_PREFIX = 'meeting:'
export const meetingPlace = (branchSlug: string) => `${MEETING_PLACE_PREFIX}${branchSlug}`
