// 위치 중계 서버로 방에 들어간다 (#451, #464). VITE_RELAY_URL 이 있을 때만 쓴다.
//
// 서버가 방 상태를 기억해 입장 스냅샷과 퇴장 소식을 알려 주므로 presence·hello·대표 스냅샷이 필요 없다.
// 그래서 track 은 아무것도 안 하고 members 는 늘 비어 있다. 비어 있으면 useParticipants 의 대표 판정이 저절로 꺼진다.
//
//   서버 메시지            useParticipants 가 받는 것
//   {t:'s', s:[...]}   →  SNAPSHOT_EVENT {states}
//   {t:'b', s:[...]}   →  사람마다 MOVE_EVENT. 서버에서 기다린 시간(a)을 빼서 표본 시각(sampledAt)을 붙인다 (#504)
//   {t:'b', g:[...]}   →  onLeave
//   {t:'e', e, p}      →  FLICK_EVENT, PROFILE_EVENT
//   {t:'p', e, p, r}   →  PLAY_EVENT (축구공·모래 글씨, #473)
//
// 토큰은 부프로토콜 칸으로 보낸다(이유는 relay/src/index.ts). 연결할 때마다 새로 읽으므로
// 토큰이 끝나 서버가 끊으면 재연결이 새 토큰으로 들어간다.
import { supabase } from '../lib/supabase'
import { FLICK_EVENT, MOVE_EVENT, PLAY_EVENT, PROFILE_EVENT, SNAPSHOT_EVENT } from './participants'
import { sampledTime } from './walkLogic'
import type { RoomLink, RoomLinkEvents } from './roomLink'
import { recordError } from '../ops/collector'
import { workerInterval } from '../lib/workerInterval'
import { shouldRecordClose } from '../ops/opsLogic'

const SUBPROTOCOL = 'relay.v1'
const CLOSE_FULL = 4503 // 서버가 방이 찼다고 닫을 때 쓰는 번호 (relay/src/relayLogic.ts)
export const ROOM_FULL_STATUS = 'ROOM_FULL'
const PING_INTERVAL_MS = 25000 // 살아 있다고 알리는 간격. 서버가 객체를 깨우지 않고 답한다. 서버는 75초 동안 소식이 없으면 끊는다(relayLogic.STALE_CONNECTION_MS)
const SLEPT_GAP_MS = PING_INTERVAL_MS * 2 // 타이머가 이만큼 넘게 밀렸으면 기기가 잠들었던 것(뚜껑 닫음·절전)으로 본다
const SILENCE_LIMIT_MS = 90000 // 이 시간 동안 아무 소식도 없으면 끊긴 것으로 본다

export function relayUrl(): string | undefined {
  return import.meta.env.VITE_RELAY_URL?.replace(/\/$/, '') || undefined
}

// watch: 보기 전용 연결(통창). 서버가 정원과 따로 세고, 위치를 보내도 받지 않는다 (#442)
export function openRelayLink(url: string, room: string, events: RoomLinkEvents, watch = false): RoomLink {
  let ws: WebSocket | null = null
  let ended = false // 끊김을 이미 알렸거나 정리했다
  let heardAt = 0
  let stopPing: (() => void) | null = null
  const target = `room/${room.split(':')[0]}` // 운영 기록용 방 종류 (번호는 남기지 않음, #590)

  function end(status?: string) {
    if (ended) return
    ended = true
    stopPing?.()
    ws?.close()
    if (status) events.onStatus(status)
  }

  function receive(text: unknown) {
    heardAt = Date.now()
    if (typeof text !== 'string' || text === 'pong') return
    const receivedAt = performance.now()
    let m: { t?: string; s?: unknown[]; a?: unknown[]; g?: string[]; e?: string; p?: unknown; r?: string }
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.t === 's') events.onMessage(SNAPSHOT_EVENT, { states: m.s })
    else if (m.t === 'b') {
      for (const userId of m.g ?? []) events.onLeave([{ userId }])
      ;(m.s ?? []).forEach((state, i) => {
        if (typeof state === 'object' && state !== null) (state as { sampledAt?: number }).sampledAt = sampledTime(receivedAt, m.a?.[i])
        events.onMessage(MOVE_EVENT, state)
      })
    } else if (m.t === 'e' && m.e) events.onMessage(m.e, m.p)
    else if (m.t === 'p') events.onMessage(PLAY_EVENT, { e: m.e, p: m.p, r: m.r })
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
      // 워커 타이머: 일반 타이머는 탭이 숨은 지 5분 뒤 1분에 1번으로 느려져, 멀쩡한 사람이 서버에서 끊긴 것으로 보인다 (#417)
      let tickAt = Date.now()
      stopPing = workerInterval(PING_INTERVAL_MS, () => {
        const now = Date.now()
        const slept = now - tickAt > SLEPT_GAP_MS
        tickAt = now
        if (now - heardAt > SILENCE_LIMIT_MS) {
          // 잠들었다 깬 것은 연결 문제가 아니므로 운영 기록에 남기지 않고 다시 연결만 함
          if (!slept) recordError({ kind: 'relay', code: 'TIMED_OUT', target: target })
          end('TIMED_OUT')
        } else if (socket.readyState === WebSocket.OPEN) socket.send('ping')
      })
      events.onStatus('SUBSCRIBED')
    }
    socket.onmessage = (event) => receive(event.data)
    socket.onclose = (event) => {
      // 우리가 닫은 것(ended)과 정상 재연결(토큰 만료·다른 탭)이 아니면 서버가 닫았거나 끊긴 것: 운영 기록에 남김 (#590)
      if (!ended && shouldRecordClose(event.code)) recordError({ kind: 'relay', code: String(event.code), target })
      end(event.code === CLOSE_FULL ? ROOM_FULL_STATUS : 'CLOSED')
    }
  }

  return {
    open: () => void connect().catch(() => end('CHANNEL_ERROR')),
    async send(event, payload) {
      if (ws?.readyState !== WebSocket.OPEN) return 'closed'
      if (event === MOVE_EVENT) ws.send(JSON.stringify({ t: 'm', s: payload }))
      else if (event === FLICK_EVENT || event === PROFILE_EVENT) ws.send(JSON.stringify({ t: 'e', e: event, p: payload }))
      else if (event === PLAY_EVENT) {
        // 서버는 맨 앞 {"t":"p" 로 축구공·모래 글씨를 알아보고 따로 센다. t 를 맨 앞에 둔다
        const q = payload as { e: string; p?: unknown; to?: string }
        ws.send(JSON.stringify({ t: 'p', e: q.e, p: q.p ?? {}, ...(q.to ? { to: q.to } : {}) }))
      }
      // HELLO_EVENT 는 보내지 않는다. 서버가 스냅샷을 직접 준다. SNAPSHOT_EVENT 는 대표가 없으니 나올 일이 없다.
      return 'ok'
    },
    track() {},
    members: () => [],
    discard: () => end(),
    leave: () => end(),
  }
}
