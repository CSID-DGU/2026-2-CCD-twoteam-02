// 친구 귓속말·그룹 채팅 계산 (#49, #298). 화면·React와 무관한 순수 로직입니다.
//
// 귓속말은 친구 두 사람마다 있는 비공개 실시간 방(whisper:{작은 번호}:{큰 번호})으로,
// 그룹 채팅은 내 그룹의 비공개 실시간 방(group:{그룹 번호})으로, 회의 채팅은 회의 방(meeting:{회의 번호})으로 주고받습니다.
// 메시지는 어디에도 저장하지 않습니다(0019, 0021, 0029). 기록은 각자 화면에만 있습니다.
//
// 입력 방법: 명령어 없이 Enter → 할 말 → Enter. 받는 사람(친구·그룹·회의)은 Tab 으로 바꿉니다.
// 처음 열 때는 마지막으로 나에게 말을 건 곳, 없으면 목록의 첫 번째가 골라져 있습니다.

export const MAX_LENGTH = 100 // 한 번에 보낼 수 있는 글자 수
export const SEND_GAP_MS = 1000 // 이보다 빨리 연달아 보내지 못함 (도배 방지)
export const WHISPER_EVENT = 'whisper' // 실시간 방에서 쓰는 메시지 이름
// 회의 초대 알림 (#45). 같은 친구 방으로 회의 번호만 보냅니다. 받은 쪽이 DB 에서 회의를 확인하고, 들어갈 때도 DB 가 초대를 다시 확인합니다.
export const INVITE_EVENT = 'meeting-invite'

// 그룹 채팅 (#298). 오버워치 파티처럼 한 사람은 그룹 하나에만 있고, 친구를 초대해 수락하면 들어옵니다.
// 인원·초대 시간은 DB(0029)의 규칙과 같아야 합니다.
export const GROUP_EVENT = 'group-chat' // 그룹 방에서 쓰는 메시지 이름
export const GROUP_CHANGED_EVENT = 'group-changed' // 그룹 방: 누가 들어오거나 나갔으니 멤버를 다시 읽으라는 알림
export const GROUP_INVITE_EVENT = 'group-invite' // 귓속말 방: 그룹 초대를 보냈다는 알림 (초대 자체는 DB 에 있음)
export const GROUP_JOINED_EVENT = 'group-joined' // 귓속말 방: 내 초대를 수락해 그룹에 들어왔다는 알림
export const GROUP_MAX_MEMBERS = 10
// 친구 따라가기·부르기 (src/friends/followLogic). 같은 친구 방(귓속말 방)으로 보내고 저장하지 않습니다.
export const SUMMON_EVENT = 'summon' // 내가 있는 곳으로 와 달라는 부름. 받은 쪽 로그에 [부름] 줄 (갈 곳은 받은 쪽이 접속 상태로 정함)
export const ARRIVED_EVENT = 'arrived' // 따라왔다·부름을 받고 왔다는 알림 { how: 'follow' | 'summon' }
export const GROUP_INVITE_MS = 5 * 60 * 1000 // 초대가 사라지기까지

export type Friend = { id: string; nickname: string }

// 내 그룹. members 는 나를 뺀 멤버입니다.
export type Group = { id: number; members: Friend[] }
// 지금 있는 회의. members 는 지금 회의 방에 있는 다른 사람입니다.
export type MeetingRoom = { id: number; members: Friend[] }

// 받는 사람: 친구 한 명, 내 그룹, 지금 있는 회의.
// key 는 친구면 계정 번호, 그룹이면 group:번호, 회의면 meeting:번호입니다. 계정 번호(uuid)와 겹치지 않습니다.
export type Recipient = { key: string; name: string; kind: 'friend' | 'group' | 'meeting' }

// 두 사람의 귓속말 방 이름. 누가 계산해도 같도록 번호 순서로 정렬합니다. (0019 규칙과 같아야 함)
export function pairTopic(a: string, b: string): string {
  return a < b ? `whisper:${a}:${b}` : `whisper:${b}:${a}`
}

// 그룹 방 이름 (0029 규칙과 같아야 함). 받는 사람 key 로도 씁니다.
export const groupTopic = (groupId: number) => `group:${groupId}`
export const meetingKey = (meetingId: number) => `meeting:${meetingId}`

