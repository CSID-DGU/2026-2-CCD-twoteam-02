// 친구 기능의 계산. React·DB 와 무관한 순수 로직입니다.
//
// 닉네임은 겹칠 수 있어서 "민수#4F2A"처럼 계정 번호(uuid) 앞 네 자리를 태그로 붙여 구분합니다.

export const TAG_LENGTH = 4

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
