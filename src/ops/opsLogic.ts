// 운영 대시보드(#590)에 보낼 기록을 정리하는 순수 로직. React·Supabase 와 무관합니다.
//
// 화면은 두 가지를 1분 단위로 요약해 보냅니다.
//   FPS   한 사람의 1분(장소별) 한 줄: 평균·최저, 30FPS 미만이었던 초, 실제로 잰 초
//   에러  1분 동안 같은 에러(종류·코드·대상·장소)를 묶어 "몇 번"
// 웹캠·트래킹 수치·요청 본문·입력한 글은 보내지 않습니다. 에러 메시지는 입력값이 들어가는 부분을 지운 앞부분만 남깁니다.
// 상한(줄 수·횟수·길이)은 DB(0071)에도 똑같이 걸려 있습니다. 여기서 먼저 잘라 거절당하지 않게 합니다.

export const FPS_TARGET = 30 // 제안서 목표. 이보다 낮으면 끊긴 것으로 봄
export const WINDOW_S = 0.5 // 이 시간마다 FPS 를 한 번 계산 (FpsProbe 와 같음)
export const MAX_GAP_S = 1 // 프레임 간격이 이보다 길면 다른 탭·창 최소화로 보고 버림
export const WARMUP_S = 5 // 장면을 처음 연 뒤 이 시간은 불러오기 끊김이라 세지 않음
export const MIN_SECONDS = 5 // 1분 동안 잰 시간이 이보다 짧으면 줄을 만들지 않음
export const OUTLIER_LOW_SECONDS = 10 // 1분 중 30 미만이 이만큼이면 이상치 (DB 의 ops_dashboard 와 같음)
export const FLUSH_MS = 60_000 // 보내는 간격
export const MAX_FPS_ROWS = 5 // 한 번에 보내는 FPS 줄
export const MAX_ERROR_ROWS = 30 // 한 번에 보내는 에러 줄 = 한 분에 모으는 서로 다른 에러
export const COUNT_MAX = 10_000 // 한 에러의 1분 횟수 상한
export const DETAIL_MAX = 120
export const TARGET_MAX = 80
export const PLACE_MAX = 40
export const GPU_MAX = 80
const CODE_MAX = 16

export type ErrorKind = 'supabase' | 'relay' | 'realtime' | 'js'
export type OpsError = { kind: ErrorKind; code: string; target: string; detail: string; place: string }
export type ErrorRow = OpsError & { minute: string; count: number }
export type FpsRow = { minute: string; place: string; fps_avg: number; fps_min: number; low_seconds: number; seconds: number }
export type Device = { browser: string; os: string; mobile: boolean; cores: number; gpu: string; version: string }

// 분으로 자른 시각 (ISO)
export function minuteOf(ms: number): string {
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIXES: [string, string][] = [
  ['/rest/v1/rpc/', 'rpc/'],
  ['/rest/v1/', 'rest/'],
  ['/auth/v1/', 'auth/'],
  ['/storage/v1/', 'storage/'],
  ['/functions/v1/', 'fn/'],
]

// 요청 주소 → 짧은 대상 이름 (rpc/assign_seat, rest/meetings). 쿼리는 버리고 숫자·UUID 칸은 :id 로 (누구의 무엇인지 남기지 않음)
export function normalizeTarget(url: string): string {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return ''
  }
  const prefix = PREFIXES.find(([p]) => path.startsWith(p))
  const rest = prefix ? prefix[1] + path.slice(prefix[0].length) : path.replace(/^\/+/, '')
  return rest
    .split('/')
    .map((s) => (/^\d+$/.test(s) || UUID.test(s) ? ':id' : s))
    .join('/')
    .slice(0, TARGET_MAX)
}

// 주소의 첫 칸으로 장소를 정함 (/ → plaza, /space → space, /meeting/12 → meeting)
export function placeOfPath(pathname: string): string {
  return (pathname.split('/')[1] || 'plaza').slice(0, PLACE_MAX)
}

// 에러 메시지에서 사용자가 넣은 값을 지움: Key (nickname)=(민지), 이메일
export function scrubDetail(text: string): string {
  return text
    .replace(/Key \([^)]*\)=\([^)]*\)\s*/g, '')
    .replace(/"[^"]*@[^"]*"/g, '"…"')
    .replace(/'[^']*@[^']*'/g, "'…'")
    .replace(/\S+@\S+/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DETAIL_MAX)
}

// 에러 응답(JSON)에서 번호와 메시지. PostgREST 는 {code, message}, 로그인(Auth)은 {error_code, msg}
export function errorDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  const code = b.code ?? b.error_code ?? b.error
  const message = b.message ?? b.msg ?? b.error_description
  const parts = [code, message].filter((v) => typeof v === 'string' || typeof v === 'number').map(String)
  return scrubDetail(parts.join(' '))
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/Whale\//, 'Whale'],
  [/SamsungBrowser\//, 'Samsung'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
]

