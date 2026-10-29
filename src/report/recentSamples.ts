// 신고(#121)에 붙이는 최근 30초 판정 수치. 영상은 없고 수치만 둡니다.
//
// 판정 상태는 StudyRunner 안에, 얼굴·몸·휴대폰 수치는 SeatedStudy 의 ref 에 있고, 신고 창(메뉴 창)은 둘 다 모릅니다.
// prop 을 세 단계로 끌어올리는 대신 이 모듈이 "최근 수치"를 들고 있고, StudyRunner 가 1초마다 넣습니다(useSampleRecorder).
// 비우기는 시각으로 합니다: 읽을 때 30초 안의 줄만 돌려줍니다. StudyRunner 는 과목·허용 설정을 바꿀 때마다
// 다시 마운트되는데, 그때 지우면 신고 직전 수치가 사라지기 때문입니다. 자리를 떠나 30초가 지나면 저절로 빕니다.
import type { FocusStatus } from '../focus/focusLogic'

export const SAMPLE_WINDOW_MS = 30_000 // 신고에 붙이는 최근 수치 범위
export const SAMPLE_CAPACITY = 30 // 1초 간격이면 30초

export type Sample = {
  at: number // 기록 시각 (Date.now)
  status: FocusStatus
  hold: 'face' | 'eyes' | 'frame' | 'phone' | null // 보류 이유 (focusLogic.holdReason)
  face: boolean // 얼굴 찾음
  pitch: number | null // 고개 위아래 (도, 소수 1자리. 숙이면 +)
  ear: number | null // 눈 크기 (소수 2자리)
  body: boolean | null // 몸(Pose) 찾음, null = 모름
  framed: boolean | null // 머리~가슴이 화면 안, null = 모름
  phone: boolean | null // 휴대폰 보임, null = 감지 안 함
  awaySeconds: number
  closedSeconds: number
  phoneSeconds: number
}

// 공부 중일 때만 있는 값. 신고 창이 context 에 같이 넣습니다.
export type StudyContext = { allowOtherScreen: boolean; allowDevices: boolean; sessionId: string }

// 고리 버퍼: 칸 30개를 돌려 쓰고, 가득 차면 가장 오래된 칸에 덮어씁니다.
const ring: (Sample | undefined)[] = new Array(SAMPLE_CAPACITY)
let writeAt = 0 // 다음에 쓸 칸
let count = 0 // 들어 있는 줄 수 (최대 SAMPLE_CAPACITY)
let study: StudyContext | null = null
let studyEndedAt: number | null = null // 공부 화면이 사라진 시각. null = 아직 공부 중

export function pushSample(sample: Sample): void {
  ring[writeAt] = sample
  writeAt = (writeAt + 1) % SAMPLE_CAPACITY
  if (count < SAMPLE_CAPACITY) count++
}

// 지금(nowMs)부터 30초 안의 줄만 시간순으로
export function recentSamples(nowMs: number): Sample[] {
  const start = (writeAt - count + SAMPLE_CAPACITY) % SAMPLE_CAPACITY // 가장 오래된 칸
  const ordered: Sample[] = []
  for (let i = 0; i < count; i++) {
    const s = ring[(start + i) % SAMPLE_CAPACITY]
    if (s) ordered.push(s)
  }
  return ordered.filter((s) => s.at > nowMs - SAMPLE_WINDOW_MS)
}

// 공부를 시작하면(또는 허용 설정이 바뀌면) 맥락을 새로 둡니다.
export function setStudyContext(ctx: StudyContext | null): void {
  study = ctx
  studyEndedAt = null
}

// 공부 화면이 사라질 때. 바로 지우지 않고 시각만 적어 둡니다.
// 일어난 직후 신고에도 샘플과 같은 30초 동안은 좌석·허용 설정이 붙어야 수치와 짝이 맞기 때문입니다.
export function endStudyContext(endedAtMs: number): void {
  studyEndedAt = endedAtMs
}

// 공부 중이거나 끝난 지 30초 안이면 맥락, 아니면 null (샘플과 같은 기준: endedAt > now - 30000)
export function currentStudyContext(nowMs: number): StudyContext | null {
  if (study === null) return null
  if (studyEndedAt !== null && !(studyEndedAt > nowMs - SAMPLE_WINDOW_MS)) return null
  return study
}

// 시험용. 화면 코드에서는 부르지 않습니다 (비우기는 시각으로).
export function clearSamples(): void {
  ring.fill(undefined)
  writeAt = 0
  count = 0
}
