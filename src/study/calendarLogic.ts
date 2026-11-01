// 내 기록 월 달력·과목 도넛 계산. React·DB 와 무관한 순수 로직입니다. (Node 로 검사)
// 날짜 경계는 기록 화면 전체와 같은 자정(브라우저 현지 시간)입니다. (설계: docs/superpowers/specs/2026-11-02-records-calendar-design.md)
//
//   heatLevel       그날 집중 시간 → 칸 색 단계 0~4 (0: 안 함, 많이 할수록 진한 초록)
//   dayKey          날짜 → 'YYYY-MM-DD' (쉬는 날 rest_days.day 와 같은 모양)
//   monthCells      그달 달력 칸 (월요일 시작, 앞뒤 달 날짜로 채워 7의 배수)
//   donutSlices     과목별 합계 → 도넛 조각 (많은 순, 0~1 누적 비율, 정수 %)
//   canGoNextMonth  월 단위 ▶: 이번 달 다음 한 달까지만 (쉬는 날을 미리 찍으려고)
//   formatClock     초 → 'H:MM' (달력 칸·도넛 가운데)

export const HEAT_STEPS = [7200, 14400, 21600] // 2시간·4시간·6시간 (초). 이 미만이면 한 단계 낮음
export const SMALL_SLICE_PERCENT = 2 // 이보다 작은 조각은 도넛 위에 % 글자를 쓰지 않음 (옆 목록에만)

export function heatLevel(seconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0
  const i = HEAT_STEPS.findIndex((s) => seconds < s)
  return (i === -1 ? 4 : i + 1) as 1 | 2 | 3 | 4
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function monthCells(anchor: Date): { key: string; day: number; inMonth: boolean }[] {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7 // 월요일 = 0
  const days = new Date(y, m + 1, 0).getDate()
  const count = Math.ceil((lead + days) / 7) * 7
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m, 1 - lead + i)
    return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === m }
  })
}

export function donutSlices(items: { subjectId: number | null; seconds: number }[]) {
  const list = items.filter((x) => x.seconds > 0).sort((a, b) => b.seconds - a.seconds)
  const total = list.reduce((a, x) => a + x.seconds, 0)
  if (total === 0) return []
  let acc = 0
  return list.map((x) => {
    const from = acc / total
    acc += x.seconds
    return { subjectId: x.subjectId, seconds: x.seconds, percent: Math.round((x.seconds / total) * 100), from, to: acc / total }
  })
}

export function canGoNextMonth(anchor: Date, now: Date): boolean {
  const next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  const limit = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next <= limit
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${pad(m % 60)}`
}
