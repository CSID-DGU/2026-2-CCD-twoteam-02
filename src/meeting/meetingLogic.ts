// 회의실 배치 계산 (#45). React·화면과 무관한 순수 함수입니다.
//
// 회의를 만들 때 정한 인원(2~8)만큼 원형 테이블 둘레에 의자를 같은 간격으로 놓습니다.
// 2명이면 마주 보고, 3명이면 삼각형, 8명이면 팔각형입니다. 의자 번호(1~인원)는 DB 의 자리 번호(meeting_members.seat_no)와 같습니다.
// 들어오면 남쪽 문 앞에 서 있고, 걸어가서 빈 의자에서 E 를 누르면 앉습니다(지점의 카페 자리와 같은 방식).
import type { Box, Spot } from '../space/layout'

export const MEETING_CAPACITIES = [2, 3, 4, 5, 6, 7, 8] // 회의를 만들 때 고를 수 있는 인원 (0022)
const ROOM = 8 // 회의실 한 변 길이
const WALL_T = 0.2
const TABLE_RADIUS_BASE = 0.9 // 테이블 반지름 = 기본 + 1명당 늘어나는 만큼 × 인원
const TABLE_RADIUS_PER_PERSON = 0.08 // 2명이면 약 1.06, 8명이면 약 1.54
const CHAIR_GAP = 0.55 // 테이블 가장자리에서 의자(앉은 사람)까지 거리

// 회의실 공간: 벽 4면, 남쪽 문(앞에서 E 로 회의 나가기), 들어오면 서는 자리(문에서 1m 안쪽)
export const MEETING_ROOM = {
  size: { w: ROOM, d: ROOM },
  spawn: { x: 0, z: ROOM / 2 - 1 },
  door: { x: 0, z: ROOM / 2, w: 1.6, d: 0.3 },
  walls: [
    { x: 0, z: -ROOM / 2, w: ROOM, d: WALL_T },
    { x: 0, z: ROOM / 2, w: ROOM, d: WALL_T },
    { x: -ROOM / 2, z: 0, w: WALL_T, d: ROOM },
    { x: ROOM / 2, z: 0, w: WALL_T, d: ROOM },
  ] as Box[],
}

// 인원에 맞춘 테이블 반지름
export function tableRadius(capacity: number): number {
  return TABLE_RADIUS_BASE + TABLE_RADIUS_PER_PERSON * capacity
}

// 의자(앉는 자리) 1~인원번. 첫 의자는 남쪽(+Z, 문 쪽)에서 시작해 시계 반대 방향으로 돌고, 모두 테이블 가운데(0,0)를 봅니다.
export function meetingChairs(capacity: number): Spot[] {
  const r = tableRadius(capacity) + CHAIR_GAP
  return Array.from({ length: capacity }, (_, i) => {
    const angle = (i / capacity) * Math.PI * 2
    const x = Math.sin(angle) * r
    const z = Math.cos(angle) * r
    // rot: 바라보는 방향(0 이면 +Z). 가운데를 보려면 내 위치의 반대 방향입니다.
    return { no: i + 1, x, z, rot: Math.atan2(-x, -z) }
  })
}

// 부딪히는 것: 벽과 테이블. 충돌 판정이 상자만 다루므로 테이블은 원 안에 들어가는 정사각형으로 둡니다.
export function meetingObstacles(capacity: number): Box[] {
  const side = tableRadius(capacity) * Math.SQRT2
  return [...MEETING_ROOM.walls, { x: 0, z: 0, w: side, d: side }]
}

// 친구 탭 접속 상태에 쓰는 "있는 곳" 값. 지점 slug 앞에 붙여 "별다방 회의 중"으로 보이게 합니다.
export const MEETING_PLACE_PREFIX = 'meeting:'
export const meetingPlace = (branchSlug: string) => `${MEETING_PLACE_PREFIX}${branchSlug}`
