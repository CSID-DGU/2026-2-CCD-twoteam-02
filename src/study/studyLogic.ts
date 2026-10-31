// 공부 기록을 몇 분 단위 조각으로 나눠 저장하기 위한 계산. React·DB 와 무관한 순수 로직입니다.
//
// study_logs 는 "추가만 되고 수정·삭제는 안 되는" 테이블입니다(0004 RLS, 실험 데이터라 일부러 그렇게 둠).
// 그래서 한 줄을 계속 고치는 대신 일정 시간마다 새 줄을 쌓고, 화면에서는 줄들을 합쳐 보여 줍니다.
// 창이 갑자기 닫혀도 잃는 기록은 마지막 조각(최대 SAVE_INTERVAL_MS) 하나뿐입니다.

export const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 이 간격마다 한 조각을 저장합니다.
export const MIN_CHUNK_MS = 1000; // 이보다 짧은 조각은 저장하지 않습니다. (앉자마자 일어난 경우 등)

// 공부 시작 창에서 켠 허용을 study_logs.devices(text[])에 담는 값. 켠 것만 넣습니다. (#172)
//   other_screen: ⓐ 다른 탭·앱 사용함 (다른 화면 판정 끔)
//   learning_device: ⓑ 휴대폰·학습기기 사용함 (휴대폰 판정 끔)
export const OTHER_SCREEN = 'other_screen'
export const LEARNING_DEVICE = 'learning_device'

export type Allowed = { allowOtherScreen: boolean; allowDevices: boolean }

export const devicesOf = (choice: Allowed): string[] => [
  ...(choice.allowOtherScreen ? [OTHER_SCREEN] : []),
  ...(choice.allowDevices ? [LEARNING_DEVICE] : []),
]

// 저장된 devices 를 두 허용으로 되돌립니다.
// 2026-10-21 이전 기록은 체크 하나('학습기기 사용함')가 둘 다 허용했고 learning_device 하나만 저장됐으므로,
// other_screen 없이 learning_device 만 있으면 둘 다 켠 것으로 읽습니다.
export function allowedOf(devices: string[]): Allowed {
  const otherScreen = devices.includes(OTHER_SCREEN)
  const learning = devices.includes(LEARNING_DEVICE)
  if (learning && !otherScreen) return { allowOtherScreen: true, allowDevices: true }
  return { allowOtherScreen: otherScreen, allowDevices: learning }
}

// 아직 저장하지 않은 구간
export type ChunkState = {
  startedAt: number // 이 조각이 시작된 시각(ms)
  savedStudyMs: number // 지금까지 저장한 집중 시간. 타이머 값에서 이만큼 빼면 이번 조각 몫입니다.
}

// 저장할 한 줄
export type ChunkRow = {
  startedAt: number
  endedAt: number
  focusedSeconds: number
}

export const startChunk = (now: number, studyMs = 0): ChunkState => ({ startedAt: now, savedStudyMs: studyMs })

// 지금까지의 구간을 한 줄로 잘라 냅니다. 너무 짧으면 row 는 null 이고 상태도 그대로입니다.
// 초 단위로 반올림하고 남거나 모자란 밀리초는 다음 조각으로 넘겨서, 여러 조각을 합쳐도 시간이 빠지거나 늘지 않게 합니다.
// (내림이면 마지막 조각에서 최대 1초가 항상 빠지지만, 반올림이면 오차가 ±0.5초 안에서 어느 쪽으로도 치우치지 않습니다.)
export function takeChunk(state: ChunkState, studyMs: number, now: number): { row: ChunkRow | null; next: ChunkState } {
  if (now - state.startedAt < MIN_CHUNK_MS) return { row: null, next: state }
  const focusedSeconds = Math.max(0, Math.round((studyMs - state.savedStudyMs) / 1000))
  return {
    row: { startedAt: state.startedAt, endedAt: now, focusedSeconds },
    next: { startedAt: now, savedStudyMs: state.savedStudyMs + focusedSeconds * 1000 },
  }
}

// 저장할 때(5분)가 되어도 보류 중(노란불)이면 조각을 자르지 않고 보류가 끝날 때까지 기다립니다.
// 보류 시간은 돌아오는 순간 한꺼번에 확정되므로, 보류 중에 자르면 앞 조각의 보류분이 다음 조각에 몰려
// 다음 조각의 공부 시간이 조각 길이를 넘고 DB 검사(0040, 공부한 초 ≤ 조각 길이)에 걸려 그 조각이 통째로 저장되지 않았습니다.
// 보류는 길어야 1분(AWAY_SECONDS)이라 그만큼만 늦어집니다. 멈춤(중지·쉬는 시간) 중에는 보류가 확정되지 않고 버려지므로 바로 자릅니다.
export const canCutChunk = (pendingMs: number, halted: boolean) => halted || pendingMs <= 0

// 밀리초 → "01:02:03"
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}
