// 운영 기록을 보내기 전까지 메모리에 모아 두는 곳 (#590).
// Supabase 를 모릅니다. 보내기는 telemetry.ts 가 1분마다 drain 해서 합니다.
//   에러  recordError — 요청 감시(opsFetch), 실시간 연결, 화면 오류가 부름
//   FPS   fpsStart → 프레임마다 fpsFrame → fpsStop — 장면의 OpsFpsProbe 가 부름
import { addError, createFpsAcc, drainErrors, endFps, placeOfPath, stepFps } from './opsLogic.ts'
import type { ErrorBook, ErrorRow, FpsAcc, FpsRow, OpsError } from './opsLogic.ts'

const MAX_PENDING_FPS = 120 // 보내지 못한 FPS 줄은 두 시간치까지만 들고 있음

let acc: FpsAcc | null = null
let clock = 0 // FPS 시각(ms): 시작 시각 + 프레임 간격의 합. 숨은 탭에서 돌아온 간격도 더해 벽시계와 맞춤
const doneFps: FpsRow[] = []
const book: ErrorBook = new Map()
let gpu = ''

// 지금 주소로 정한 장소 (/space → space)
const herePlace = () => placeOfPath(typeof location === 'undefined' ? '/' : location.pathname)

// detail·place 는 없으면 빈 문자열·지금 장소
export function recordError(e: Omit<OpsError, 'place' | 'detail'> & { place?: string; detail?: string }): void {
  addError(book, { ...e, detail: e.detail ?? '', place: e.place ?? herePlace() }, Date.now())
}

function keep(row: FpsRow | null) {
  if (!row) return
  doneFps.push(row)
  if (doneFps.length > MAX_PENDING_FPS) doneFps.shift()
}

export function fpsStart(place: string): void {
  fpsStop()
  clock = Date.now()
  acc = createFpsAcc(place, clock)
}

export function fpsFrame(dt: number): void {
  if (!acc) return
  clock += dt * 1000
  keep(stepFps(acc, dt, clock))
}

export function fpsStop(): void {
  if (!acc) return
  keep(endFps(acc))
  acc = null
}

export const setGpu = (name: string) => {
  gpu = name
}
export const getGpu = () => gpu

// 보낼 것을 꺼냄. all(창을 숨기거나 닫을 때)이면 아직 끝나지 않은 지금 분도 잘라서 꺼냄
export function drain(nowMs: number, all: boolean): { fps: FpsRow[]; errors: ErrorRow[] } {
  if (all && acc) keep(endFps(acc))
  return { fps: doneFps.splice(0), errors: drainErrors(book, nowMs, all) }
}

// 로그인 전에 모인 것처럼 보내지 않을 기록을 버림
export function clearAll(): void {
  doneFps.length = 0
  book.clear()
}
