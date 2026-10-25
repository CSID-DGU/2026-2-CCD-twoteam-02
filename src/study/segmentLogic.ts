// 공부 상태 구간 (내 기록의 하루 띠, #235). 화면·React와 무관한 순수 로직입니다.
//
// 판정(focusLogic)이 바뀔 때마다 넣어 주면, "언제부터 언제까지 어떤 상태였는지"를 구간으로 모읍니다.
//   초록 = focus: 타이머(studyMs)에 들어간 시간
//   빨강 = 그 밖: 타이머가 멈춘 시간과 그 사유 (away·drowsy·offscreen·phone·outframe)
//
// 노란불(보류)은 상태값이 focus 라서 상태만 보면 초록으로 잘못 기록됩니다. 그래서 보류 시간(pendingMs)을 따라갑니다.
//   - pendingMs 가 0 → 양수: 노란불 시작. 그 시각을 기억해 두고 아직 아무 색도 정하지 않습니다.
//   - pendingMs 가 다시 0: 결과가 정해졌습니다. 그 순간 studyMs 가 늘었으면 보류 시간이 공부로 더해진 것이라
//     노란불 시작부터 초록, 그대로면 버려진 것이라 노란불 시작부터 빨강(그때의 상태가 사유)입니다.
//   타이머와 같은 숫자로 정하므로 초록 합계가 타이머와 어긋나지 않습니다. 판정 기준(21초 등)이 바뀌어도 이 파일은 그대로입니다.
//
// 짧은 빨강도 합치지 않습니다. 남는 빨강은 모두 타이머가 실제로 멈춘 시간이라, 합치면 초록이 타이머보다 길어집니다.
import type { FocusStatus } from '../focus/focusLogic'

// 판정이 이 시간보다 오래 멈췄다 다시 오면(컴퓨터 잠자기 등) 그 사이는 빈칸으로 둡니다.
// 판정은 한 번에 최대 1초(focusLogic 의 MAX_STEP_MS)만 더하므로, 이어 칠하면 초록이 타이머보다 길어집니다.
export const GAP_MS = 3000

export type SegmentKind = FocusStatus | 'paused' // paused: 사용자가 누른 중지 (#236)

export type Segment = { kind: SegmentKind; startedAt: number; endedAt: number } // 시각은 ms

type HoldReason = 'face' | 'eyes' | 'frame' | 'phone'

export type SegmentInput = {
  now: number
  status: FocusStatus
  studyMs: number // 확정된 집중 시간 (FocusState.studyMs)
  pendingMs: number // 보류 중인 시간 (FocusState.pendingMs)
  hold: HoldReason | null // 노란불 이유 (holdReason). 노란불인 채로 끝나면 이걸로 사유를 정합니다.
}

export type SegmentState = {
  open: { kind: SegmentKind; startedAt: number } | null // 색이 정해진 채 이어지는 구간
  holdSince: number | null // 노란불이 시작된 시각 (결과를 기다리는 중)
  holdKind: SegmentKind // 노란불이 버려지면 쓸 사유
  lastNow: number // 직전에 넣은 시각
  lastStudyMs: number // 직전의 확정 시간
  done: Segment[] // 끝났지만 아직 저장하지 않은 구간
}

// 노란불 이유 → 버려졌을 때의 사유 (얼굴 안 보임은 자리 이탈, 눈 감음은 졸음)
const HOLD_KIND: Record<HoldReason, SegmentKind> = { face: 'away', eyes: 'drowsy', frame: 'outframe', phone: 'phone' }

export function startSegments(now: number, studyMs: number): SegmentState {
  return { open: null, holdSince: null, holdKind: 'away', lastNow: now, lastStudyMs: studyMs, done: [] }
}

// 구간을 닫아 done 에 넣습니다. 길이가 0이면 버립니다.
function close(done: Segment[], kind: SegmentKind, startedAt: number, endedAt: number): Segment[] {
  return endedAt > startedAt ? [...done, { kind, startedAt, endedAt }] : done
}

export function stepSegments(state: SegmentState, input: SegmentInput): SegmentState {
  const { now, status, studyMs, pendingMs, hold } = input
  let { open, holdSince, holdKind, done } = state
  const grew = studyMs > state.lastStudyMs

  // 판정이 오래 멈췄다 옴: 멈추기 전까지만 닫고 사이는 빈칸. 노란불이었으면 그 시간은 타이머에 들어가지 않았으므로 빨강입니다.
  if (now - state.lastNow > GAP_MS) {
    if (open) done = close(done, open.kind, open.startedAt, state.lastNow)
    if (holdSince !== null) done = close(done, holdKind, holdSince, state.lastNow)
    open = null
    holdSince = null
  }

  if (pendingMs > 0) {
    // 노란불: 시작 시각만 기억하고, 그 전까지의 구간은 닫습니다.
    if (holdSince === null) {
      holdSince = Math.max(now - pendingMs, open?.startedAt ?? -Infinity)
      if (open) done = close(done, open.kind, open.startedAt, holdSince)
      open = null
    }
    if (hold) holdKind = HOLD_KIND[hold]
    return { open, holdSince, holdKind, lastNow: now, lastStudyMs: studyMs, done }
  }

  if (holdSince !== null) {
    // 노란불의 결과가 정해짐: 노란불 시작부터 초록(공부로 더해짐) 또는 빨강(버려짐)
    const kind: SegmentKind = grew ? 'focus' : status === 'focus' ? holdKind : status
    open = { kind, startedAt: holdSince }
    holdSince = null
  }

  // 지금 색. 상태가 focus 가 아니어도 확정 시간이 늘었다면 타이머에 들어간 것이므로 초록입니다.
  const kind: SegmentKind = status === 'focus' || grew ? 'focus' : status
  if (!open) open = { kind, startedAt: now }
  else if (open.kind !== kind) {
    done = close(done, open.kind, open.startedAt, now)
    open = { kind, startedAt: now }
  }
  return { open, holdSince, holdKind, lastNow: now, lastStudyMs: studyMs, done }
}

// 저장할 때: 끝난 구간과 지금까지 이어지던 구간을 잘라 돌려줍니다. 노란불 중이면 그 부분은 결과가 정해진 뒤 다음 저장으로 넘깁니다.
export function takeSegments(state: SegmentState, now: number): { rows: Segment[]; next: SegmentState } {
  let rows = state.done
  let open = state.open
  if (open && state.holdSince === null) {
    rows = close(rows, open.kind, open.startedAt, now)
    open = { kind: open.kind, startedAt: now }
  }
  return { rows, next: { ...state, open, done: [] } }
}

// 공부를 끝낼 때(일어나기, 과목 바꾸기, 창 닫기): 노란불인 채로 끝나면 보류 시간은 타이머에 들어가지 않으므로 빨강으로 닫습니다.
export function endSegments(state: SegmentState, now: number): Segment[] {
  let done = state.done
  if (state.open) done = close(done, state.open.kind, state.open.startedAt, now)
  if (state.holdSince !== null) done = close(done, state.holdKind, state.holdSince, now)
  return done
}
