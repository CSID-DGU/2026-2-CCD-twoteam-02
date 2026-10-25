// 내 기록의 하루 띠(#235): 저장된 상태 구간을 하루 범위로 자르고, 이어진 같은 종류를 한 칸으로 합칩니다.
// React·DB 와 무관한 순수 로직입니다. 구간을 만드는 쪽은 segmentLogic.ts 입니다.
import type { SegmentKind } from './segmentLogic'

export type SegmentRow = { id: number; kind: SegmentKind; subjectId: number; startedAt: number; endedAt: number } // 시각은 ms

// 한 칸. 5분 저장 경계에서 잘린 같은 종류의 구간들을 합친 것이라 원래 구간 번호(ids)를 같이 둡니다. (오판 신고 #121)
export type BandCell = { kind: SegmentKind; subjectId: number; startedAt: number; endedAt: number; ids: number[] }

// 공부 한 번: "공부 시작"부터 일어나거나 과목을 바꿀 때까지. 띠 한 줄이 된다.
export type BandRun = { subjectId: number; startedAt: number; endedAt: number; cells: BandCell[] }

// 빨강의 사유 (focusLogic 의 상태 이름과 같은 말)
export const KIND_LABEL: Record<SegmentKind, string> = {
  focus: '집중',
  away: '자리 이탈',
  drowsy: '졸음',
  offscreen: '다른 화면',
  phone: '휴대폰',
  outframe: '가이드라인 이탈',
  paused: '중지',
}

export const isGreen = (kind: SegmentKind) => kind === 'focus'

// 하루 시계의 과목 색: 띠의 초록(집중)·빨강(멈춤)과 헷갈리지 않게 그 계열은 뺍니다.
export const SUBJECT_COLORS = ['#3987e5', '#f59e0b', '#a78bfa', '#22d3ee', '#f472b6', '#facc15', '#94a3b8']

// 이 차이(ms) 안으로 붙어 있으면 같은 칸으로 이어 봅니다. (저장 시각을 초 단위로 다루며 생기는 틈)
const JOIN_MS = 1000

// 하루 범위로 자르고 시각 순서로 정렬한 뒤, 이어진 같은 종류를 한 칸으로 합칩니다.
export function toCells(rows: SegmentRow[], dayStart: number, dayEnd: number): BandCell[] {
  const cells: BandCell[] = []
  const sorted = [...rows].sort((a, b) => a.startedAt - b.startedAt)
  for (const r of sorted) {
    const startedAt = Math.max(r.startedAt, dayStart)
    const endedAt = Math.min(r.endedAt, dayEnd)
    if (endedAt <= startedAt) continue
    const last = cells.at(-1)
    if (last && last.kind === r.kind && last.subjectId === r.subjectId && startedAt - last.endedAt <= JOIN_MS) {
      last.endedAt = Math.max(last.endedAt, endedAt)
      last.ids.push(r.id)
    } else {
      cells.push({ kind: r.kind, subjectId: r.subjectId, startedAt, endedAt, ids: [r.id] })
    }
  }
  return cells
}

// 공부 한 번씩 나눕니다. 공부하는 동안은 구간이 빈틈없이 이어지므로, 틈이 생기거나 과목이 바뀌면 다른 공부입니다.
export function toRuns(cells: BandCell[]): BandRun[] {
  const runs: BandRun[] = []
  for (const c of cells) {
    const last = runs.at(-1)
    if (last && last.subjectId === c.subjectId && c.startedAt - last.endedAt <= JOIN_MS) {
      last.cells.push(c)
      last.endedAt = Math.max(last.endedAt, c.endedAt)
    } else {
      runs.push({ subjectId: c.subjectId, startedAt: c.startedAt, endedAt: c.endedAt, cells: [c] })
    }
  }
  return runs
}

// 종류별 합계(초). 집중이 맨 앞, 나머지는 긴 순서
export function totalsByKind(cells: BandCell[]): { kind: SegmentKind; seconds: number }[] {
  const map = new Map<SegmentKind, number>()
  for (const c of cells) map.set(c.kind, (map.get(c.kind) ?? 0) + (c.endedAt - c.startedAt) / 1000)
  return [...map]
    .map(([kind, seconds]) => ({ kind, seconds: Math.round(seconds) }))
    .sort((a, b) => (isGreen(b.kind) ? 1 : 0) - (isGreen(a.kind) ? 1 : 0) || b.seconds - a.seconds)
}

// 초 → "1초 미만", "45초", "12분", "1시간 5분" (짧은 빨강도 보이도록 1분 미만은 초로)
export function formatSpan(seconds: number): string {
  if (seconds < 1) return '1초 미만'
  if (seconds < 60) return `${Math.round(seconds)}초`
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h === 0) return `${m}분`
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

// ms → "13:05", 초까지 보려면 "13:05:42"
export const clock = (ms: number, seconds = false) =>
  new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false })
