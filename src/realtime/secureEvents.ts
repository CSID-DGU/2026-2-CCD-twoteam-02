// 회의실 음성 연결 신호·채팅을 "보낸 사람이 확인된" 길로 주고받기 (#512, 0070).
//
// 회의 방(meeting:회의번호)의 메시지는 보내는 화면이 보낸 사람(from)을 적어서, 같은 회의 참가자가 남인 척할 수 있었다.
// 그래서 신호·채팅만 따로:
//   보내기  send_meeting_event(DB 함수)를 부른다. DB 가 보낸 사람을 로그인한 사람(auth.uid())으로 넣어 보안 방에 보낸다
//   받기    보안 방(meeting:회의번호:secure)을 듣는다. 화면은 이 방에 보낼 권한이 없어서(0070) 여기 온 것은 DB 가 보낸 것뿐
// 회의 방으로 온 신호·채팅은 믿지 않는다(useParticipants). 위치·고개 각도는 지금처럼 회의 방으로 오간다.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { CHAT_EVENT, SIGNAL_EVENT } from './participants'

export const SECURE_EVENTS = [SIGNAL_EVENT, CHAT_EVENT] as const
export type SecureEvent = (typeof SECURE_EVENTS)[number]

// 회의 방 이름이면 회의 번호, 아니면 null (회의 방만 보안 방을 씀)
export function meetingIdOf(room: string): number | null {
  const m = /^meeting:(\d+)$/.exec(room)
  return m ? Number(m[1]) : null
}

export const secureRoomOf = (meetingId: number) => `meeting:${meetingId}:secure`
// 보안 방이 이만큼 안에 안 열리면 회의 방에는 그냥 들어간다(위치는 보이게). 음성·채팅은 보안 방이 열린 뒤부터
export const SECURE_WAIT_MS = 5000

// 보안 방을 듣는다. 들어가면 onReady. 돌려준 함수로 그만 듣기. 끊기면 라이브러리가 다시 붙는다
export function listenSecure(client: SupabaseClient, meetingId: number, onMessage: (event: SecureEvent, payload: unknown) => void, onReady: () => void): () => void {
  const ch: RealtimeChannel = client.channel(secureRoomOf(meetingId), { config: { private: true } })
  for (const event of SECURE_EVENTS) ch.on('broadcast', { event }, ({ payload }) => onMessage(event, payload))
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') onReady()
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`회의 보안 방에 들어가지 못했습니다(${status}). 음성·채팅이 안 될 수 있어요.`)
  })
  return () => void client.removeChannel(ch)
}

// DB 함수로 보낸다. 보낸 사람은 DB 가 넣는다. 성공하면 true
export async function sendSecure(client: SupabaseClient, meetingId: number, event: SecureEvent, payload: Record<string, unknown>): Promise<boolean> {
  const { error } = await client.rpc('send_meeting_event', { p_meeting_id: meetingId, p_event: event, p_payload: payload })
  if (error) console.error(`회의 메시지를 보내지 못했습니다(${event}):`, error.message)
  return !error
}
