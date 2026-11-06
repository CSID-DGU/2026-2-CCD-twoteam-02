// 위치 중계 서버로 방에 들어간다 (#451, #464). VITE_RELAY_URL 이 있을 때만 쓴다.
//
// 서버가 방 상태를 기억해 입장 스냅샷과 퇴장 소식을 알려 주므로 presence·hello·대표 스냅샷이 필요 없다.
// 그래서 track 은 아무것도 안 하고 members 는 늘 비어 있다. 비어 있으면 useParticipants 의 대표 판정이 저절로 꺼진다.
//
//   서버 메시지            useParticipants 가 받는 것
//   {t:'s', s:[...]}   →  SNAPSHOT_EVENT {states}
//   {t:'b', s:[...]}   →  사람마다 MOVE_EVENT
//   {t:'b', g:[...]}   →  onLeave
//   {t:'e', e, p}      →  FLICK_EVENT, PROFILE_EVENT
//
// 토큰은 부프로토콜 칸으로 보낸다(이유는 relay/src/index.ts). 연결할 때마다 새로 읽으므로
// 토큰이 끝나 서버가 끊으면 재연결이 새 토큰으로 들어간다.
import { supabase } from '../lib/supabase'
import { FLICK_EVENT, MOVE_EVENT, PROFILE_EVENT, SNAPSHOT_EVENT } from './participants'
import type { RoomLink, RoomLinkEvents } from './roomLink'

const SUBPROTOCOL = 'relay.v1'
const CLOSE_FULL = 4503 // 서버가 방이 찼다고 닫을 때 쓰는 번호 (relay/src/relayLogic.ts)
export const ROOM_FULL_STATUS = 'ROOM_FULL'
const PING_INTERVAL_MS = 25000 // 살아 있다고 알리는 간격. 서버가 객체를 깨우지 않고 답한다
const SILENCE_LIMIT_MS = 90000 // 이 시간 동안 아무 소식도 없으면 끊긴 것으로 본다

export function relayUrl(): string | undefined {
  return import.meta.env.VITE_RELAY_URL?.replace(/\/$/, '') || undefined
}

// watch: 보기 전용 연결(통창). 서버가 정원과 따로 세고, 위치를 보내도 받지 않는다 (#442)
export function openRelayLink(url: string, room: string, events: RoomLinkEvents, watch = false): RoomLink {
  let ws: WebSocket | null = null
  let ended = false // 끊김을 이미 알렸거나 정리했다
  let heardAt = 0
  let pingTimer: ReturnType<typeof setInterval> | null = null

  function end(status?: string) {
    if (ended) return
    ended = true
    if (pingTimer) clearInterval(pingTimer)
    ws?.close()
    if (status) events.onStatus(status)
  }

  function receive(text: unknown) {
    heardAt = Date.now()
    if (typeof text !== 'string' || text === 'pong') return
    let m: { t?: string; s?: unknown[]; g?: string[]; e?: string; p?: unknown }
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.t === 's') events.onMessage(SNAPSHOT_EVENT, { states: m.s })
    else if (m.t === 'b') {
      for (const userId of m.g ?? []) events.onLeave([{ userId }])
      for (const state of m.s ?? []) events.onMessage(MOVE_EVENT, state)
    } else if (m.t === 'e' && m.e) events.onMessage(m.e, m.p)
  }

  async function connect() {
    const { data } = await supabase.auth.getSession()
    if (ended) return
    const token = data.session?.access_token
    if (!token) return end('CHANNEL_ERROR')
    const socket = new WebSocket(`${url}/room/${encodeURIComponent(room)}${watch ? '?watch=1' : ''}`, [SUBPROTOCOL, token])
    ws = socket
    socket.onopen = () => {
      if (ended) return
      heardAt = Date.now()
      pingTimer = setInterval(() => {
        if (Date.now() - heardAt > SILENCE_LIMIT_MS) end('TIMED_OUT')
        else if (socket.readyState === WebSocket.OPEN) socket.send('ping')
      }, PING_INTERVAL_MS)
      events.onStatus('SUBSCRIBED')
    }
    socket.onmessage = (event) => receive(event.data)
    socket.onclose = (event) => end(event.code === CLOSE_FULL ? ROOM_FULL_STATUS : 'CLOSED')
  }

  return {
    open: () => void connect().catch(() => end('CHANNEL_ERROR')),
    async send(event, payload) {
      if (ws?.readyState !== WebSocket.OPEN) return 'closed'
      if (event === MOVE_EVENT) ws.send(JSON.stringify({ t: 'm', s: payload }))
      else if (event === FLICK_EVENT || event === PROFILE_EVENT) ws.send(JSON.stringify({ t: 'e', e: event, p: payload }))
      // HELLO_EVENT 는 보내지 않는다. 서버가 스냅샷을 직접 준다. SNAPSHOT_EVENT 는 대표가 없으니 나올 일이 없다.
      return 'ok'
    },
    track() {},
    members: () => [],
    discard: () => end(),
    leave: () => end(),
  }
}
