// 가방 속 시계(스톱워치·알람). React 와 무관한 순수 로직입니다. (Node 로 검사)
// 설계: docs/superpowers/specs/2026-11-02-bag-clock-design.md
//
// 시간은 "시각(ms)" 기준으로 저장합니다(1초마다 더하는 방식이 아님). 탭이 숨겨져 타이머가 늦어지거나
// 새로고침해도, 지금 시각과 비교하면 늘 맞는 값이 나옵니다.
//
//   swElapsed / swToggle / swReset   스톱워치 경과·시작/멈춤·처음으로 (도는 중엔 처음으로 안 됨)
//   parseMinutes                     "몇 분 뒤" 입력 검사 (정수 1~MAX_MINUTES)
//   alarmAfter / alarmAt             몇 분 뒤 알람 / 시각 알람 (지났거나 지금이면 다음 날)
//   remainingMs                      알람까지 남은 시간
//   formatSw / formatRemain          판에 쓰는 글자
//   ringText                         울릴 때 창에 쓰는 글
//   parseClockState                  localStorage 값 검사 (깨진 칸은 처음 값으로)

export const MAX_MINUTES = 600 // 몇 분 뒤 알람 최대 (10시간)
export const QUICK_MINUTES = [5, 10, 25, 40, 50] // 빠른 버튼
export const SOUND_STOP_MS = 60_000 // 울리기 시작하고 이만큼 지나면 소리만 저절로 멈춤 (끄기 창은 남음)

export type Stopwatch = { startedAt: number | null; accMs: number } // 돌고 있으면 startedAt 에 시작 시각
export type Alarm = { at: number; kind: 'after' | 'at'; minutes: number | null }
export type ClockState = { sw: Stopwatch; alarm: Alarm | null; ringing: Alarm | null }

export const INITIAL_CLOCK: ClockState = { sw: { startedAt: null, accMs: 0 }, alarm: null, ringing: null }

export const swElapsed = (sw: Stopwatch, now: number) => sw.accMs + (sw.startedAt === null ? 0 : Math.max(0, now - sw.startedAt))

export function swToggle(sw: Stopwatch, now: number): Stopwatch {
  return sw.startedAt === null ? { startedAt: now, accMs: sw.accMs } : { startedAt: null, accMs: swElapsed(sw, now) }
}

export const swReset = (sw: Stopwatch): Stopwatch => (sw.startedAt === null ? { startedAt: null, accMs: 0 } : sw)

export function parseMinutes(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text.trim())
  return n >= 1 && n <= MAX_MINUTES ? n : null
}

export const alarmAfter = (minutes: number, now: number): Alarm => ({ at: now + minutes * 60_000, kind: 'after', minutes })

export function alarmAt(hhmm: string, now: number): Alarm | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(now)
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min)
  if (at.getTime() <= now) at.setDate(at.getDate() + 1) // 지났거나 바로 지금이면 다음 날 그 시각
  return { at: at.getTime(), kind: 'at', minutes: null }
}

export const remainingMs = (alarm: Alarm, now: number) => Math.max(0, alarm.at - now)

const pad = (n: number) => String(n).padStart(2, '0')

export function formatSw(ms: number): { main: string; sub: string } {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return { main: `${h}:${pad(m)}:${pad(s)}`, sub: '' }
  return { main: `${pad(m)}:${pad(s)}`, sub: `.${pad(Math.floor((ms % 1000) / 10))}` }
}

export function formatRemain(ms: number): string {
  const total = Math.ceil(ms / 1000) // 남은 시간은 올림 (0:00 이 되는 순간 울림)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export const clockText = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const ringText = (alarm: Alarm) => (alarm.kind === 'after' ? `${alarm.minutes}분 지났어요 (${clockText(alarm.at)})` : `${clockText(alarm.at)} 이에요`)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseAlarm(v: unknown): Alarm | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isNum(o.at) || (o.kind !== 'after' && o.kind !== 'at')) return null
  const minutes = isNum(o.minutes) && o.minutes >= 1 && o.minutes <= MAX_MINUTES ? o.minutes : null
  if (o.kind === 'after' && minutes === null) return null
  return { at: o.at, kind: o.kind, minutes: o.kind === 'after' ? minutes : null }
}

export function parseClockState(raw: unknown): ClockState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const s = o.sw && typeof o.sw === 'object' ? (o.sw as Record<string, unknown>) : {}
  const sw: Stopwatch =
    (s.startedAt === null || isNum(s.startedAt)) && isNum(s.accMs) && s.accMs >= 0
      ? { startedAt: s.startedAt as number | null, accMs: s.accMs }
      : { ...INITIAL_CLOCK.sw }
  return { sw, alarm: parseAlarm(o.alarm), ringing: parseAlarm(o.ringing) }
}
