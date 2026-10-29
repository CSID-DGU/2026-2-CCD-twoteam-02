// 지점 배치 모음. 주소의 ?branch= 값(DB branches.slug)으로 찾습니다.
// 새 지점을 만들면 JSON 을 추가하고 여기에 한 줄 넣습니다. (DB에도 지점·좌석을 넣어야 함)
import type { BranchLayout } from '../layout'
import byeol from './byeol.json'
import sol from './sol.json'

export const BRANCH_LAYOUTS: Record<string, BranchLayout> = {
  byeol, // 별다방 (스터디카페, 키오스크)
  // 솔카페 (카페, 커피 바, 다이너 테마 #57). JSON 의 theme.floor.colors 가 string[] 로 읽혀 [string, string] 과 안 맞아 단언합니다.
  sol: sol as BranchLayout,
}

export const DEFAULT_BRANCH = 'byeol'
