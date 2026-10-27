// 기록 재생 모드 (#195). 화면·React와 무관한 값과 계산입니다. (Node로 검사 — 타입 말고는 다른 파일을 import하지 않음)
//
// C 조건의 팀원 캐릭터는 실시간 접속이 아니라 기록 재생입니다(실험 문서 4절). 팀원 계정으로 로그인한 재생 화면이
// 기록 모드(#190)가 만든 파일을 읽어, 기록 시각(t)에 맞는 값을 평소처럼 다른 참여자에게 보냅니다.
// 서버는 바꾸지 않습니다. 계정 번호(userId)만 이 재생 계정 것으로 바꿔 끼웁니다.
//
// 시각: 세 재생 화면이 같은 컴퓨터 시계(Date.now)로 같은 시작 시각을 기다렸다가 함께 시작합니다.
// (진행자 시작 신호 #196 이 생기기 전까지의 방법)
import type { PresenceState } from '../realtime/participants'
import type { RecordFile, RecordSample } from '../recording/recordLogic'

export const READ_VERSIONS = [1, 2] // 읽을 수 있는 기록 파일 버전 (recordLogic 의 FILE_VERSION)
export const TICK_MS = 250 // 재생 간격. 기록 간격(RECORD_INTERVAL_MS)과 같게

// 전송 끊김 (실험 문서 6-3절): 재생 화면의 전송이 30초 넘게 끊기면 그 세션의 C 는 결측입니다.
// 가만히 있으면 2초(RESEND_IDLE_MS)마다만 보내므로, 그보다 넉넉히 긴 끊김만 기록에 남깁니다.
export const MAX_SEND_GAP_SEC = 30
export const LOG_GAP_MS = 3000

// ---- 파일 읽기 ----

// 기록 파일 글자를 읽어 검사합니다. 문제가 있으면 한국어 안내문을 돌려줍니다.
export function parseRecordFile(text: string): RecordFile | string {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'JSON 파일이 아니에요. 기록 모드에서 내려받은 파일을 골라 주세요.'
  }
  const f = data as Partial<RecordFile>
  if (typeof f !== 'object' || f === null || !Array.isArray(f.samples)) return '기록 파일 모양이 아니에요.'
  if (!READ_VERSIONS.includes(f.version as number)) return `읽을 수 없는 기록 파일 버전이에요 (${String(f.version)}).`
  if (!Number.isInteger(f.seat) || (f.seat as number) <= 0) return '기록 파일에 자리 번호가 없어요.'
  if (f.samples.length === 0) return '기록이 비어 있어요.'
  if (typeof f.branch !== 'string') return '기록 파일에 지점이 없어요.'
  return f as RecordFile
}

// ---- 시각에 맞는 값 ----

// 기록 시각 t(ms) 이하인 마지막 기록의 번호. 처음보다 앞이면 0, 끝을 넘으면 마지막.
export function sampleIndexAt(samples: readonly RecordSample[], t: number): number {
  let lo = 0
  let hi = samples.length - 1
  if (t <= samples[0].t) return 0
  if (t >= samples[hi].t) return hi
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (samples[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

// 재생을 시작하고 elapsedMs 가 지났을 때 보낼 값. 시작 전(음수)은 첫 장면, 끝난 뒤는 마지막 장면입니다.
export function stateAt(file: RecordFile, elapsedMs: number, userId: string): PresenceState {
  const { t: _t, ...rest } = file.samples[sampleIndexAt(file.samples, elapsedMs)]
  void _t
  return { ...rest, userId }
}

// 기록 길이(ms). 마지막 기록의 시각입니다.
export const lengthOf = (file: RecordFile) => file.samples[file.samples.length - 1].t

// ---- 시작 시각 ----

// "15:00" 또는 "15:00:30" → 오늘 그 시각(ms). 모양이 틀리면 null
export function parseStartTime(text: string, now: Date): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
  if (h > 23 || min > 59 || sec > 59) return null
  const d = new Date(now)
  d.setHours(h, min, sec, 0)
  return d.getTime()
}

// ---- 전송 끊김 ----

export type SendGap = { from: number; to: number } // 끊긴 동안 (ms, Date.now 기준)

export type SendStats = {
  count: number // 보낸 횟수
  lastAt: number | null // 마지막으로 보낸 시각
  longestMs: number // 가장 길게 끊긴 시간
  gaps: SendGap[] // LOG_GAP_MS 넘게 끊긴 구간
}

export const initialSendStats: SendStats = { count: 0, lastAt: null, longestMs: 0, gaps: [] }

// 한 번 보낼 때마다 부릅니다.
export function nextSendStats(prev: SendStats, at: number): SendStats {
  const gap = prev.lastAt === null ? 0 : at - prev.lastAt
  return {
    count: prev.count + 1,
    lastAt: at,
    longestMs: Math.max(prev.longestMs, gap),
    gaps: gap > LOG_GAP_MS && prev.lastAt !== null ? [...prev.gaps, { from: prev.lastAt, to: at }] : prev.gaps,
  }
}

// 지금까지 이어진 끊김까지 넣은 가장 긴 끊김 (아직 다음 전송이 없어도 셉니다)
export function longestGapNow(stats: SendStats, now: number): number {
  return Math.max(stats.longestMs, stats.lastAt === null ? 0 : now - stats.lastAt)
}

// 결측 기준을 넘었는지
export const sendGapTooLong = (stats: SendStats, now: number) => longestGapNow(stats, now) >= MAX_SEND_GAP_SEC * 1000

export type ReplayLog = {
  nickname: string // 재생 계정 닉네임
  file: string // 재생한 기록 파일 이름
  seat: number
  startedAt: number // 재생 시작 시각 (ms)
  endedAt: number // 재생을 끝낸 시각 (ms)
  stats: SendStats
}

const iso = (ms: number) => new Date(ms).toISOString()

// 끊김 기록 CSV: 요약 한 줄 + 끊긴 구간마다 한 줄
export function replayLogCsv(log: ReplayLog): string {
  const { stats } = log
  const longestSec = (longestGapNow(stats, log.endedAt) / 1000).toFixed(1)
  const missing = sendGapTooLong(stats, log.endedAt) ? 'yes' : 'no'
  const rows = [
    'kind,nickname,file,seat,from,to,seconds,sends,missing',
    ['summary', log.nickname, log.file, log.seat, iso(log.startedAt), iso(log.endedAt), longestSec, stats.count, missing].join(','),
    ...stats.gaps.map((g) =>
      ['gap', log.nickname, log.file, log.seat, iso(g.from), iso(g.to), ((g.to - g.from) / 1000).toFixed(1), '', ''].join(','),
    ),
  ]
  return rows.join('\n')
}

// 끊김 기록 파일 이름: replay-참여자 1-seat18-20261027-1500.csv
export function replayLogName(log: ReplayLog): string {
  const d = new Date(log.startedAt)
  const two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
  return `replay-${log.nickname}-seat${log.seat}-${stamp}.csv`
}
