// 공부 기록 합산: 저장된 조각(study_logs 한 줄 = 최대 5분)을 일·월·년 단위로 더합니다.
// React·DB 와 무관한 순수 로직입니다. 날짜 경계는 브라우저의 현지 시간(한국 시간) 기준입니다.
// 자정을 넘기는 조각은 시작한 날에 넣습니다. 조각이 5분 이하라 차이가 거의 없습니다.

export type LogRow = { startedAt: string; subjectId: number; focusedSeconds: number }
export type Period = 'day' | 'month' | 'year'

// 보고 있는 구간의 시작(포함)과 끝(미포함). 기록을 읽어 올 범위로 씁니다.
export function periodRange(period: Period, anchor: Date): { start: Date; end: Date } {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate()
  if (period === 'day') return { start: new Date(y, m, d), end: new Date(y, m, d + 1) }
  if (period === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
}

// 앞뒤 구간으로 옮깁니다. (◀ ▶)
export function shiftAnchor(period: Period, anchor: Date, step: number): Date {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate()
  if (period === 'day') return new Date(y, m, d + step)
  if (period === 'month') return new Date(y, m + step, 1)
  return new Date(y + step, 0, 1)
}

// 과목을 고르면 그 과목만, null 이면 전체
export const filterSubject = (rows: LogRow[], subjectId: number | null) =>
  subjectId === null ? rows : rows.filter((r) => r.subjectId === subjectId)

export const totalSeconds = (rows: LogRow[]) => rows.reduce((sum, r) => sum + r.focusedSeconds, 0)

// 일: 과목별 합계 (많은 순)
export function bySubject(rows: LogRow[]): { subjectId: number; seconds: number }[] {
  const map = new Map<number, number>()
  for (const r of rows) map.set(r.subjectId, (map.get(r.subjectId) ?? 0) + r.focusedSeconds)
  return [...map].map(([subjectId, seconds]) => ({ subjectId, seconds })).sort((a, b) => b.seconds - a.seconds)
}

// 월: 날짜별 합계 (1일 ~ 말일, 공부 안 한 날은 0)
export function byDayOfMonth(rows: LogRow[], anchor: Date): number[] {
  const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const out = new Array<number>(days).fill(0)
  for (const r of rows) out[new Date(r.startedAt).getDate() - 1] += r.focusedSeconds
  return out
}

// 년: 월별 합계 (1월 ~ 12월)
export function byMonthOfYear(rows: LogRow[]): number[] {
  const out = new Array<number>(12).fill(0)
  for (const r of rows) out[new Date(r.startedAt).getMonth()] += r.focusedSeconds
  return out
}

// 초 → "3시간 12분", "45분", "0분"
export function formatHM(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h === 0) return `${m}분`
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

// 화면 제목용 날짜 글자
export function periodLabel(period: Period, anchor: Date): string {
  const y = anchor.getFullYear(), m = anchor.getMonth() + 1, d = anchor.getDate()
  if (period === 'day') return `${y}년 ${m}월 ${d}일`
  if (period === 'month') return `${y}년 ${m}월`
  return `${y}년`
}
