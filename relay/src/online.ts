// 사이트 전체 접속 표시 방 (#473). 서비스 전체에 하나만 있다.
//
// 예전에는 Supabase Realtime 의 Presence 방(online)에 모두가 들어갔다. 무료 플랜은 동시 연결 200개와
// Presence 초당 메시지 상한이 있어, 측정상 100명이 1분에 한 번씩 상태를 바꾸면 절반 넘게 목록에서 사라졌다.
// 그래서 같은 일을 위치 중계 Worker 에서 한다. 탭마다 연결 하나, 상태는 연결에 붙여 둔다.
//
// ── 메시지 형식 (JSON 글자) ──────────────────────────────────────────
//
//   받는 것  {t:'o', m:상태}                     내 탭의 상태 (있는 곳, 공부 중, 방해금지, 채널, 탭 정보)
//            {t:'c', i, to:{u}|{g}, e, p}        채팅·알림 보내기 (친구 한 명 또는 내 그룹)
//            {t:'r', k:토큰}                     친구·그룹이 바뀌었으니 다시 읽어 달라 (토큰으로 DB 를 읽는다)
//            'ping'                              살아 있음 (런타임이 객체를 깨우지 않고 'pong' 으로 답한다)
//   보내는 것 {t:'f', p:[[연결, 계정, 상태]...]}  입장 명단. 들어온 사람에게만
//            {t:'d', p:[...], g:[연결...]}        1초마다 묶은 변경과 나간 연결
//            {t:'c', f:보낸 사람, g?, e, p}        받은 채팅·알림
//            {t:'k', i, ok}                      보낸 채팅을 전달했는지 (친구·그룹이 아니면 ok:false)
//
// 잠들기·요금은 위치 방(room.ts)과 같다. 상태는 들어올 때와 바뀔 때만 오므로 객체는 대부분 잠들어 있다.
//
// 채널 배정 (#481): 채널은 장소를 모두 포함한 세계라 인원을 채널 전체로 센다. 탭마다 올린 채널 번호를 가진 곳이
// 여기뿐이라 배정도 여기서 한다(POST /assign, index.ts 의 GET /channels 가 넘겨줌).
// 상태를 올리지 않은 연결은 명단에 넣지 않는다(화면은 연결하자마자 올린다).
//
// 채팅 (#473): 모두가 이 방에 붙어 있으므로 채팅도 여기서 전달한다. 연결이 새로 늘지 않는다.
// 보내는 사람의 친구·그룹 목록을 접속할 때 그 사람의 토큰으로 DB 에서 읽어(RLS 가 그 사람 것만 줌) 저장소에 둔다.
// 객체가 잠들면 필드는 사라지므로 저장소(SQLite)에 두고, 그 사람의 마지막 탭이 나가면 지운다. 판정은 chatLogic.ts.
import { DurableObject } from 'cloudflare:workers'
import {
  CLOSE_FULL, CLOSE_NOT_TEXT, CLOSE_REPLACED, CLOSE_STALE, CLOSE_TOKEN_EXPIRED, CLOSE_TOO_BIG, CLOSE_TOO_FAST,
  STALE_CONNECTION_MS, SWEEP_INTERVAL_MS, countMessage, flushDelay,
} from './relayLogic'
import type { RateWindow } from './relayLogic'
import { assignChannel, AUTO_FILL, CHANNEL_CAPACITY, channelCounts, channelTally, TOTAL_CAPACITY, totalCount } from './relayLogic'
import type { AssignMode, Holds, Members } from './relayLogic'
import { ONLINE_MAX_CONNECTIONS, ONLINE_MAX_PER_USER, ONLINE_TICK_MS, sameMeta, sanitizeMeta } from './onlineLogic'
import type { OnlineEntry, OnlineMeta } from './onlineLogic'
import { EXPIRES_HEADER, SUBPROTOCOL, USER_HEADER } from './room'
import type { RelayEnv } from './index'
import { verifyToken } from './auth'
import { chatTargets, peersFrom, sanitizeChat } from './chatLogic'
import type { ChatPeers } from './chatLogic'

