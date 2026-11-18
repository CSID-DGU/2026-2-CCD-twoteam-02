// 친구 기능의 계산. React·DB 와 무관한 순수 로직입니다.
//
// 닉네임은 겹칠 수 있어서 "민수#4F2A"처럼 계정 번호(uuid) 앞 네 자리를 태그로 붙여 구분합니다.

export const TAG_LENGTH = 4

// 마지막 접속 글의 구간 (lastSeenLabel)
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const JUST_NOW_MS = 2 * MINUTE_MS // 접속 신호가 1분마다라, 이 안이면 "방금 전"
const DATE_AFTER_DAYS = 7 // 이보다 오래됐으면 "N일 전" 대신 날짜

// 접속하지 않은 친구 옆에 보일 글. 기록이 없으면(0073 적용 뒤 접속한 적 없음) "접속 안 함"
export function lastSeenLabel(lastSeenMs: number | undefined, nowMs: number): string {
  if (lastSeenMs === undefined || !Number.isFinite(lastSeenMs)) return '접속 안 함'
  const ago = Math.max(0, nowMs - lastSeenMs)
  if (ago < JUST_NOW_MS) return '마지막 접속 방금 전'
  if (ago < HOUR_MS) return `마지막 접속 ${Math.floor(ago / MINUTE_MS)}분 전`
  if (ago < DAY_MS) return `마지막 접속 ${Math.floor(ago / HOUR_MS)}시간 전`
  if (ago < DATE_AFTER_DAYS * DAY_MS) return `마지막 접속 ${Math.floor(ago / DAY_MS)}일 전`
  const d = new Date(lastSeenMs)
  const year = d.getFullYear() === new Date(nowMs).getFullYear() ? '' : `${d.getFullYear()}년 `
  return `마지막 접속 ${year}${d.getMonth() + 1}월 ${d.getDate()}일`
}

export type Friendship = {
  id: number
  requesterId: string
  addresseeId: string
  status: 'pending' | 'accepted'
}

// 나와 상대의 관계
export type Relation = 'friend' | 'sent' | 'received' | 'none'

export const tagOf = (userId: string) => userId.replace(/-/g, '').slice(0, TAG_LENGTH).toUpperCase()

export const displayName = (nickname: string, userId: string) => `${nickname}#${tagOf(userId)}`

// 검색어 해석: "민수", "민수#4f2a" 를 받습니다. 검색은 닉네임으로 하므로 태그만으로는 찾지 않습니다.
export function parseQuery(raw: string): { name: string; tag: string } {
  const text = raw.trim()
  const at = text.lastIndexOf('#')
  if (at < 0) return { name: text, tag: '' }
  return { name: text.slice(0, at).trim(), tag: text.slice(at + 1).trim().toUpperCase() }
}

// 검색 결과 거르기: 나는 빼고, 태그를 적었으면 태그가 맞는 사람만
export function matchUsers<T extends { id: string; nickname: string }>(users: T[], query: string, myId: string): T[] {
  const { tag } = parseQuery(query)
  return users.filter((u) => u.id !== myId && (!tag || tagOf(u.id).startsWith(tag)))
}

// 상대 쪽 계정 번호
export const otherOf = (f: Friendship, myId: string) => (f.requesterId === myId ? f.addresseeId : f.requesterId)

export function relationOf(list: Friendship[], myId: string, otherId: string): Relation {
  const f = list.find((x) => otherOf(x, myId) === otherId)
  if (!f) return 'none'
  if (f.status === 'accepted') return 'friend'
  return f.requesterId === myId ? 'sent' : 'received'
}

// 화면의 세 칸으로 나눕니다.
export function splitFriendships(list: Friendship[], myId: string) {
  return {
    friends: list.filter((f) => f.status === 'accepted'),
    received: list.filter((f) => f.status === 'pending' && f.addresseeId === myId),
    sent: list.filter((f) => f.status === 'pending' && f.requesterId === myId),
  }
}
