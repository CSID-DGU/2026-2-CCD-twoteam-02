// 사이트 전체 접속 표시 방 (#473). 서비스 전체에 하나만 있다.
//
// 예전에는 Supabase Realtime 의 Presence 방(online)에 모두가 들어갔다. 무료 플랜은 동시 연결 200개와
// Presence 초당 메시지 상한이 있어, 측정상 100명이 1분에 한 번씩 상태를 바꾸면 절반 넘게 목록에서 사라졌다.
// 그래서 같은 일을 위치 중계 Worker 에서 한다. 탭마다 연결 하나, 상태는 연결에 붙여 둔다.
//
// ── 메시지 형식 (JSON 글자) ──────────────────────────────────────────
//
//   받는 것  {t:'o', m:상태}                     내 탭의 상태 (있는 곳, 공부 중, 방해금지, 채널, 탭 정보)
//            'ping'                              살아 있음 (런타임이 객체를 깨우지 않고 'pong' 으로 답한다)
//   보내는 것 {t:'f', p:[[연결, 계정, 상태]...]}  입장 명단. 들어온 사람에게만
//            {t:'d', p:[...], g:[연결...]}        1초마다 묶은 변경과 나간 연결
//
// 잠들기·요금은 위치 방(room.ts)과 같다. 상태는 들어올 때와 바뀔 때만 오므로 객체는 대부분 잠들어 있다.
//
// 채널 배정 (#481): 채널은 장소를 모두 포함한 세계라 인원을 채널 전체로 센다. 탭마다 올린 채널 번호를 가진 곳이
// 여기뿐이라 배정도 여기서 한다(POST /assign, index.ts 의 GET /channels 가 넘겨줌).
// 상태를 올리지 않은 연결은 명단에 넣지 않는다(화면은 연결하자마자 올린다).
import { DurableObject } from 'cloudflare:workers'
import {
  CLOSE_FULL, CLOSE_NOT_TEXT, CLOSE_REPLACED, CLOSE_STALE, CLOSE_TOKEN_EXPIRED, CLOSE_TOO_BIG, CLOSE_TOO_FAST,
  MAX_MESSAGE_BYTES, STALE_CONNECTION_MS, SWEEP_INTERVAL_MS, countMessage, flushDelay,
} from './relayLogic'
import type { RateWindow } from './relayLogic'
import { assignChannel, AUTO_FILL, CHANNEL_CAPACITY, channelCounts, channelTally, TOTAL_CAPACITY, totalCount } from './relayLogic'
import type { AssignMode, Holds, Members } from './relayLogic'
import { ONLINE_MAX_CONNECTIONS, ONLINE_MAX_PER_USER, ONLINE_TICK_MS, sameMeta, sanitizeMeta } from './onlineLogic'
import type { OnlineEntry, OnlineMeta } from './onlineLogic'
import { EXPIRES_HEADER, SUBPROTOCOL, USER_HEADER } from './room'
import type { RelayEnv } from './index'

type Attachment = {
  conn: string
  userId: string
  expiresAt: number
  heardAt: number
  meta: OnlineMeta | null // 이 탭이 마지막으로 올린 상태. 아직 안 올렸으면 null
}

export class OnlineRoom extends DurableObject<RelayEnv> {
  private pending = new Map<string, OnlineEntry>() // 이번 틱에 바뀐 연결
  private gone = new Set<string>() // 이번 틱에 나간 연결
  private rates = new Map<string, RateWindow>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastFlushAt = 0
  private lastSweepAt = 0
  private holds: Holds = new Map() // 채널을 안내받고 아직 들어오지 않은 사람. 잠들면 사라져도 15초짜리라 상관없다

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  private attachmentOf(ws: WebSocket) {
    return ws.deserializeAttachment() as Attachment | null
  }

