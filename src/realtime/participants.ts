// 같은 지점에 있는 참여자를 주고받는 데 쓰는 값들.
//
// 나뉘는 기준이 중요하다.
//
//   빠르게 바뀌는 값(위치·상태·앉은 자리)  → Realtime Presence 로 각자 보낸다
//   잘 안 바뀌는 값(닉네임·캐릭터)         → DB(avatars 뷰)에서 읽는다
//
// 닉네임과 캐릭터를 Presence 에 실어 보내면 각자 브라우저가 적어 넣는 값이 되어
// 남의 이름을 사칭할 수 있다. DB 에서 읽으면 Supabase 가 로그인 토큰으로 확인한 값이라
// 위조가 안 된다. 그래서 둘을 나눈다.
//
// 좌석이 실제로 누구 것인지도 DB 가 진실이다(seat_sessions 와 유니크 인덱스).
// Presence 의 seat 은 "이 캐릭터를 어디에 그릴지"에만 쓴다.
import type { PresenceStatus } from '../space/status'

// 각자 보내는 값. 매번 바뀌므로 작게 유지한다.
export type PresenceState = {
  userId: string
  x: number
  z: number
  seat: number | null // 앉아 있으면 좌석 번호, 아니면 null
  status: PresenceStatus
}

// 화면에 그릴 때 쓰는 값. Presence 와 DB 에서 읽은 것을 합친 결과다.
export type Participant = PresenceState & {
  nickname: string
  model: string // public/models/character-<model>.glb
}

// 0.1초마다 보낸다. 성능 목표가 "다른 참여자 화면 반영 500ms 이하"라 넉넉하다.
// 더 자주 보내면 사람 수만큼 메시지가 늘어 득보다 실이 크다.
export const SEND_INTERVAL_MS = 100

// 지점마다 방을 따로 쓴다. 다른 지점 사람의 움직임을 받을 이유가 없다.
export const channelName = (branchId: number) => `branch:${branchId}`
