// 지점 배치 모음. 주소의 ?branch= 값(DB branches.slug)으로 찾습니다.
// 새 지점을 만들면 JSON 을 추가하고 여기에 한 줄 넣습니다. (DB에도 지점·좌석을 넣어야 함)
import type { BranchLayout } from '../layout'
import type { BranchTheme } from '../theme'
import byeol from './byeol.json'
import sol from './sol.json'
import olive from './olive.json'
import obsidian from './obsidian.json'
import walnut from './walnut.json'
import moss from './moss.json'
import stream from './stream.json'
import breath from './breath.json'
import cambitLibrary from './cambit-library.json'
import cambitLecture from './cambit-lecture.json'
import cambitInfo from './cambit-info.json'
import cambitCafe from './cambit-cafe.json'
import cambitLounge from './cambit-lounge.json'

export const BRANCH_LAYOUTS: Record<string, BranchLayout> = {
  byeol, // 별다방 (스터디카페, 키오스크)
  // 솔카페 (카페, 커피 바, 다이너 테마 #57). JSON 의 theme 는 colors 가 string[], face 가 string 으로 읽혀 타입이 안 맞아
  // theme 만 단언합니다. 배치(좌석·벽·spawn)는 그대로 검사받습니다.
  sol: { ...sol, theme: sol.theme as BranchTheme },
  // 올리브 테라스 (카페, 원목·올리브 나무 테마). seats 의 chair 도 string 으로 읽혀 같이 단언합니다.
  olive: { ...olive, seats: olive.seats as BranchLayout['seats'], theme: olive.theme as BranchTheme },
  // 흑요 라운지 (카페, 검은 원형 부스·대리석 테이블 테마)
  obsidian: { ...obsidian, seats: obsidian.seats as BranchLayout['seats'], theme: obsidian.theme as BranchTheme },
  // 광장 새 지점들 (#57): 월넛 바(북동 골목, 곡선 바·초록 벨벳 부스), 올리브 테라스 건물 2층 이끼 정원(초록 곡선 소파·화분)·3층 물결 라운지(물길·회색 소파)
  walnut: { ...walnut, seats: walnut.seats as BranchLayout['seats'], theme: walnut.theme as BranchTheme },
  moss: { ...moss, seats: moss.seats as BranchLayout['seats'], theme: moss.theme as BranchTheme },
  stream: { ...stream, seats: stream.seats as BranchLayout['seats'], theme: stream.theme as BranchTheme },
  // 휴식방 숨 라운지 (올리브 테라스 건물 4층): 둥근 방·천창·라운지 소파 12개, 누워 쉬기만 함(rest)
  breath: { ...breath, seats: breath.seats as BranchLayout['seats'], theme: breath.theme as BranchTheme },
  // 캠빛 대학교 캠퍼스 건물 (src/world/campus.json): 도서관(칸막이·조용함 규칙)·강의동(계단식·칠판)·정보관(컴퓨터·다른 화면 허용)·
  // 학생회관 카페·학생 라운지(휴식). 건물별 공부 규칙은 rules(rulesLogic.ts), 휴식은 rest.
  'cambit-library': { ...cambitLibrary, seats: cambitLibrary.seats as BranchLayout['seats'], theme: cambitLibrary.theme as BranchTheme },
  'cambit-lecture': { ...cambitLecture, seats: cambitLecture.seats as BranchLayout['seats'], theme: cambitLecture.theme as BranchTheme },
  'cambit-info': { ...cambitInfo, seats: cambitInfo.seats as BranchLayout['seats'], theme: cambitInfo.theme as BranchTheme },
  'cambit-cafe': { ...cambitCafe, seats: cambitCafe.seats as BranchLayout['seats'], theme: cambitCafe.theme as BranchTheme },
  'cambit-lounge': { ...cambitLounge, seats: cambitLounge.seats as BranchLayout['seats'], theme: cambitLounge.theme as BranchTheme },
}

export const DEFAULT_BRANCH = 'byeol'
