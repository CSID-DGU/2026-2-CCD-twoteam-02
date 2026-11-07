// 사이트 전체 접속 표시를 위치 중계 서버로 주고받는다 (#473). VITE_RELAY_URL 이 있을 때만 쓴다.
//
// OnlineProvider 가 Supabase Presence 방에서 쓰던 두 가지(presenceState, track)를 같은 모양으로 준다.
// 그래서 친구 목록, 접속 인원, 탭 양보(#347) 같은 쓰는 쪽은 바뀌지 않는다.
//
//   서버 메시지                          이 파일이 하는 일
//   {t:'f', p:[[연결, 계정, 상태]...]}  명단을 통째로 바꾸고 onSync
//   {t:'d', p:[...], g:[연결...]}       바뀐 연결을 덮어쓰고 나간 연결을 지우고 onSync
//   {t:'c', f, g?, e, p}                 받은 채팅·알림을 onChat 으로 (#473)
//   {t:'k', i, ok}                       보낸 채팅을 서버가 전달했는지 (chat 이 돌려줌)
//
// 토큰은 연결할 때마다 새로 읽는다. 토큰이 끝나 서버가 끊으면(4401) OnlineProvider 가 다시 들어가며 새 토큰을 쓴다.
import { supabase } from '../lib/supabase'
import type { ChatIncoming, ChatPort } from './onlineContext'

const SUBPROTOCOL = 'relay.v1'
const CLOSE_REPLACED = 4409 // 같은 계정의 탭이 너무 많아 서버가 이 탭을 닫음 (relay/src/relayLogic.ts)
export const REPLACED_STATUS = 'REPLACED'
const PING_INTERVAL_MS = 25000 // 살아 있다고 알리는 간격. 서버가 객체를 깨우지 않고 답한다
const SILENCE_LIMIT_MS = 90000 // 이 시간 동안 아무 소식도 없으면 끊긴 것으로 본다
const CHAT_ACK_MS = 5000 // 보낸 채팅의 전달 여부를 이만큼 기다린다. 넘으면 못 보낸 것으로 본다

export type OnlineLink<Meta> = {
  open: () => void
  close: () => void
  track: (meta: Meta) => Promise<unknown>
  presenceState: () => Record<string, Meta[]> // 계정 번호 → 탭마다의 상태
  chat: ChatPort['send']
  refreshPeers: () => void
}

type Events = {
  onSync: () => void // 명단이 바뀜
  onStatus: (status: 'SUBSCRIBED' | 'CLOSED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | typeof REPLACED_STATUS) => void
  onChat: (m: ChatIncoming) => void // 받은 채팅·알림 (#473)
}

export function openOnlineLink<Meta>(url: string, events: Events): OnlineLink<Meta> {
  let ws: WebSocket | null = null
  let ended = false
  let heardAt = 0
  let pingTimer: ReturnType<typeof setInterval> | null = null
  const list = new Map<string, { userId: string; meta: Meta }>() // 연결 번호 → 계정·상태
  const acks = new Map<number, (ok: boolean) => void>() // 보낸 채팅 번호 → 전달 여부를 기다리는 곳
  let chatSeq = 0

  function end(status?: Parameters<Events['onStatus']>[0]) {
    if (ended) return
    ended = true
    if (pingTimer) clearInterval(pingTimer)
    ws?.close()
    for (const done of acks.values()) done(false)
    acks.clear()
    if (status) events.onStatus(status)
  }

  function receive(text: unknown) {
    heardAt = Date.now()
    if (typeof text !== 'string' || text === 'pong') return
    let m: { t?: string; p?: unknown; g?: unknown; f?: unknown; e?: unknown; i?: unknown; ok?: unknown }
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.t === 'k') {
      const done = typeof m.i === 'number' ? acks.get(m.i) : undefined
      done?.(m.ok === true)
      return
    }
    if (m.t === 'c') {
      if (typeof m.f !== 'string' || typeof m.e !== 'string') return
      const payload = typeof m.p === 'object' && m.p !== null ? (m.p as Record<string, unknown>) : {}
      events.onChat({ from: m.f, group: typeof m.g === 'number' ? m.g : null, event: m.e, payload })
      return
    }
    if (m.t === 'f') list.clear()
    else if (m.t !== 'd') return
    for (const [conn, userId, meta] of (m.p as [string, string, Meta][] | undefined) ?? []) list.set(conn, { userId, meta })
    for (const conn of (m.g as string[] | undefined) ?? []) list.delete(conn)
    events.onSync()
  }

  async function connect() {
    const { data } = await supabase.auth.getSession()
    if (ended) return
    const token = data.session?.access_token
    if (!token) return end('CHANNEL_ERROR')
    const socket = new WebSocket(`${url}/online`, [SUBPROTOCOL, token])
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
    socket.onclose = (event) => end(event.code === CLOSE_REPLACED ? REPLACED_STATUS : 'CLOSED')
  }

  return {
    open: () => void connect().catch(() => end('CHANNEL_ERROR')),
    close: () => end(),
    async track(meta) {
      if (ws?.readyState !== WebSocket.OPEN) return 'closed'
      ws.send(JSON.stringify({ t: 'o', m: meta }))
      return 'ok'
    },
    // 채팅·알림 보내기. 서버가 친구·그룹인지 확인해 전달하고 결과를 알려 준다
    chat(to, event, payload) {
      const socket = ws
      if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve(false)
      const i = ++chatSeq
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          acks.delete(i)
          resolve(false)
        }, CHAT_ACK_MS)
        acks.set(i, (ok) => {
          clearTimeout(timer)
          acks.delete(i)
          resolve(ok)
        })
        socket.send(JSON.stringify({ t: 'c', i, to, e: event, p: payload }))
      })
    },
    // 친구·그룹이 바뀌었다고 알린다. 서버가 이 토큰으로 DB 를 다시 읽는다
    refreshPeers() {
      void supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token
        if (token && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', k: token }))
      })
    },
    presenceState() {
      const state: Record<string, Meta[]> = {}
      for (const { userId, meta } of list.values()) (state[userId] ??= []).push(meta)
      return state
    },
  }
}
