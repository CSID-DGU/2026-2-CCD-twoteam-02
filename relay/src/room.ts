// 방 하나 = Durable Object 하나 (#451)
//
// Durable Object 는 이름마다 전 세계에 하나만 있는 객체다. 같은 방 사람이 모두 같은 객체에 붙으므로
// 방 상태를 여기서 기억하고, 한 메시지를 받아 합쳐서 전원에게 내보낸다.
//
// ── 메시지 형식 (JSON 글자) ──────────────────────────────────────────
//
//   받는 것  {t:'m', s:위치}             내 위치
//            {t:'e', e:이름, p:내용}     딱밤·프로필 알림
//            {t:'q'}                     측정용 계수 요청
//            'ping'                      살아 있음 (런타임이 객체를 깨우지 않고 'pong' 으로 답한다)
//   보내는 것 {t:'s', u:나, s:[위치...]}  입장 스냅샷. 들어온 사람에게만
//            {t:'b', s:[위치...], g:[나간 사람...]}  틱마다 묶은 변경
//            {t:'e', e:이름, p:내용}     딱밤·프로필 알림
//            {t:'r', ...}                측정용 계수
//
// ── Hibernation (잠들기) ─────────────────────────────────────────────
//
//  ctx.acceptWebSocket 으로 받은 연결은 객체가 메모리에서 내려가도 살아 있다. 메시지가 오면 객체를 다시 만들어 깨운다.
//  그래서 필드에 둔 값은 언제든 사라질 수 있다. 사람별 최신 위치는 연결에 붙이는 작은 저장칸(attachment)에 두고,
//  깨어날 때(생성자) 모든 연결에서 다시 모은다. 저장소(SQLite)에는 쓰지 않아 쓰기 요금이 없다.
//
// ── 요금 ─────────────────────────────────────────────────────────────
//
//  내보내기는 무료, 받기는 20건이 요청 1건이다. duration 은 객체가 일하거나 잠들 수 없는 동안 쌓인다.
//  대기 중인 타이머(setTimeout)가 있으면 잠들 수 없다. 그래서 틱이 이미 지났으면 타이머 없이 바로 내보내고,
//  타이머를 걸어 둔 시간을 재서 측정 봇에 알려 준다({t:'q'}).
//  알람(setAlarm)은 1회가 저장소 쓰기 1건이라 쓰지 않는다. 틱 간격으로 쓰면 하루 86만 건이 되어 무료 한도(10만)를 넘는다.
import { DurableObject } from 'cloudflare:workers'
import {
  CLOSE_FULL, CLOSE_NOT_TEXT, CLOSE_REPLACED, CLOSE_STALE, CLOSE_TOKEN_EXPIRED, CLOSE_TOO_BIG, CLOSE_TOO_FAST,
  MAX_CONNECTIONS_PER_USER, MAX_MESSAGE_BYTES, MAX_ROOM_CONNECTIONS, STALE_CONNECTION_MS, SWEEP_INTERVAL_MS,
  countMessage, flushDelay, sanitizeEvent, sanitizeState,
} from './relayLogic'
import type { RateWindow, RelayState } from './relayLogic'
import type { RelayEnv } from './index'

export const SUBPROTOCOL = 'relay.v1'
export const USER_HEADER = 'x-relay-user'
export const EXPIRES_HEADER = 'x-relay-expires'

// 연결마다 붙여 두는 값. 잠들었다 깨어도 남는다.
type Attachment = {
  conn: string // 연결 번호
  userId: string // 토큰에서 꺼낸 값
  expiresAt: number // 토큰 만료 시각(밀리초)
  heardAt: number // 마지막으로 메시지를 받은 시각
  state: RelayState | null // 이 연결이 마지막으로 보낸 위치. 보기 전용 연결은 null
}

