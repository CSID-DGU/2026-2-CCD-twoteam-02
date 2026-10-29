// 지점 배치 모음. 주소의 ?branch= 값(DB branches.slug)으로 찾습니다.
// 새 지점을 만들면 JSON 을 추가하고 여기에 한 줄 넣습니다. (DB에도 지점·좌석을 넣어야 함)
import type { BranchLayout } from '../layout'
import type { BranchTheme } from '../theme'
import byeol from './byeol.json'
import sol from './sol.json'
import olive from './olive.json'
import obsidian from './obsidian.json'

export const BRANCH_LAYOUTS: Record<string, BranchLayout> = {
  byeol, // 별다방 (스터디카페, 키오스크)
  // 솔카페 (카페, 커피 바, 다이너 테마 #57). JSON 의 theme 는 colors 가 string[], face 가 string 으로 읽혀 타입이 안 맞아
  // theme 만 단언합니다. 배치(좌석·벽·spawn)는 그대로 검사받습니다.
  sol: { ...sol, theme: sol.theme as BranchTheme },
  // 올리브 테라스 (카페, 원목·올리브 나무 테마). seats 의 chair 도 string 으로 읽혀 같이 단언합니다.
  olive: { ...olive, seats: olive.seats as BranchLayout['seats'], theme: olive.theme as BranchTheme },
  // 흑요 라운지 (카페, 검은 원형 부스·대리석 테이블 테마)
  obsidian: { ...obsidian, seats: obsidian.seats as BranchLayout['seats'], theme: obsidian.theme as BranchTheme },
}

export const DEFAULT_BRANCH = 'byeol'
