// 스터디 플래너를 노트처럼 넘기기 (쓴 날만큼 쌓인 종이 더미). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   hasWriting     그 장에 내가 쓴 게 하나라도 있는지 (글자·체크·기분·형광펜)
//   writtenDays    쓴 날 목록 (장에 쓴 게 있거나 집중 기록이 있는 날, 오늘까지만). 오름차순
//   mergeSeen      이번에 본 날들(쓴 게 있거나 집중 기록이 있는지)을 처음 읽은 목록에 덮어씀 (처음 쓰는 순간 바로 늘고, 넘겨도 기억)
//   canGoBack      지난날로 넘길 수 있는지 (처음 쓴 날까지)
//   canGoForward   앞날로 넘길 수 있는지 (오늘부터 MAX_AHEAD_DAYS 일 뒤까지)
//   canMark        시간표에 형광펜을 칠할 수 있는지 (오늘까지만. 앞날은 아직 보낸 시간이 없음)
//   stackInfo      두 묶음: 아래 더미(그날보다 앞선 쓴 날)·넘겨 온 묶음(그날보다 뒤인 쓴 날)·전체·몇 번째
//   visibleSheets  겹쳐 그릴 장 수 (화면 밖으로 넘치지 않게 상한)
//   flipOutcome    모서리를 놓았을 때 넘길지 되돌릴지 (짧게 누르기도 넘김)
// (가져오기에 .ts 를 붙인 건 Node 로 바로 검사하려고. Vite·tsc 는 둘 다 받습니다)
// 날짜는 'YYYY-MM-DD' 문자열이라 문자열 비교가 곧 날짜 순서입니다.
import { normalizePlanner, plannerDayOf, shiftDay } from './plannerLogic.ts'
import type { PlannerData } from './plannerLogic.ts'

export const MAX_AHEAD_DAYS = 7 // 앞날은 일주일까지 미리 씀
export const MAX_VISIBLE_SHEETS = 8 // 더미 한 묶음에 겹쳐 그리는 장 수 상한
export const FLIP_COMPLETE = 0.5 // 이만큼 넘게 끌고 놓으면 끝까지 넘어감
export const TAP_MAX_MOVE_PX = 6 // 이보다 덜 움직이고
export const TAP_MAX_MS = 300 // 이보다 빨리 떼면 "짧게 누르기" → 한 장 넘김

export function hasWriting(d: PlannerData): boolean {
  return (
    d.dday.label !== '' ||
    d.dday.date !== '' ||
    d.wake !== '' ||
    d.goal !== '' ||
    d.memo !== '' ||
    d.mood !== null ||
    Object.keys(d.marks).length > 0 ||
    d.rows.some((r) => r.sub !== '' || r.topic !== '' || r.done)
  )
}

export function writtenDays(pages: { day: string; data: unknown }[], focusStarts: number[], today: string): string[] {
  const days = new Set<string>()
  for (const p of pages) if (hasWriting(normalizePlanner(p.data))) days.add(p.day)
  for (const ms of focusStarts) days.add(plannerDayOf(ms))
  return [...days].filter((d) => d <= today).sort()
}

export function mergeSeen(written: string[], seen: Record<string, boolean>, today: string): string[] {
  const days = new Set(written)
  for (const [day, has] of Object.entries(seen)) {
    if (day > today) continue
    if (has) days.add(day)
    else days.delete(day)
  }
  return [...days].sort()
}

export const canGoBack = (day: string, written: string[], today: string) => day > (written[0] ?? today)

export const canGoForward = (day: string, today: string) => day < shiftDay(today, MAX_AHEAD_DAYS)

export const canMark = (day: string, today: string) => day <= today

export function stackInfo(written: string[], day: string): { below: number; flipped: number; total: number; index: number } {
  const below = written.filter((d) => d < day).length
  const flipped = written.filter((d) => d > day).length
  return { below, flipped, total: written.length, index: written.length - flipped }
}

export const visibleSheets = (n: number) => Math.min(n, MAX_VISIBLE_SHEETS)

export function flipOutcome(g: { progress: number; movedPx: number; ms: number }): 'flip' | 'cancel' {
  if (g.movedPx <= TAP_MAX_MOVE_PX && g.ms <= TAP_MAX_MS) return 'flip'
  return g.progress >= FLIP_COMPLETE ? 'flip' : 'cancel'
}