export class RelayRoom extends DurableObject<RelayEnv> {
  private latest = new Map<string, RelayState>() // 사람별 최신 위치
  private pending = new Map<string, RelayState>() // 이번 틱에 바뀐 위치
  private gone = new Set<string>() // 이번 틱에 나간 사람
  private rates = new Map<string, RateWindow>() // 연결별 초당 메시지. 잠들면 사라져도 상관없다
  private timer: ReturnType<typeof setTimeout> | null = null
  private timerArmedAt = 0
  private lastFlushAt = 0
  private lastSweepAt = 0
  private stats = { since: Date.now(), timerMs: 0, flushes: 0, received: 0, dropped: 0 }

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env)
    // 살아 있음 확인은 객체를 깨우지 않고 런타임이 답한다. 보기 전용 연결이 요금 없이 살아 있을 수 있다.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    // 잠들었다 깨어났다면 연결에 붙여 둔 값에서 방 상태를 되살린다. 같은 사람의 연결이 여럿이면 더 최근 값을 쓴다.
    const heardAt = new Map<string, number>()
    const sockets = ctx.getWebSockets()
    for (const ws of sockets) {
      const a = this.attachmentOf(ws)
      if (!a?.state || a.heardAt < (heardAt.get(a.userId) ?? 0)) continue
      heardAt.set(a.userId, a.heardAt)
      this.latest.set(a.userId, a.state)
    }
    if (sockets.length > 0) console.log(`방 복원: 연결 ${sockets.length}개, 위치 ${this.latest.size}명`)
  }

  private attachmentOf(ws: WebSocket) {
    return ws.deserializeAttachment() as Attachment | null
  }

  // Worker(index.ts)가 토큰을 확인한 뒤에만 여기로 넘긴다. 객체는 밖에서 직접 부를 수 없다.
  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get(USER_HEADER)
    const expiresAt = Number(request.headers.get(EXPIRES_HEADER))
    if (!userId || !expiresAt) return new Response('bad request', { status: 400 })

    const { 0: client, 1: server } = new WebSocketPair()
    const respond = () => new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': SUBPROTOCOL } })
    const sockets = this.ctx.getWebSockets()

    // 정원 초과는 HTTP 로 거절하지 않고 받은 뒤 닫는다. 브라우저는 HTTP 거절 이유를 코드에서 읽을 수 없다.
    // 잠들기 연결로 받지 않는다. 곧 닫을 연결이라 방 인원에 잡히면 안 된다.
    const limit = Number(this.env.ROOM_MAX_CONNECTIONS) || MAX_ROOM_CONNECTIONS
    if (sockets.length >= limit) {
      server.accept()
      server.close(CLOSE_FULL, 'room full')
      return respond()
    }
    this.ctx.acceptWebSocket(server)

    // 다시 연결한 사람의 예전 연결이 남아 있을 수 있다. 너무 많으면 소식이 가장 오래 없는 것부터 닫는다.
    // getWebSockets 의 순서는 정해져 있지 않아 시각으로 고른다.
    const mine = sockets.filter((ws) => this.attachmentOf(ws)?.userId === userId)
    if (mine.length >= MAX_CONNECTIONS_PER_USER) {
      const heardAt = (ws: WebSocket) => this.attachmentOf(ws)?.heardAt ?? 0
      this.closeAndForget(mine.reduce((old, ws) => (heardAt(ws) < heardAt(old) ? ws : old)), CLOSE_REPLACED, 'replaced')
    }

    const now = Date.now()
    const attachment: Attachment = { conn: crypto.randomUUID(), userId, expiresAt, heardAt: now, state: null }
    server.serializeAttachment(attachment)
    // 들어온 사람에게만 전체 상태를 준다. 예전처럼 대표가 답할 일이 없다.
    server.send(JSON.stringify({ t: 's', u: userId, s: [...this.latest.values()] }))
    return respond()
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.attachmentOf(ws)
    if (!a) return
    if (typeof message !== 'string') return ws.close(CLOSE_NOT_TEXT, 'text only')
    if (message.length > MAX_MESSAGE_BYTES) return ws.close(CLOSE_TOO_BIG, 'too big')
    const now = Date.now()
    if (a.expiresAt <= now) return ws.close(CLOSE_TOKEN_EXPIRED, 'token expired')

    const rate = this.rates.get(a.conn) ?? { startedAt: now, count: 0 }
    this.rates.set(a.conn, rate)
    const verdict = countMessage(rate, now)
    if (verdict === 'close') return ws.close(CLOSE_TOO_FAST, 'too fast')
    this.stats.received++
    if (verdict === 'drop') {
      this.stats.dropped++
      return
    }

    let parsed: { t?: unknown; s?: unknown; e?: unknown; p?: unknown; id?: unknown }
    try {
      const value: unknown = JSON.parse(message)
      if (typeof value !== 'object' || value === null) return
      parsed = value
    } catch {
      return // 잘못된 JSON 은 버린다. 보낸 사람이 초당 상한을 넘기면 위에서 끊긴다
    }

    if (parsed.t === 'm') {
      const state = sanitizeState(a.userId, parsed.s)
      if (!state) return
      ws.serializeAttachment({ ...a, heardAt: now, state } satisfies Attachment)
      this.latest.set(a.userId, state)
      this.pending.set(a.userId, state)
      this.gone.delete(a.userId)
      this.requestFlush(now)
    } else if (parsed.t === 'e') {
      const event = sanitizeEvent(a.userId, parsed.e, parsed.p)
      if (event) this.sendAll(JSON.stringify({ t: 'e', ...event }))
    } else if (parsed.t === 'q') {
      const room = this.ctx.getWebSockets().length
      ws.send(JSON.stringify({ t: 'r', id: parsed.id, connections: room, ...this.stats, now }))
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.forget(ws)
    // 상대의 닫기에 답한다. 답하지 않으면 클라이언트의 onclose 가 오지 않았다(로컬 wrangler dev 에서 확인).
    try {
      ws.close(1000)
    } catch {
      // 이미 닫혔다
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.forget(ws)
  }

  // 틱이 지났으면 바로, 아니면 남은 시간 뒤에 내보낸다.
  private requestFlush(now: number) {
    if (this.timer) return
    const delay = flushDelay(this.lastFlushAt, now)
    if (delay === 0) {
      this.flush(now)
      return
    }
    this.timerArmedAt = now
    this.timer = setTimeout(() => {
      this.timer = null
      const firedAt = Date.now()
      this.stats.timerMs += firedAt - this.timerArmedAt
      this.flush(firedAt)
    }, delay)
  }

  private flush(now: number) {
    this.lastFlushAt = now
    if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) this.sweep(now)
    if (this.pending.size === 0 && this.gone.size === 0) return
    const batch = { t: 'b', s: [...this.pending.values()], ...(this.gone.size > 0 ? { g: [...this.gone] } : {}) }
    this.pending.clear()
    this.gone.clear()
    this.stats.flushes++
    this.sendAll(JSON.stringify(batch))
  }

  private sendAll(data: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        // 막 닫힌 연결이다. webSocketClose 가 곧 정리한다
      }
    }
  }

  // 소식이 끊긴 연결과 토큰이 끝난 연결을 닫는다. 걷는 사람이 없어도 앱은 2초마다 위치를 보내므로 방에 사람이 있는 동안은 돈다.
  // 방이 조용해 돌지 않으면 보여 줄 상대도 없으니 알람으로 깨우지 않는다(객체를 잠들게 둔다).
  private sweep(now: number) {
    this.lastSweepAt = now
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.attachmentOf(ws)
      if (!a) continue
      const pongAt = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0
      if (a.expiresAt <= now) this.closeAndForget(ws, CLOSE_TOKEN_EXPIRED, 'token expired')
      else if (now - Math.max(a.heardAt, pongAt) > STALE_CONNECTION_MS) this.closeAndForget(ws, CLOSE_STALE, 'stale')
    }
  }

  // 응답이 없는 상대에게는 webSocketClose 가 오지 않을 수 있어 직접 정리한다.
  private closeAndForget(ws: WebSocket, code: number, reason: string) {
    this.forget(ws)
    try {
      ws.close(code, reason)
    } catch {
      // 이미 닫혔다
    }
  }

  // 연결 하나를 지운다. 그 사람의 위치를 들고 있는 연결이 더 없으면 나간 것으로 알린다.
  private forget(ws: WebSocket) {
    const a = this.attachmentOf(ws)
    if (!a) return
    ws.serializeAttachment(null) // 두 번 지워도 나간 알림이 두 번 가지 않게 한다
    this.rates.delete(a.conn)
    const holder = this.ctx.getWebSockets().map((other) => this.attachmentOf(other)).find((o) => o?.userId === a.userId && o.state)
    if (holder?.state) {
      this.latest.set(a.userId, holder.state)
      return
    }
    if (!this.latest.delete(a.userId)) return
    this.pending.delete(a.userId)
    this.gone.add(a.userId)
    this.requestFlush(Date.now())
  }
}
