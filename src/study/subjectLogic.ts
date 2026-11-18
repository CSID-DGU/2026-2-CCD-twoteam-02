// 과목 정리·이름 수정·삭제 (#369). React·DB 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   정리(보관)  archivedAt 에 값이 있는 과목. 공부 시작 창에서 빠지고 내 기록에는 이름 그대로 남음
//   삭제        과목 행을 지움. 공부 기록은 남고 과목 번호만 비워짐(null) → "(지운 과목)"으로 묶어 보여 줌

export const SUBJECT_MAX = 20 // subjects.name 의 check 제약(0001)과 같은 값
export const DELETED_SUBJECT = '(지운 과목)' // 0050 의 profile_summary 와 같은 글자
export const LOADING_SUBJECT = '…' // 과목 목록을 아직 못 읽었을 때 (#115: 이때 이름을 지어내지 않음)

export type Subject = { id: number; name: string; archivedAt: string | null; color: string | null } // color: 고른 색(#rrggbb). null 이면 만든 순서로 정함

// 공부 시작 창에 보이는 과목 / 정리한 과목
export const activeSubjects = (list: Subject[]) => list.filter((s) => s.archivedAt === null)
export const archivedSubjects = (list: Subject[]) => list.filter((s) => s.archivedAt !== null)

// 과목 색 (내 기록의 하루 시계·과목 도넛, 플래너 시간표 공통).
// 과목을 만들 때나 과목 관리에서 고른 색(color, 0074)이 있으면 그 색.
// 없으면 내 과목 목록(만든 순서, 정리한 과목 포함 — 순서가 바뀌지 않음)에서 몇 번째인지로 고릅니다. 12개를 넘으면 색이 다시 돕니다.
// 지운 과목(null)이나 목록을 아직 못 읽었을 때는 회색.
//
// 색은 6가지 계열(노랑·주황·분홍·보라·파랑·청록) × 연한 색·진한 색입니다.
//   계열을 더 늘리면 서로 비슷한 색이 생겨서, 같은 계열 안에서 밝기로 나눕니다. 밝기 차이는 작은 칸에서도 잘 보입니다.
//   초록·빨강 계열은 넣지 않습니다. 하루 시계 아래 띠의 초록(공부)·빨강(공부 외)과 헷갈리기 때문입니다.
// SUBJECT_TONES: 색 목록에 보여 주는 모양 그대로 (윗줄 연한 색, 아랫줄 진한 색. 같은 세로줄이 같은 계열)
export const SUBJECT_TONES = {
  light: ['#f2d16b', '#f5b97a', '#e79ac0', '#b9a3e3', '#7fb3d5', '#86d0c8'],
  deep: ['#c9a23a', '#c8854f', '#c2578f', '#7f63c6', '#3f73b8', '#3f9a96'],
}
// 고르지 않은 과목에 붙이는 순서: 연한 색을 먼저 다 쓰고 진한 색. 이웃한 과목끼리 계열이 멀도록 파랑·주황·분홍·보라·노랑·청록 순서
const HUE_ORDER = [4, 1, 2, 3, 0, 5]
export const SUBJECT_PALETTE = [...HUE_ORDER.map((i) => SUBJECT_TONES.light[i]), ...HUE_ORDER.map((i) => SUBJECT_TONES.deep[i])]
export const DELETED_SUBJECT_COLOR = '#b8b8b8'
const COLOR_FORMAT = /^#[0-9a-f]{6}$/ // DB 의 check(0074)와 같은 형식
export const isSubjectColor = (color: string | null): color is string => color !== null && COLOR_FORMAT.test(color)
export function subjectColorOf(list: Subject[], id: number | null): string {
  const i = id === null ? -1 : list.findIndex((s) => s.id === id)
  if (i === -1) return DELETED_SUBJECT_COLOR
  const picked = list[i].color
  return isSubjectColor(picked) ? picked : SUBJECT_PALETTE[i % SUBJECT_PALETTE.length]
}

// 쓰는 과목(정리한 과목 제외)이 지금 쓰고 있는 색. exceptId: 색을 바꾸려는 과목 자신은 뺍니다.
// 색 목록에서 "다른 과목이 쓰는 색"을 표시하고, 새 과목 색을 고를 때 피하는 데 씁니다.
export function usedSubjectColors(list: Subject[], exceptId: number | null = null): Set<string> {
  return new Set(activeSubjects(list).filter((s) => s.id !== exceptId).map((s) => subjectColorOf(list, s.id)))
}

// 새 과목에 미리 골라 둘 색: 쓰는 과목이 아직 안 쓴 색 중 첫 번째. 다 썼으면 과목 수로 돌려 씁니다.
export function nextSubjectColor(list: Subject[]): string {
  const used = usedSubjectColors(list)
  return SUBJECT_PALETTE.find((c) => !used.has(c)) ?? SUBJECT_PALETTE[list.length % SUBJECT_PALETTE.length]
}

// 기록의 과목 번호 → 이름. 번호가 비었거나(지운 과목) 목록에 없으면 "(지운 과목)"
export function subjectName(list: Subject[], id: number | null, loading = false): string {
  if (loading) return LOADING_SUBJECT
  if (id === null) return DELETED_SUBJECT
  return list.find((s) => s.id === id)?.name ?? DELETED_SUBJECT
}

// 쓸 수 있는 이름이면 '', 아니면 안내문. others: 이 과목을 뺀 나머지 (이름 겹침 확인)
export function checkSubjectName(raw: string, others: Subject[] = []): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > SUBJECT_MAX) return `과목 이름은 1~${SUBJECT_MAX}자로 적어 주세요.`
  if (others.some((s) => s.name === name)) return '이미 있는 과목입니다.'
  return ''
}

// DB 오류 → 한국어 안내문
//   23505: (user_id, name) 유니크. 같은 이름이 이미 있음
//   P0001: 트리거가 막음 (과목 50개 제한, 0015). 트리거가 적은 문장을 그대로 보여 줌
// action: '추가하지', '지우지' 처럼 "못했어요" 앞에 오는 말
export function subjectErrorText(code: string | undefined, message: string, action: string): string {
  if (code === '23505') return '이미 있는 과목입니다.'
  if (code === 'P0001') return message
  return `과목을 ${action} 못했어요: ${message}`
}
