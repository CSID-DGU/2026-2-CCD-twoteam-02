// 실시간 방 연결을 바꿔 끼우는 자리 (#451).
//
// useParticipants 는 "방에 들어가 메시지를 주고받는다"만 알면 된다. 그 아래가 Supabase 채널인지
// 중계 서버(relayLink.ts)인지는 여기서 가른다. 입장 절차·재연결·화면 갱신은 useParticipants 한 곳에 그대로 있다.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { CHAT_EVENT, FLICK_EVENT, HELLO_EVENT, MOVE_EVENT, PROFILE_EVENT, SIGNAL_EVENT, SNAPSHOT_EVENT } from './participants'

export type Presence = { userId?: string; at?: number }

// 방에서 일어나는 일. useParticipants 가 채운다.
export type RoomLinkEvents = {
  onSync: () => void
  onJoin: (presences: Presence[]) => void
  onLeave: (presences: Presence[]) => void
  onMessage: (event: string, payload: unknown) => void
  onStatus: (status: string) => void // SUBSCRIBED, 또는 isDownStatus 가 끊김으로 아는 상태
}

export type RoomLink = {
  open: () => void
  send: (event: string, payload: unknown) => Promise<unknown>
  track: (presence: Presence) => void // 누가 있는지 알리기
  members: () => Presence[] // 지금 여기 있다고 아는 사람
  discard: () => void // 끊긴 연결을 버린다
  leave: () => void // 화면을 떠난다
}

// 받는 메시지 이름. 이 순서로 듣는다.
const BROADCAST_EVENTS = [HELLO_EVENT, SNAPSHOT_EVENT, PROFILE_EVENT, SIGNAL_EVENT, CHAT_EVENT, FLICK_EVENT, MOVE_EVENT]

// Supabase Realtime 채널 (기본).
export function openSupabaseLink(client: SupabaseClient, room: string, isPrivate: boolean, events: RoomLinkEvents): RoomLink {
  const ch: RealtimeChannel = client.channel(room, isPrivate ? { config: { private: true } } : undefined)
  return {
    open() {
      ch.on('presence', { event: 'sync' }, events.onSync)
        .on('presence', { event: 'join' }, ({ newPresences }) => events.onJoin(newPresences as Presence[]))
        .on('presence', { event: 'leave' }, ({ leftPresences }) => events.onLeave(leftPresences as Presence[]))
      for (const event of BROADCAST_EVENTS) ch.on('broadcast', { event }, ({ payload }) => events.onMessage(event, payload))
      ch.subscribe((status) => events.onStatus(status))
    },
    send: (event, payload) => ch.send({ type: 'broadcast', event, payload: payload as Record<string, unknown> }),
    track: (presence) => void ch.track(presence),
    members: () => Object.values(ch.presenceState<Presence>()).flat(),
    discard: () => void client.removeChannel(ch),
    leave: () => void ch.unsubscribe(),
  }
}
