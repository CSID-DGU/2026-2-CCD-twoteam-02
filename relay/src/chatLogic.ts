// 채팅 전달 판정과 값 검사 (Cloudflare·화면과 무관한 순수 로직) (#473)
//
// 귓속말·그룹 채팅·회의 초대·부르기 같은 알림을 접속 표시 방(online.ts)이 전달한다.
// 예전에는 친구 두 사람마다 Supabase 비공개 방(whisper:a:b), 그룹마다 group:번호 방에 들어가 DB 규칙(0019, 0029)이
// 누가 들어올 수 있는지 확인했다. 여기서는 보내는 사람의 친구·그룹 목록을 그 사람의 토큰으로 DB 에서 읽어 두고(peersFrom),
// 받는 사람이 그 목록에 있을 때만 전달한다(chatTargets). 그래서 친구가 아닌 사람에게는 보낼 수도, 받을 수도 없다.
// 메시지는 예전처럼 어디에도 저장하지 않는다.
//
// 내용은 아는 칸만 골라 새 객체로 옮긴다(relayLogic 과 같은 원칙). 보낸 사람은 토큰에서 꺼낸 값을 서버가 붙인다.

// ── 기준값 ───────────────────────────────────────────────────────────
export const CHAT_MAX_TEXT = 100 // 한 번에 보낼 수 있는 글자 수 (화면 src/chat/chatLogic.ts 의 MAX_LENGTH 와 같다)
const MAX_ID = 64 // 계정 번호 길이 상한(UUID 는 36자)
const MAX_GROUP_ID = 2 ** 53 - 1

// 친구 두 사람 사이에만 오가는 알림 (예전 귓속말 방의 이벤트 이름 그대로)
const PAIR_EVENTS = new Set(['whisper', 'meeting-invite', 'group-invite', 'group-joined', 'summon', 'arrived'])
// 내 그룹 멤버에게 가는 알림 (예전 그룹 방의 이벤트 이름 그대로)
const GROUP_EVENTS = new Set(['group-chat', 'group-changed'])

// 보내는 사람이 대화할 수 있는 사람들. 접속할 때와 화면이 바뀌었다고 알릴 때 DB 에서 다시 읽는다
export type ChatPeers = { friends: string[]; group: number | null; members: string[] }
export type ChatTo = { u: string } | { g: number }
export type ChatMessage = { to: ChatTo; e: string; p: Record<string, unknown> }

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID
const isGroupId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_GROUP_ID

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const text = v.trim().slice(0, CHAT_MAX_TEXT)
  return text ? text : null
}

// 이벤트마다 아는 칸만 남긴다. 모르는 이벤트나 틀린 값이면 null
function cleanPayload(e: string, p: Record<string, unknown>): Record<string, unknown> | null {
  switch (e) {
    case 'whisper':
    case 'group-chat': {
      const text = cleanText(p.text)
      return text ? { text } : null
    }
    case 'meeting-invite':
      return isGroupId(p.meetingId) ? { meetingId: p.meetingId } : null
    case 'arrived':
      return p.how === 'follow' || p.how === 'summon' ? { how: p.how } : null
    case 'group-changed':
      return isId(p.who) && (p.change === 'join' || p.change === 'leave') ? { who: p.who, change: p.change } : null
    case 'group-invite':
    case 'group-joined':
    case 'summon':
      return {}
    default:
      return null
  }
}

// 화면이 보낸 {to:{u:친구}|{g:그룹}, e:이벤트, p:내용} 을 검사한다
export function sanitizeChat(value: unknown): ChatMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { to?: unknown; e?: unknown; p?: unknown }
  if (typeof v.e !== 'string' || typeof v.to !== 'object' || v.to === null) return null
  const p = typeof v.p === 'object' && v.p !== null ? (v.p as Record<string, unknown>) : {}
  const to = v.to as { u?: unknown; g?: unknown }
  let target: ChatTo
  if (isId(to.u) && PAIR_EVENTS.has(v.e)) target = { u: to.u }
  else if (isGroupId(to.g) && GROUP_EVENTS.has(v.e)) target = { g: to.g }
  else return null
  const payload = cleanPayload(v.e, p)
  return payload ? { to: target, e: v.e, p: payload } : null
}

// 받는 사람 계정들. 친구가 아니거나 내 그룹이 아니면 빈 목록이다(조용히 버린다)
export function chatTargets(peers: ChatPeers | null, to: ChatTo): string[] {
  if (!peers) return []
  if ('u' in to) return peers.friends.includes(to.u) ? [to.u] : []
  return peers.group === to.g ? peers.members : []
}

// DB 에서 읽은 행(그 사람의 토큰으로 읽어 RLS 가 그 사람 것만 준다)을 목록으로 바꾼다.
// friendships: 수락된 친구 관계만 골라 읽음, chat_group_members: 내 그룹의 멤버(나 포함)
export function peersFrom(me: string, friendRows: unknown, memberRows: unknown): ChatPeers {
  const friends = new Set<string>()
  for (const row of Array.isArray(friendRows) ? friendRows : []) {
    const r = row as { requester_id?: unknown; addressee_id?: unknown }
    const other = r.requester_id === me ? r.addressee_id : r.addressee_id === me ? r.requester_id : null
    if (isId(other)) friends.add(other)
  }
  let group: number | null = null
  const members = new Set<string>()
  for (const row of Array.isArray(memberRows) ? memberRows : []) {
    const r = row as { group_id?: unknown; user_id?: unknown }
    if (!isGroupId(r.group_id) || !isId(r.user_id)) continue
    group ??= r.group_id
    if (r.group_id === group && r.user_id !== me) members.add(r.user_id)
  }
  return { friends: [...friends], group, members: [...members] }
}