// 채팅창에서 고를 수 있는 받는 사람: 접속한 친구, 다른 멤버가 접속한 내 그룹, 다른 사람이 있는 회의
export function recipientsOf(
  online: Friend[],
  group: Group | null,
  meeting: MeetingRoom | null,
  isOnline: (id: string) => boolean,
): Recipient[] {
  const list: Recipient[] = online.map((f) => ({ key: f.id, name: f.nickname, kind: 'friend' }))
  if (group && group.members.some((m) => isOnline(m.id))) list.push({ key: groupTopic(group.id), name: '그룹', kind: 'group' })
  if (meeting && meeting.members.length > 0) list.push({ key: meetingKey(meeting.id), name: '회의', kind: 'meeting' })
  return list
}

export type Checked = { ok: true; to: string; text: string } | { ok: false; error: string }

// 보낼 수 있는지 확인합니다. 빈 칸이면 error 가 '' 입니다(그냥 닫기).
export function checkMessage(raw: string, target: string | null, recipients: Recipient[]): Checked {
  const text = raw.trim()
  if (!text) return { ok: false, error: '' }
  if (!target) return { ok: false, error: recipients.length ? 'Tab 으로 받는 사람을 고르세요.' : '지금 접속한 친구가 없어요.' }
  if (!recipients.some((r) => r.key === target)) return { ok: false, error: '지금 접속해 있지 않아요. Tab 으로 바꿔 주세요.' }
  if (text.length > MAX_LENGTH) return { ok: false, error: `${MAX_LENGTH}자까지 보낼 수 있어요.` }
  return { ok: true, to: target, text }
}

// 로그창을 열 때 골라 둘 받는 사람: 지금 고른 곳이 있으면 그대로, 아니면 마지막으로 나에게 말을 건 곳, 그것도 아니면 첫 번째
export function defaultTarget(current: string | null, lastFrom: string | null, recipients: Recipient[]): string | null {
  const has = (key: string | null) => key !== null && recipients.some((r) => r.key === key)
  if (has(current)) return current
  if (has(lastFrom)) return lastFrom
  return recipients[0]?.key ?? null
}

// Tab 으로 다음 받는 사람 고르기. 목록 끝이면 처음으로 돌아갑니다.
export function nextTarget(current: string | null, recipients: Recipient[]): string | null {
  if (recipients.length === 0) return null
  const i = recipients.findIndex((r) => r.key === current)
  return recipients[(i + 1) % recipients.length].key
}

// 친구·그룹 색: 이번 접속에서 그 친구(그룹)와 처음 이야기할 때 아직 안 쓴 색 중 하나를 무작위로 줍니다.
// 접속하는 동안만 유지하고(새로고침·로그아웃하면 다시 정함), 다 쓰면 그때부터는 겹칠 수 있습니다.
// 어두운 반투명 로그창 위에서 잘 읽히는 밝은 색들입니다.
export const FRIEND_COLORS = [
  '#f9a8d4', // 분홍
  '#93c5fd', // 하늘
  '#86efac', // 초록
  '#fde047', // 노랑
  '#fdba74', // 주황
  '#c4b5fd', // 보라
  '#67e8f9', // 청록
  '#fca5a5', // 빨강
  '#f0abfc', // 자주
  '#bef264', // 연두
]

// used: 이미 다른 친구·그룹에게 준 색, random: 0 이상 1 미만 (Math.random())
export function pickColor(used: string[], random: number): string {
  const free = FRIEND_COLORS.filter((c) => !used.includes(c))
  const pool = free.length > 0 ? free : FRIEND_COLORS
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]
}

// 방해금지인지 (#216)
//   공부 중: 공부를 시작하면 자동으로 켜지고, 그 공부 동안 직접 끌 수 있음(studyOff)
//   공부 중이 아닐 때: 직접 켰는지(manual)
// locked: 지점 규칙으로 방해금지가 고정됨(캠빛 대학교 도서관). 그동안은 직접 꺼도 켜져 있습니다.
export const isQuiet = (studying: boolean, manual: boolean, studyOff: boolean, locked = false) => locked || (studying ? !studyOff : manual)

// 몇 분 전에 주고받았는지 (#211). 채팅창을 열었을 때 줄 끝에 붙입니다.
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  return `${Math.floor(minutes / 60)}시간 전`
}
