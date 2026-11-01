// 과목 정리·이름 수정·삭제 (#369). React·DB 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   정리(보관)  archivedAt 에 값이 있는 과목. 공부 시작 창에서 빠지고 내 기록에는 이름 그대로 남음
//   삭제        과목 행을 지움. 공부 기록은 남고 과목 번호만 비워짐(null) → "(지운 과목)"으로 묶어 보여 줌

export const SUBJECT_MAX = 20 // subjects.name 의 check 제약(0001)과 같은 값
export const DELETED_SUBJECT = '(지운 과목)' // 0050 의 profile_summary 와 같은 글자
export const LOADING_SUBJECT = '…' // 과목 목록을 아직 못 읽었을 때 (#115: 이때 이름을 지어내지 않음)

export type Subject = { id: number; name: string; archivedAt: string | null }

// 공부 시작 창에 보이는 과목 / 정리한 과목
export const activeSubjects = (list: Subject[]) => list.filter((s) => s.archivedAt === null)
export const archivedSubjects = (list: Subject[]) => list.filter((s) => s.archivedAt !== null)

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
