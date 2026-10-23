// 내 상태를 지금 보낼지 정하는 판정 (화면·React와 무관한 순수 로직) (#237)
//
// ── 예전 방식과 문제 ─────────────────────────────────────────────────
//
//  예전에는 값을 3도 칸(0°, 3°, 6° …)에 맞춰 반올림하고, 칸이 바뀌면 보냈다.
//  그런데 가만히 있어도 트래킹 값은 조금씩 떨린다. 떨림이 칸 경계(4.5° 등)에 걸리면
//  4.4° → 3°, 4.6° → 6° 로 갈려서 0.2°만 움직여도 0.25초마다 보내게 된다.
//  앉아서 공부하는 동안 거의 매번 보냈고, 받는 쪽 머리도 3°↔6° 를 오가며 떨렸다.
//
// ── 지금 방식 ────────────────────────────────────────────────────────
//
//  칸 대신 "마지막으로 보낸 값"을 기준점으로 삼는다.
//    기준점에서 *_DEADBAND 넘게 움직였을 때만 보낸다.
//    좌석·상태·눈 감김·감정표현처럼 끊어진 값은 바뀌면 바로 보낸다.
//
//    시각    실제   기준점과 차이   판정
//    0.00초  4.4°   —              보냄 (기준점 = 4.4°)
//    0.25초  4.6°   0.2°           안 보냄
//    0.50초  4.4°   0.0°           안 보냄
//    2.25초  12.0°  7.6°           보냄 (기준점 = 12.0°)
//
//  보내는 간격(SEND_INTERVAL_MS)은 그대로라, 크게 움직일 때의 지연은 예전과 같다.
//  기준값보다 작게 움직이고 멈추면 잠깐 어긋나지만, RESEND_IDLE_MS 마다 지금 값을
//  다시 보내므로 그 안에 따라잡는다.
//
//  반올림(pack)은 이제 메시지를 짧게 하는 데만 쓴다. 보낼지 말지는 여기서 정한다.
import type { ArmVector, PresenceState } from './participants'

// 보내는 값의 자릿수. 메시지 길이만 줄이고, 받는 쪽이 실제 각도에 가깝게 그리도록 촘촘하게 둔다.
export const POSITION_PRECISION = 0.01 // 위치: 1cm
export const ANGLE_PRECISION = 0.01 // 방향·고개·팔: 약 0.6도

// 마지막으로 보낸 값에서 이보다 많이 움직여야 보낸다. 가만히 있을 때의 떨림보다 커야 한다.
export const POSITION_DEADBAND = 0.01 // 위치: 1cm (키보드로 움직여 떨림이 없음)
export const HEADING_DEADBAND = 0.05 // 몸 방향: 약 3도
export const HEAD_DEADBAND = 0.05 // 고개 각도: 약 3도 (예전 칸 크기와 같음)
export const ARM_DEADBAND = 0.05 // 팔 방향(단위 벡터의 각 성분): 약 3도

// toFixed 로 0.30000000000000004 같은 소수 오차를 지워 메시지를 짧게 둔다.
const round = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(3))

// 보낼 값을 정한 자릿수로 줄인다.
export function pack(state: PresenceState): PresenceState {
  return {
    ...state,
    x: round(state.x, POSITION_PRECISION),
    z: round(state.z, POSITION_PRECISION),
    ...(state.h === undefined ? {} : { h: round(state.h, ANGLE_PRECISION) }),
    ...(state.head === undefined ? {} : { head: state.head.map((a) => round(a, ANGLE_PRECISION)) as [number, number, number] }),
    ...(state.arms === undefined ? {} : { arms: state.arms.map((v) => v && (v.map((a) => round(a, ANGLE_PRECISION)) as ArmVector)) as PresenceState['arms'] }),
  }
}

// 두 숫자 배열 중 한 칸이라도 limit 넘게 차이 나는지. 한쪽만 있거나 길이가 다르면 바뀐 것으로 본다.
function movedBeyond(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined, limit: number): boolean {
  if (!a || !b) return !a !== !b
  if (a.length !== b.length) return true
  return a.some((v, i) => Math.abs(v - b[i]) > limit)
}

function armsMoved(a: PresenceState['arms'], b: PresenceState['arms']): boolean {
  if (!a || !b) return !a !== !b
  return movedBeyond(a[0], b[0], ARM_DEADBAND) || movedBeyond(a[1], b[1], ARM_DEADBAND)
}

// 마지막으로 보낸 값(last)과 비교해 지금 값(now)을 보낼 만큼 바뀌었는지.
export function changedEnough(last: PresenceState | null, now: PresenceState): boolean {
  if (!last) return true
  // 끊어진 값: 하나라도 다르면 보낸다.
  if (last.userId !== now.userId || last.seat !== now.seat || last.status !== now.status) return true
  if (last.eyes !== now.eyes || last.emote !== now.emote || last.emoteSeq !== now.emoteSeq) return true
  // 연속된 값: 기준점에서 기준값 넘게 움직였을 때만.
  if (Math.abs(last.x - now.x) > POSITION_DEADBAND || Math.abs(last.z - now.z) > POSITION_DEADBAND) return true
  if ((last.h === undefined) !== (now.h === undefined)) return true
  if (last.h !== undefined && now.h !== undefined && Math.abs(last.h - now.h) > HEADING_DEADBAND) return true
  if (movedBeyond(last.head, now.head, HEAD_DEADBAND)) return true
  return armsMoved(last.arms, now.arms)
}