  private entries(): OnlineEntry[] {
    const list: OnlineEntry[] = []
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.attachmentOf(ws)
      if (a?.meta) list.push([a.conn, a.userId, a.meta])
    }
    return list
  }

  // 사람마다 지금 채널. 탭이 여럿이면 장면 안에서 가장 나중에 들어온 탭(#347 에서 쓰는 탭)의 채널, 없으면 가장 나중 탭의 채널
  private members(): Members {
    const best = new Map<string, { channel: number; scene: boolean; since: number }>()
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.attachmentOf(ws)
      const channel = a?.meta?.channel
      if (!a?.meta || channel === undefined) continue
      const cur = best.get(a.userId)
      const better = !cur || (a.meta.scene && !cur.scene) || (a.meta.scene === cur.scene && a.meta.since > cur.since)
      if (better) best.set(a.userId, { channel, scene: a.meta.scene, since: a.meta.since })
    }
    return new Map([...best].map(([id, b]) => [id, b.channel]))
  }

  // 채널 배정·현황 (index.ts 가 토큰을 확인한 뒤에만 부른다)
  private assign(body: { want: number | null; mode: AssignMode; userId: string; peek: boolean }): Response {
    const now = Date.now()
    const members = this.members()
    const result = body.peek ? null : assignChannel(body.want, body.mode, body.userId, members, this.holds, now)
    return Response.json({
      assigned: result && 'no' in result ? result.no : null, // null: 입장 대기 (또는 peek)
      full: result !== null && 'full' in result, // 고른 채널이 가득 참. 지금 채널에 그대로 있는다
      total: totalCount(members, this.holds, now),
      channels: channelCounts(channelTally(members, this.holds)),
      capacity: CHANNEL_CAPACITY,
      autoFill: AUTO_FILL,
      totalCapacity: TOTAL_CAPACITY,
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/assign') return this.assign(await request.json())
    const userId = request.headers.get(USER_HEADER)
    const expiresAt = Number(request.headers.get(EXPIRES_HEADER))
    if (!userId || !expiresAt) return new Response('bad request', { status: 400 })

    const { 0: client, 1: server } = new WebSocketPair()
    const respond = () => new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': SUBPROTOCOL } })
    const now = Date.now()
    if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) this.sweep(now) // 조용한 방도 새 사람이 올 때는 죽은 연결을 정리한다
    const sockets = this.ctx.getWebSockets()
    if (sockets.length >= ONLINE_MAX_CONNECTIONS) {
      server.accept()
      server.close(CLOSE_FULL, 'room full')
      return respond()
    }
    this.ctx.acceptWebSocket(server)

    const mine = sockets.filter((ws) => this.attachmentOf(ws)?.userId === userId)
    if (mine.length >= ONLINE_MAX_PER_USER) {
      const heardAt = (ws: WebSocket) => this.attachmentOf(ws)?.heardAt ?? 0
      this.closeAndForget(mine.reduce((old, ws) => (heardAt(ws) < heardAt(old) ? ws : old)), CLOSE_REPLACED, 'replaced')
    }

    server.serializeAttachment({ conn: crypto.randomUUID(), userId, expiresAt, heardAt: now, meta: null } satisfies Attachment)
    server.send(JSON.stringify({ t: 'f', p: this.entries() }))
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
    if (verdict === 'drop') return

    let parsed: { t?: unknown; m?: unknown }
    try {
      const value: unknown = JSON.parse(message)
      if (typeof value !== 'object' || value === null) return
      parsed = value
    } catch {
      return
    }
    if (parsed.t !== 'o') return
    const meta = sanitizeMeta(parsed.m)
    if (!meta) return
    ws.serializeAttachment({ ...a, heardAt: now, meta } satisfies Attachment)
    if (sameMeta(a.meta, meta)) return
    this.pending.set(a.conn, [a.conn, a.userId, meta])
    this.gone.delete(a.conn)
    this.requestFlush(now)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.forget(ws)
    try {
      ws.close(1000)
    } catch {
      // 이미 닫혔다
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.forget(ws)
  }

  private requestFlush(now: number) {
    if (this.timer) return
    const delay = flushDelay(this.lastFlushAt, now, ONLINE_TICK_MS)
    if (delay === 0) {
      this.flush(now)
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush(Date.now())
    }, delay)
  }

  private flush(now: number) {
    this.lastFlushAt = now
    if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) this.sweep(now)
    if (this.pending.size === 0 && this.gone.size === 0) return
    const batch = JSON.stringify({ t: 'd', p: [...this.pending.values()], ...(this.gone.size > 0 ? { g: [...this.gone] } : {}) })
    this.pending.clear()
    this.gone.clear()
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(batch)
      } catch {
        // 막 닫힌 연결이다
      }
    }
  }

  // 토큰이 끝났거나 소식이 끊긴 연결을 닫는다 (위치 방과 같은 기준)
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

  private closeAndForget(ws: WebSocket, code: number, reason: string) {
    this.forget(ws)
    try {
      ws.close(code, reason)
    } catch {
      // 이미 닫혔다
    }
  }

  private forget(ws: WebSocket) {
    const a = this.attachmentOf(ws)
    if (!a) return
    ws.serializeAttachment(null) // 두 번 지워도 나간 알림이 두 번 가지 않게 한다
    this.rates.delete(a.conn)
    if (!a.meta) return
    this.pending.delete(a.conn)
    this.gone.add(a.conn)
    this.requestFlush(Date.now())
  }
}
