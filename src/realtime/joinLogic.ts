// 입장 응답을 누가, 무엇으로 할지 정하는 계산 (화면·React와 무관한 순수 로직) (#441)
//
// 대표: presence 목록에서 들어온 시각(at)이 가장 이른 사람. 같으면 계정 번호가 작은 사람.
// 뽑는 절차 없이 각자 자기가 가진 목록으로 계산한다. 잠깐 둘이 대표라고 판단해도 스냅샷이 두 번 갈 뿐이고,
// 아무도 답하지 않아도 RESEND_IDLE_MS 재전송으로 2초 안에 보인다. 그래서 정확히 한 명이 아니어도 된다.
import type { PresenceState } from './participants'

// members: 계정 번호 → 들어온 시각. at 이 없는 사람(이 기능 전 버전의 탭)은 스냅샷을 보낼 줄 모르므로 대표에서 뺀다.
export function isRepresentative(myId: string, members: ReadonlyMap<string, number | undefined>): boolean {
  let bestId: string | null = null
  let bestAt = Infinity
  for (const [id, at] of members) {
    if (typeof at !== 'number') continue
    if (at < bestAt || (at === bestAt && (bestId === null || id < bestId))) {
      bestId = id
      bestAt = at
    }
  }
  return bestId === myId
}

// 스냅샷에 실을 값: 내 값 + 알고 있는 사람들의 값. 남의 값은 받은 그대로라 이미 줄여져 있다(pack).
// 소식이 staleMs(STALE_MS) 넘게 끊긴 사람은 곧 지워질 사람이니 싣지 않는다. 실으면 받은 쪽에서 그만큼 더 살아남는다.
export function buildSnapshot(
  mine: PresenceState,
  moves: ReadonlyMap<string, PresenceState>,
  lastHeard: ReadonlyMap<string, number>,
  now: number,
  staleMs: number,
): PresenceState[] {
  const states = [mine]
  for (const [id, state] of moves) {
    const heard = lastHeard.get(id)
    if (id === mine.userId || heard === undefined || now - heard > staleMs) continue
    states.push(state)
  }
  return states
}

// 받은 스냅샷에서 새로 채울 값만 고른다. 나와 이미 아는 사람은 뺀다.
// 이미 아는 사람의 값은 직접 받은 쪽이 더 최신일 수 있어 덮어쓰지 않는다.
export function unknownStates(
  payload: unknown,
  myId: string | undefined,
  known: ReadonlyMap<string, PresenceState>,
): PresenceState[] {
  const states = (payload as { states?: unknown } | null)?.states
  if (!Array.isArray(states)) return []
  return (states as (PresenceState | null)[]).filter(
    (s): s is PresenceState => typeof s?.userId === 'string' && s.userId !== '' && s.userId !== myId && !known.has(s.userId),
  )
}
