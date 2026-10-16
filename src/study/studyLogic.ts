// 공부 기록을 몇 분 단위 조각으로 나눠 저장하기 위한 계산. React·DB 와 무관한 순수 로직입니다.
//
// study_logs 는 "추가만 되고 수정·삭제는 안 되는" 테이블입니다(0004 RLS, 실험 데이터라 일부러 그렇게 둠).
// 그래서 한 줄을 계속 고치는 대신 일정 시간마다 새 줄을 쌓고, 화면에서는 줄들을 합쳐 보여 줍니다.
// 창이 갑자기 닫혀도 잃는 기록은 마지막 조각(최대 SAVE_INTERVAL_MS) 하나뿐입니다.

export const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 이 간격마다 한 조각을 저장합니다.
export const MIN_CHUNK_MS = 1000; // 이보다 짧은 조각은 저장하지 않습니다. (앉자마자 일어난 경우 등)

// 학습기기 사용 여부를 study_logs.devices(text[])에 담는 값.
// 지금은 켜기·끄기뿐이라 하나만 쓰고, 나중에 기기 종류를 나누면 값을 늘립니다.
export const LEARNING_DEVICE = 'learning_device'
export const devicesOf = (allowDevices: boolean) => (allowDevices ? [LEARNING_DEVICE] : [])

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

// 밀리초 → "01:02:03"
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}