// 기기 정보. 어떤 기기에서 끊기는지 찾는 데만 쓰고, 계정과 묶어 보지 않습니다.
export function deviceFrom(ua: string, cores: number, gpu: string, version: string): Device {
  return {
    browser: BROWSERS.find(([re]) => re.test(ua))?.[1] ?? '기타',
    os: SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? '기타',
    mobile: /Mobi|Android|iPhone|iPad/.test(ua),
    cores,
    gpu: gpu.slice(0, GPU_MAX),
    version,
  }
}

// FPS 누적기. 장면 하나를 보는 동안 쓰고, 분이 바뀔 때마다 한 줄씩 내놓습니다.
export type FpsAcc = {
  place: string
  minute: string // 지금 모으는 분
  warm: number // 지금까지 버린 시작 시간(초)
  winFrames: number
  winTime: number
  sum: number // FPS × 시간 합 (시간 가중 평균용)
  seconds: number
  min: number
  low: number
}

export function createFpsAcc(place: string, nowMs: number): FpsAcc {
  return { place, minute: minuteOf(nowMs), warm: 0, winFrames: 0, winTime: 0, sum: 0, seconds: 0, min: Infinity, low: 0 }
}

function takeRow(acc: FpsAcc): FpsRow | null {
  const row =
    acc.seconds < MIN_SECONDS
      ? null
      : {
          minute: acc.minute,
          place: acc.place.slice(0, PLACE_MAX),
          fps_avg: Math.round(acc.sum / acc.seconds),
          fps_min: Math.round(acc.min),
          low_seconds: Math.min(60, Math.round(acc.low)),
          seconds: Math.min(60, Math.max(1, Math.round(acc.seconds))),
        }
  acc.sum = 0
  acc.seconds = 0
  acc.min = Infinity
  acc.low = 0
  return row
}

// 프레임 하나. dt 는 직전 프레임과의 간격(초). 분이 바뀌면 끝난 분의 줄을 돌려줍니다.
export function stepFps(acc: FpsAcc, dt: number, nowMs: number): FpsRow | null {
  if (!(dt > 0) || dt > MAX_GAP_S) {
    // 다른 탭에 있었거나 창이 멈췄던 간격: 0FPS 로 세지 않고 지금 0.5초 구간만 버림
    acc.winFrames = 0
    acc.winTime = 0
    return null
  }
  if (acc.warm < WARMUP_S) {
    acc.warm += dt
    return null
  }
  acc.winFrames += 1
  acc.winTime += dt
  if (acc.winTime < WINDOW_S) return null
  const time = acc.winTime
  const fps = acc.winFrames / time
  acc.winFrames = 0
  acc.winTime = 0
  const minute = minuteOf(nowMs)
  let done: FpsRow | null = null
  if (minute !== acc.minute) {
    done = takeRow(acc)
    acc.minute = minute
  }
  acc.sum += fps * time
  acc.seconds += time
  acc.min = Math.min(acc.min, fps)
  if (fps < FPS_TARGET) acc.low += time
  return done
}

// 장면을 떠날 때: 지금까지 모은 분을 줄로
export function endFps(acc: FpsAcc): FpsRow | null {
  return takeRow(acc)
}

// 에러 묶음. 키는 분|종류|코드|대상|장소
export type ErrorBook = Map<string, ErrorRow>

export function addError(book: ErrorBook, e: OpsError, nowMs: number): void {
  const row: ErrorRow = {
    minute: minuteOf(nowMs),
    kind: e.kind,
    code: e.code.slice(0, CODE_MAX) || '?',
    target: e.target.slice(0, TARGET_MAX),
    detail: e.detail.slice(0, DETAIL_MAX),
    place: e.place.slice(0, PLACE_MAX),
    count: 1,
  }
  const key = [row.minute, row.kind, row.code, row.target, row.place].join('|')
  const had = book.get(key)
  if (had) {
    had.count = Math.min(COUNT_MAX, had.count + 1)
    if (!had.detail && row.detail) had.detail = row.detail
    return
  }
  let same = 0
  for (const r of book.values()) if (r.minute === row.minute) same += 1
  if (same >= MAX_ERROR_ROWS) return // 폭주: 이 분에는 더 받지 않음
  book.set(key, row)
}

// 보낼 줄을 꺼냄. all 이 아니면 아직 끝나지 않은 지금 분은 남김
export function drainErrors(book: ErrorBook, nowMs: number, all: boolean): ErrorRow[] {
  const current = minuteOf(nowMs)
  const out: ErrorRow[] = []
  for (const [key, row] of book) {
    if (!all && row.minute >= current) continue
    out.push(row)
    book.delete(key)
  }
  return out
}

// 그래프용: 빈 시간대를 empty 로 채움. DB 는 +00:00, 화면은 Z 로 적으므로 시각은 숫자로 맞춤
export function fillSeries<T extends { t: string }>(points: T[], fromMs: number, toMs: number, bucketSec: number, empty: (t: string) => T): T[] {
  const step = bucketSec * 1000
  const byTime = new Map(points.map((p) => [Date.parse(p.t), p]))
  const out: T[] = []
  for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) out.push(byTime.get(t) ?? empty(new Date(t).toISOString()))
  return out
}
