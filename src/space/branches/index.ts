// 지점 배치 모음. 주소의 ?branch= 값(DB branches.slug)으로 찾습니다.
// 새 지점을 만들면 JSON 을 추가하고 여기에 한 줄 넣습니다. (DB에도 지점·좌석을 넣어야 함)
import type { BranchLayout } from '../layout'
import roomB from './room-b.json'
import roomC from './room-c.json'

export const BRANCH_LAYOUTS: Record<string, BranchLayout> = {
  'room-b': roomB, // 실험 B 조건(혼자 공부). 솔카페(서비스 지점) 배치를 복사하고 다른 참여자를 숨김 (#198)
  'room-c': roomC, // 실험 C 조건(아바타). room B 와 같은 배치, 참가자는 4번, 팀원 캐릭터 3명은 맞은편 테이블 18·19·20번 (#199)
}

export const DEFAULT_BRANCH = 'room-b' // 주소에 지점이 없을 때. 실험 브랜치에는 실험 지점만 있습니다 (#189)
