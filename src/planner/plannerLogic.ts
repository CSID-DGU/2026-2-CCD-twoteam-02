// 스터디 플래너 (가방 속 하루 한 장). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   plannerDayOf  지금 시각이 어느 날 플래너인지. 하루는 새벽 5시에 시작(종이 플래너 시간표가 5시부터)
//   dayWindow     그날 플래너가 맡는 시간 (5시 ~ 다음 날 5시)
//   focusCells    공부 상태 구간(study_segments)의 집중(초록) 시간을 10분 칸 144개에 나눠 담음 → 시간표 자동 칠하기
//   totalFocusMs  그날 집중 시간 합 (TOTAL 칸)
//   normalizePlanner  DB 에 저장된 칸 내용(jsonb)을 화면이 쓰는 모양으로. 모양이 깨져도 빈 칸으로 채움
import type { SegmentKind } from '../study/segmentLogic'

export const DAY_START_HOUR = 5
export const HOURS = Array.from({ length: 24 }, (_, i) => (DAY_START_HOUR + i) % 24) // 시간표 줄: 5 … 23, 0 … 4
export const CELLS = 24 * 6 // 10분 칸
export const ROWS = 8 // 과목·할 일 줄 수
export const MAX_TEXT = 200 // 칸 하나에 쓸 수 있는 글자 수 (메모 칸은 MAX_MEMO)
export const MAX_MEMO = 1000
export const MOODS = 6 // 기분 얼굴 수 (0 화남 … 5 아주 좋음)
const MIN = 60000
const DAY = 24 * 60 * MIN

const pad = (n: number) => String(n).padStart(2, '0')
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function plannerDayOf(nowMs: number): string {
  const d = new Date(nowMs)
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return dayString(d)
}

function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export function dayWindow(day: string): { start: number; end: number } {
  const d = parseDay(day) ?? new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR).getTime()
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, DAY_START_HOUR).getTime() // 서머타임이 있어도 다음 날 5시
  return { start, end: next }
}

// 몇 시 몇 분이 몇 번째 칸인지 (5:00 → 0, 4:50 → 143)
export const cellIndex = (hour: number, minute: number) => ((hour - DAY_START_HOUR + 24) % 24) * 6 + Math.floor(minute / 10)

export const shiftDay = (day: string, by: number) => {
  const d = parseDay(day) ?? new Date()
  d.setDate(d.getDate() + by)
  return dayString(d)
}

type Seg = { kind: SegmentKind; subjectId: number | null; startedAt: number; endedAt: number } // 지운 과목은 null (#369)
export type FocusCell = { ms: number; subjectId: number | null } // ms 가 0 보다 큰데 subjectId 가 null 이면 지운 과목

export function focusCells(segments: Seg[], dayStart: number): FocusCell[] {
  const bySubject: Map<number | null, number>[] = Array.from({ length: CELLS }, () => new Map())
  for (const s of segments) {
    if (s.kind !== 'focus') continue
    let a = Math.max(s.startedAt, dayStart)
    const b = Math.min(s.endedAt, dayStart + DAY)
    while (a < b) {
      const i = Math.floor((a - dayStart) / (10 * MIN))
      const cellEnd = dayStart + (i + 1) * 10 * MIN
      const to = Math.min(b, cellEnd)
      const m = bySubject[i]
      m.set(s.subjectId, (m.get(s.subjectId) ?? 0) + (to - a))
      a = to
    }
  }
  return bySubject.map((m) => {
    let ms = 0
    let best: number | null = null
    let bestMs = 0
    for (const [id, v] of m) {
      ms += v
      if (v > bestMs) [best, bestMs] = [id, v]
    }
    return { ms, subjectId: best }
  })
}

export const totalFocusMs = (segments: Seg[], dayStart: number) => focusCells(segments, dayStart).reduce((a, c) => a + c.ms, 0)

export function formatHM(ms: number): string {
  const m = Math.floor(ms / MIN)
  return `${Math.floor(m / 60)}:${pad(m % 60)}`
}

export function ddayText(target: string, day: string): string {
  const a = parseDay(target)
  const b = parseDay(day)
  if (!a || !b) return ''
  const diff = Math.round((a.getTime() - b.getTime()) / DAY)
  return diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
export const weekdayOf = (day: string) => WEEKDAYS[(parseDay(day) ?? new Date()).getDay()]

// 과목 색은 study/subjectLogic.subjectColorOf (내 과목 순서로, 기록 도넛과 같은 색)
// 손으로 칠하는 형광펜 색
export const MARKERS = ['#f7d26b', '#f3a6b8', '#9fd6f0', '#a8dca0']

export type PlannerRow = { sub: string; topic: string; done: boolean }
export type PlannerData = {
  dday: { label: string; date: string } // D-day 이름·날짜
  wake: string // 기상 시각 "07:10"
  goal: string
  rows: PlannerRow[]
  mood: number | null
  memo: string
  marks: Record<number, number> // 손으로 칠한 칸: 칸 번호 → 형광펜 색 번호
}

const text = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '')

export function normalizePlanner(raw: unknown): PlannerData {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rows = Array.isArray(o.rows) ? o.rows : []
  const dd = o.dday && typeof o.dday === 'object' ? (o.dday as Record<string, unknown>) : {}
  const marks: Record<number, number> = {}
  if (o.marks && typeof o.marks === 'object') {
    for (const [k, v] of Object.entries(o.marks as Record<string, unknown>)) {
      const i = Number(k)
      if (Number.isInteger(i) && i >= 0 && i < CELLS && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MARKERS.length) marks[i] = v
    }
  }
  return {
    dday: { label: text(dd.label, 20), date: parseDay(text(dd.date)) ? text(dd.date) : '' },
    wake: /^\d{1,2}:\d{2}$/.test(text(o.wake)) ? text(o.wake) : '',
    goal: text(o.goal),
    rows: Array.from({ length: ROWS }, (_, i) => {
      const r = rows[i] && typeof rows[i] === 'object' ? (rows[i] as Record<string, unknown>) : {}
      return { sub: text(r.sub, 20), topic: text(r.topic), done: r.done === true }
    }),
    mood: typeof o.mood === 'number' && Number.isInteger(o.mood) && o.mood >= 0 && o.mood < MOODS ? o.mood : null,
    memo: text(o.memo, MAX_MEMO),
    marks,
  }
}
