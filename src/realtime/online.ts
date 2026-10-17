// 사이트 전체 접속 상태 (#176). 화면·React와 무관한 값과 계산입니다.
//
// 로비·지점 방(participants.ts)은 자기가 있는 방 사람만 압니다. 다른 지점에 있는 친구나
// 전체 접속자 수를 알려고 사이트 전체의 "접속 상태" 방을 하나 더 둡니다.
// 위치처럼 계속 보내지 않고, 들어올 때와 있는 곳이 바뀔 때만 상태가 바뀝니다(Presence).
// 탭을 닫거나 접속이 끊기면 서버가 자동으로 지웁니다.
import { BRANCH_LAYOUTS } from '../space/branches'

export const ONLINE_CHANNEL = 'online'

// 지금 있는 곳: 'lobby', 지점 slug('byeol' 등), 그 밖의 화면(기록·친구·프로필 페이지 등)
export const LOBBY_PLACE = 'lobby'
export const ELSEWHERE = 'elsewhere'

// 있는 곳을 사람이 읽는 이름으로
export function placeLabel(place: string): string {
  if (place === LOBBY_PLACE) return '로비'
  return BRANCH_LAYOUTS[place]?.name ?? '활동 중'
}
