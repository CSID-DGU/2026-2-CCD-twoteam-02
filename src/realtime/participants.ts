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
  // 몸이 바라보는 방향(라디안, 0이면 +Z). 1인칭에서 옆걸음·뒷걸음을 하면 가는 방향과 보는 방향이 달라서
  // 위치만으로는 알 수 없다. (#122) 이 값이 없는 예전 버전이 보낸 메시지는 가는 방향을 보게 그린다.
  h?: number
  // 앉아서 공부하는 동안의 고개 각도(캐릭터 기준 라디안 [좌우, 위아래, 갸웃])와 눈 감김. (#129)
  // 서 있거나 얼굴을 못 찾으면 보내지 않는다. 받는 쪽은 정면·눈 뜬 모습으로 돌아간다.
  // 가만히 있을 때의 떨림으로 매번 보내지 않도록, 마지막으로 보낸 값에서 일정 이상 움직였을 때만 보낸다(sendLogic.ts, #237).
  head?: [number, number, number]
  eyes?: boolean // true 면 눈을 감고 있음
  // 앉아서 공부하는 동안의 팔 방향 [캐릭터 왼팔, 캐릭터 오른팔]. 어깨에서 손 쪽을 가리키는 [x, y, z] (캐릭터 기준).
  // 팔을 못 찾으면 그 팔은 null (받는 쪽은 팔을 내림). 떨림은 보내는 쪽에서 미리 거른다(armLogic.ts). (#139)
  arms?: [ArmVector | null, ArmVector | null]
  // 회의실에서 앉아 있는 동안의 입 벌린 정도(0 다묾 ~ 1 다 벌림). 지점에서는 보내지 않는다. (#61)
  mouth?: number
  // 서서 감정표현을 하는 동안만 싣는다. emoteSeq 는 시작할 때마다 1 올라가서, 같은 동작을 다시 해도 새로 시작한 걸 안다. (#162)
  // 따로 알림을 보내지 않고 위치 메시지에 한 칸 더 싣는 것뿐이라, 보고 있는 사람에게만 보인다.
  emote?: string
  emoteSeq?: number
  // 회의실(#45): 방장 넘기기처럼 회의 정보를 바꾸면 1 올린다. 받은 사람은 이 번호가 바뀌면 DB 에서 회의 정보를 다시 읽는다.
  // 값 자체를 믿지 않고 "다시 읽어 달라"는 신호로만 쓴다(누가 방장인지는 DB 가 정함).
  sync?: number
  // 회의실 음성(#46): 마이크를 켰는지. 다른 사람 화면의 참석자 목록에 🔇 로 보인다.
  mic?: boolean
  // 꽃 피는 칭호 단계(1~8, src/level/levelLogic). 프로필 공부 기록 공개 범위가 '모두'일 때만 싣는다.
  // 없으면(0단계·공개 범위 친구만/나만·예전 버전) 받는 쪽은 닉네임 위 리본을 그리지 않는다.
  lv?: number
}

export type ArmVector = [number, number, number]

// 화면에 그릴 때 쓰는 값. Presence 와 DB 에서 읽은 것을 합친 결과다.
export type Participant = PresenceState & {
  nickname: string
  model: string // 고른 차림(아바타 키, src/avatar/avatarLogic). 모든 캐릭터가 같은 3D 모델에 스킨만 다름 (#56)
}

// 위치를 0.25초마다 보낸다. 성능 목표가 "다른 참여자 화면 반영 500ms 이하"라 넉넉하다.
export const SEND_INTERVAL_MS = 250

// 값이 그대로여도 이만큼 지나면 한 번 더 보낸다.
// 가만히 선 사람도 나중에 들어온 사람에게 보여야 한다.
export const RESEND_IDLE_MS = 2000

// 얼마나 움직여야 보낼지(떨림 무시 기준)와 보내는 값의 자릿수는 sendLogic.ts 에 있다. (#237)

// 위치를 실어 보내는 메시지 이름
export const MOVE_EVENT = 'move'

// 들어왔다고 알리는 메시지 이름.
//
// 이게 없으면 나중에 들어온 사람은 남이 알아서 보내 줄 때까지 기다려야 한다.
// 가만히 선 사람은 RESEND_IDLE_MS(2초)마다만 보내므로 최대 2초 동안 안 보인다.
// 들어오면서 이 메시지를 한 번 보내고, 받은 사람들이 즉시 자기 위치로 답하게 한다.
//
// 메시지 수는 거의 늘지 않는다. 들어올 때 1회 + 사람 수만큼의 답장뿐이고,
// 그 뒤로는 평소 전송만 돌아간다.
export const HELLO_EVENT = 'hello'

// 내 캐릭터·닉네임을 바꿨다고 알리는 메시지 이름. (#131)
//
// 닉네임·캐릭터는 처음 볼 때 DB 에서 한 번만 읽고 들고 있어서, 지점 안에서 바꾸면 남들은
// 다시 들어올 때까지 예전 모습을 본다. 바꾼 사람이 이 메시지를 보내면 받은 사람은
// 들고 있던 값을 지우고 DB 에서 다시 읽는다.
// 값 자체는 싣지 않는다. 메시지에 실으면 남의 캐릭터·이름을 사칭할 수 있기 때문이다(위 머리말).
export const PROFILE_EVENT = 'profile'

// 회의실 음성 연결 신호(#46)를 실어 보내는 메시지 이름.
// WebRTC 연결을 맺으려면 처음에 offer·answer·ICE 같은 신호를 서로 건네야 하는데, 이것도 같은 방(회의 참석자만)으로 보낸다.
// 받는 사람(to)을 적어 보내고, 받은 쪽은 자기에게 온 것만 쓴다.
export const SIGNAL_EVENT = 'signal'

// 같은 방으로 음성 연결 신호를 주고받는 통로. 화면이 receive 를 넣어 두고, useParticipants 가 send 를 채운다.
export type SignalPort = {
  receive: (from: string, data: unknown) => void
  send: ((to: string, data: unknown) => void) | null // 방에 들어가기 전에는 null
}

// 회의 채팅(#298)을 실어 보내는 메시지 이름. 회의에 있는 사람끼리는 같은 방(참석자만)에서 이야기한다.
// 보낸 사람(from)을 적어 보내고, 메시지는 저장하지 않는다.
export const CHAT_EVENT = 'chat'

// 같은 방으로 채팅을 주고받는 통로. 채팅(useMeetingChat)이 receive 를 넣어 두고, useParticipants 가 send 를 채운다.
export type ChatPort = {
  receive: (from: string, payload: unknown) => void
  send: ((text: string) => Promise<boolean>) | null // 방에 들어가기 전에는 null
}

// 이 시간 동안 소식이 없으면 나간 것으로 보고 화면에서 지운다.
// 탭을 거칠게 닫으면 나갔다는 알림이 안 올 수 있어 필요하다.
// 가만히 서 있어도 RESEND_IDLE_MS 마다 한 번은 보내므로, 그보다 넉넉히 잡는다.
export const STALE_MS = 8000

// 지점마다 방을 따로 쓴다. 다른 지점 사람의 움직임을 받을 이유가 없다.
export const channelName = (branchId: number) => `branch:${branchId}`

// 로비는 방 하나를 모두 같이 쓴다. (#166)
export const LOBBY_CHANNEL = 'lobby'
