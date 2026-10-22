// 지점 배치 모음. 주소의 ?branch= 값(DB branches.slug)으로 찾습니다.
// 새 지점을 만들면 JSON 을 추가하고 여기에 한 줄 넣습니다. (DB에도 지점·좌석을 넣어야 함)
import type { BranchLayout } from '../layout'
import byeol from './byeol.json'
import sol from './sol.json'
import roomB from './room-b.json'

export const BRANCH_LAYOUTS: Record<string, BranchLayout> = {
  byeol, // 별다방 (스터디카페, 키오스크)
  sol, // 솔카페 (카페, 커피 바)
  'room-b': roomB, // 실험 B 조건(혼자 공부). 솔카페 배치를 복사하고 다른 참여자를 숨김 (#198)
}

export const DEFAULT_BRANCH = 'byeol'