export const TOKEN_HEADER = 'x-relay-token' // 접속할 때 친구·그룹을 읽으려고 index.ts 가 넘겨주는 토큰 (클라이언트가 보낸 머리글은 넘어오지 않는다)
const ONLINE_MAX_MESSAGE_BYTES = 8192 // 다시 읽기({t:'r'})에 토큰이 실려 위치 방보다 크게 둔다
const peersKey = (userId: string) => `peers:${userId}`

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
  private peers = new Map<string, ChatPeers>() // 사람마다 대화할 수 있는 사람 (저장소의 사본. 잠들면 사라져 저장소에서 다시 읽는다)
  private loading = new Map<string, { again: string | null }>() // 친구·그룹을 읽는 중인 사람. 그사이 다시 읽어 달라고 하면 끝난 뒤 한 번 더

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
    const token = request.headers.get(TOKEN_HEADER)
    if (token) this.ctx.waitUntil(this.loadPeers(userId, token))
    return respond()
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.attachmentOf(ws)
    if (!a) return
    if (typeof message !== 'string') return ws.close(CLOSE_NOT_TEXT, 'text only')
    if (message.length > ONLINE_MAX_MESSAGE_BYTES) return ws.close(CLOSE_TOO_BIG, 'too big')
    const now = Date.now()
    if (a.expiresAt <= now) return ws.close(CLOSE_TOKEN_EXPIRED, 'token expired')

    const rate = this.rates.get(a.conn) ?? { startedAt: now, count: 0 }
    this.rates.set(a.conn, rate)
    const verdict = countMessage(rate, now)
    if (verdict === 'close') return ws.close(CLOSE_TOO_FAST, 'too fast')
    if (verdict === 'drop') return

    let parsed: { t?: unknown; m?: unknown; i?: unknown; k?: unknown }
    try {
      const value: unknown = JSON.parse(message)
      if (typeof value !== 'object' || value === null) return
      parsed = value
    } catch {
      return
    }
    if (parsed.t === 'c') return this.chat(ws, a, parsed)
    if (parsed.t === 'r') return this.refreshPeers(a, parsed.k)
    if (parsed.t !== 'o') return
    const meta = sanitizeMeta(parsed.m)
    if (!meta) return
    ws.serializeAttachment({ ...a, heardAt: now, meta } satisfies Attachment)
    if (sameMeta(a.meta, meta)) return
    this.pending.set(a.conn, [a.conn, a.userId, meta])
    this.gone.delete(a.conn)
    this.requestFlush(now)
  }

  // 채팅·알림 전달. 받는 사람의 모든 탭으로 보내고, 보낸 탭에 전달했는지 알려 준다
  private async chat(ws: WebSocket, a: Attachment, parsed: { i?: unknown }) {
    const id = typeof parsed.i === 'number' && Number.isInteger(parsed.i) ? parsed.i : null
    const msg = sanitizeChat(parsed)
    const targets = new Set(msg ? chatTargets(await this.peersOf(a.userId), msg.to) : [])
    if (msg && targets.size > 0) {
      const out = JSON.stringify({ t: 'c', f: a.userId, ...('g' in msg.to ? { g: msg.to.g } : {}), e: msg.e, p: msg.p })
      for (const other of this.ctx.getWebSockets()) {
        const b = this.attachmentOf(other)
        if (!b || !targets.has(b.userId)) continue
        try {
          other.send(out)
        } catch {
          // 막 닫힌 연결이다
        }
      }
    }
    if (id !== null) ws.send(JSON.stringify({ t: 'k', i: id, ok: targets.size > 0 }))
  }

  // 화면이 친구·그룹이 바뀌었다고 알리면 토큰을 확인하고 다시 읽는다 (토큰의 계정이 이 연결의 계정이어야 한다)
  private async refreshPeers(a: Attachment, token: unknown) {
    if (typeof token !== 'string' || !this.env.SUPABASE_URL) return
    const who = await verifyToken(token, { supabaseUrl: this.env.SUPABASE_URL.replace(/\/$/, ''), hs256Secret: this.env.JWT_HS256_SECRET })
    if (who?.userId !== a.userId) return
    await this.loadPeers(a.userId, token)
  }

  private async peersOf(userId: string): Promise<ChatPeers | null> {
    const cached = this.peers.get(userId)
    if (cached) return cached
    const stored = (await this.ctx.storage.get<ChatPeers>(peersKey(userId))) ?? null
    if (stored) this.peers.set(userId, stored)
    return stored
  }

  // 그 사람의 토큰으로 친구·그룹을 읽는다. RLS 가 그 사람이 볼 수 있는 행만 준다(0012, 0029)
  private async loadPeers(userId: string, token: string): Promise<void> {
    const running = this.loading.get(userId)
    if (running) {
      running.again = token
      return
    }
    const job = { again: null as string | null }
    this.loading.set(userId, job)
    try {
      const url = this.env.SUPABASE_URL?.replace(/\/$/, '')
      const key = this.env.SUPABASE_PUBLISHABLE_KEY
      if (!url || !key) return // 설정이 없으면 채팅을 전달하지 않는다
      const headers = { apikey: key, Authorization: `Bearer ${token}` }
      const [friends, members] = await Promise.all([
        fetch(`${url}/rest/v1/friendships?select=requester_id,addressee_id&status=eq.accepted`, { headers }),
        fetch(`${url}/rest/v1/chat_group_members?select=group_id,user_id`, { headers }),
      ])
      if (!friends.ok || !members.ok) return
      const peers = peersFrom(userId, await friends.json(), await members.json())
      if (!this.hasConnection(userId)) return // 읽는 사이 나갔다
      this.peers.set(userId, peers)
      await this.ctx.storage.put(peersKey(userId), peers)
    } catch {
      // 읽지 못하면 들고 있던 목록으로 버틴다
    } finally {
      this.loading.delete(userId)
      if (job.again) await this.loadPeers(userId, job.again)
    }
  }

  private hasConnection(userId: string) {
    return this.ctx.getWebSockets().some((ws) => this.attachmentOf(ws)?.userId === userId)
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
    if (!this.hasConnection(a.userId)) {
      // 마지막 탭이 나가면 친구·그룹 목록을 지운다. 다음에 접속할 때 다시 읽는다
      this.peers.delete(a.userId)
      void this.ctx.storage.delete(peersKey(a.userId))
    }
    if (!a.meta) return
    this.pending.delete(a.conn)
    this.gone.add(a.conn)
    this.requestFlush(Date.now())
  }
}
