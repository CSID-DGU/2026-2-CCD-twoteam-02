// 위치 중계 Worker 입구 (#451, #464).
//
// 주소: wss://{worker}/room/{방 이름}, 보기 전용 연결은 뒤에 ?watch=1 (#442)
//       wss://{worker}/online  사이트 전체 접속 표시 (#473)
// 토큰은 WebSocket 부프로토콜 칸에 ['relay.v1', 토큰] 으로 받는다. 브라우저의 WebSocket 은 머리글을 적을 수 없고,
// 주소에 넣으면 접속 기록에 토큰이 남기 때문이다.
//
// 토큰을 여기서 확인하고 통과한 연결만 방 객체로 넘긴다. 가짜 접속으로 객체가 깨어나 요금이 들지 않게 하려는 것이다.
// 우회 설정은 두지 않는다. 측정 봇은 시험용 Worker 에서만 JWT_HS256_SECRET 으로 직접 서명한 토큰을 쓴다(값이 없으면 HS256 은 모두 거절, 정식 서버에는 넣지 않는다).
import { verifyToken } from './auth'
import { ChannelDirectory } from './directory'
import { OnlineRoom, TOKEN_HEADER } from './online'
import { ONLINE_NAME } from './onlineLogic'
import { capacityOf, isAllowedRoom, isChannelWorld } from './relayLogic'
import { CAPACITY_HEADER, EXPIRES_HEADER, RelayRoom, ROOM_HEADER, SUBPROTOCOL, USER_HEADER, WATCH_HEADER } from './room'

export { ChannelDirectory, OnlineRoom, RelayRoom }

export type RelayEnv = {
  ROOM: DurableObjectNamespace<RelayRoom>
  DIRECTORY: DurableObjectNamespace<ChannelDirectory>
  ONLINE: DurableObjectNamespace<OnlineRoom>
  SUPABASE_URL?: string // 토큰 발급처. https://{프로젝트}.supabase.co
  SUPABASE_PUBLISHABLE_KEY?: string // 채팅 상대 확인용 DB 읽기에 쓰는 공개 키(#473). 화면의 VITE_SUPABASE_PUBLISHABLE_KEY 와 같은 값. 없으면 채팅을 전달하지 않는다
  JWT_HS256_SECRET?: string // 선택. 넣을 때만 HS256 토큰을 받는다
  ROOM_MAX_CONNECTIONS?: string // 선택. 방 정원을 시험 때만 바꾼다
}

function roomFromPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)$/.exec(pathname)
  if (!match) return null
  try {
    const room = decodeURIComponent(match[1])
    return isAllowedRoom(room) ? room : null
  } catch {
    return null
  }
}

// 쿠키가 아니라 토큰으로 확인하므로 다른 주소에서 불러도 된다. 화면과 Worker 의 주소가 달라 꼭 필요하다.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET' }

// GET /channels/{공간}?want=번호 → 들어갈 채널과 현황 (입장 전). ?peek=1 은 현황만 (채널 창을 열 때) (#442)
// want 만 있으면 기억한 채널을 지키고(keep), &pick=1 이면 목록에서 고르거나 친구를 따라갈 때(pick), want 가 없으면 처음 입장(auto)
// 채널은 장소를 모두 포함한 세계라(#481) 공간 이름은 확인만 하고, 배정은 접속 표시 방이 한다
async function channels(request: Request, env: RelayEnv, world: string, want: string | null, peek: boolean, pick: boolean): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (!isChannelWorld(world)) return new Response('not found', { status: 404, headers: CORS })
  if (!env.SUPABASE_URL) return new Response('not configured', { status: 500, headers: CORS })
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1]
  const who = token ? await verifyToken(token, { supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''), hs256Secret: env.JWT_HS256_SECRET }) : null
  if (!who) return new Response('unauthorized', { status: 401, headers: CORS })
  const stub = env.ONLINE.get(env.ONLINE.idFromName(ONLINE_NAME), { locationHint: 'apac' })
  const body = { want: want ? Number(want) : null, userId: who.userId, peek, mode: pick ? 'pick' : want ? 'keep' : 'auto' }
  const res = await stub.fetch('https://relay.internal/assign', { method: 'POST', body: JSON.stringify(body) })
  return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url)
    if (pathname === '/health') return new Response('ok')
    const channelsPath = /^\/channels\/([a-z]+)$/.exec(pathname)
    if (channelsPath) return channels(request, env, channelsPath[1], searchParams.get('want'), searchParams.get('peek') === '1', searchParams.get('pick') === '1')

    const online = pathname === '/online' // 사이트 전체 접속 표시 방 (#473)
    const room = online ? null : roomFromPath(pathname)
    if (!online && !room) return new Response('not found', { status: 404 })
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 })
    if (!env.SUPABASE_URL) return new Response('not configured', { status: 500 }) // 설정이 빠지면 열어 두지 않고 닫는다

    const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim())
    const token = protocols.find((p) => p !== SUBPROTOCOL)
    if (!protocols.includes(SUBPROTOCOL) || !token) return new Response('unauthorized', { status: 401 })
    const who = await verifyToken(token, { supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''), hs256Secret: env.JWT_HS256_SECRET })
    if (!who) return new Response('unauthorized', { status: 401 })

    if (online) {
      // 토큰은 접속 표시 방이 친구·그룹을 읽을 때만 쓴다 (#473 채팅)
      const headers = new Headers({ Upgrade: 'websocket', [USER_HEADER]: who.userId, [EXPIRES_HEADER]: String(who.expiresAt), [TOKEN_HEADER]: token })
      const stub = env.ONLINE.get(env.ONLINE.idFromName(ONLINE_NAME), { locationHint: 'apac' })
      return stub.fetch('https://relay.internal/online', { headers })
    }
    if (!room) return new Response('not found', { status: 404 })

    // 머리글은 새로 만든다. 클라이언트가 보낸 x-relay-* 값은 넘어가지 않는다.
    const headers = new Headers({
      Upgrade: 'websocket',
      [USER_HEADER]: who.userId,
      [EXPIRES_HEADER]: String(who.expiresAt),
      [CAPACITY_HEADER]: String(capacityOf(room, env.ROOM_MAX_CONNECTIONS)),
      [WATCH_HEADER]: searchParams.get('watch') === '1' ? '1' : '0',
      [ROOM_HEADER]: room,
    })
    // 객체는 처음 부른 곳 근처에 만들어진다. 사용자가 한국이므로 아시아태평양을 힌트로 준다.
    const stub = env.ROOM.get(env.ROOM.idFromName(room), { locationHint: 'apac' })
    return stub.fetch('https://relay.internal/connect', { headers })
  },
} satisfies ExportedHandler<RelayEnv>
