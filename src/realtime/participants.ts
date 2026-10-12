// 같은 지점에 있는 참여자를 주고받는 데 쓰는 값들.
//
// 나뉘는 기준이 중요하다.
//
//   누가 있는지                            → Realtime Presence (들어올 때 한 번 track)
//   어디에 있는지(위치·상태·앉은 자리)      → Realtime Broadcast (자주 보냄)
//   잘 안 바뀌는 값(닉네임·캐릭터)          → DB(avatars 뷰)에서 읽는다
//
// 위치를 Presence 로 보내면 안 된다. track() 은 자주 부르라고 만든 것이 아니라서,
// 0.25초마다 부르면 들어왔다 나갔다를 반복하다가 아예 목록에서 사라진다.
// 실제로 재어 보니 한 번만 부르면 계속 보이는데, 0.25초마다 부르면 11초 내내 한 번도 안 보였다.
// 그래서 "누가 있는지"와 "어디에 있는지"를 나눈다.
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

// 위치를 0.25초마다 보낸다. 성능 목표가 "다른 참여자 화면 반영 500ms 이하"라 넉넉하다.
export const SEND_INTERVAL_MS = 250

// 값이 그대로여도 이만큼 지나면 한 번 더 보낸다.
// 가만히 선 사람도 나중에 들어온 사람에게 보여야 한다.
export const RESEND_IDLE_MS = 2000

// 위치를 실어 보내는 메시지 이름
export const MOVE_EVENT = 'move'

// 이 시간 동안 소식이 없으면 나간 것으로 보고 화면에서 지운다.
// 탭을 거칠게 닫으면 나갔다는 알림이 안 올 수 있어 필요하다.
// 가만히 서 있어도 RESEND_IDLE_MS 마다 한 번은 보내므로, 그보다 넉넉히 잡는다.
export const STALE_MS = 8000

// 지점마다 방을 따로 쓴다. 다른 지점 사람의 움직임을 받을 이유가 없다.
export const channelName = (branchId: number) => `branch:${branchId}`
