// 친구 귓속말 계산 (#49). 화면·React와 무관한 순수 로직입니다.
//
// 귓속말은 친구 두 사람마다 있는 비공개 실시간 방(whisper:{작은 번호}:{큰 번호})으로 주고받습니다.
// 메시지는 어디에도 저장하지 않습니다(0019). 기록은 각자 화면에만 있습니다.
//
// 입력 방법: 명령어 없이 Enter → 할 말 → Enter. 받는 친구는 Tab 으로 바꿉니다.
// 처음 열 때는 마지막으로 나에게 귓속말한 친구, 없으면 접속한 첫 친구가 골라져 있습니다.

export const MAX_LENGTH = 100 // 한 번에 보낼 수 있는 글자 수
export const SEND_GAP_MS = 1000 // 이보다 빨리 연달아 보내지 못함 (도배 방지)
export const WHISPER_EVENT = 'whisper' // 실시간 방에서 쓰는 메시지 이름
// 회의 초대 알림 (#45). 같은 친구 방으로 회의 번호만 보냅니다. 받은 쪽이 DB 에서 회의를 확인하고, 들어갈 때도 DB 가 초대를 다시 확인합니다.
export const INVITE_EVENT = 'meeting-invite'

export type Friend = { id: string; nickname: string }

// 두 사람의 귓속말 방 이름. 누가 계산해도 같도록 번호 순서로 정렬합니다. (0019 규칙과 같아야 함)
export function pairTopic(a: string, b: string): string {
  return a < b ? `whisper:${a}:${b}` : `whisper:${b}:${a}`
}

export type Checked = { ok: true; to: string; text: string } | { ok: false; error: string }

// 보낼 수 있는지 확인합니다. 빈 칸이면 error 가 '' 입니다(그냥 닫기).
export function checkMessage(raw: string, target: string | null, online: Friend[]): Checked {
  const text = raw.trim()
  if (!text) return { ok: false, error: '' }
  if (!target) return { ok: false, error: online.length ? 'Tab 으로 받는 친구를 고르세요.' : '지금 접속한 친구가 없어요.' }
  if (!online.some((f) => f.id === target)) return { ok: false, error: '그 친구는 지금 접속해 있지 않아요. Tab 으로 바꿔 주세요.' }
  if (text.length > MAX_LENGTH) return { ok: false, error: `${MAX_LENGTH}자까지 보낼 수 있어요.` }
  return { ok: true, to: target, text }
}

// 로그창을 열 때 골라 둘 친구: 지금 고른 친구가 접속해 있으면 그대로, 아니면 마지막으로 귓속말한 친구, 그것도 아니면 첫 친구
export function defaultTarget(current: string | null, lastFrom: string | null, online: Friend[]): string | null {
  const isOnline = (id: string | null) => id !== null && online.some((f) => f.id === id)
  if (isOnline(current)) return current
  if (isOnline(lastFrom)) return lastFrom
  return online[0]?.id ?? null
}

// Tab 으로 다음 친구 고르기. 목록 끝이면 처음으로 돌아갑니다.
export function nextTarget(current: string | null, online: Friend[]): string | null {
  if (online.length === 0) return null
  const i = online.findIndex((f) => f.id === current)
  return online[(i + 1) % online.length].id
}

// 친구 색: 이번 접속에서 그 친구와 처음 이야기할 때 아직 안 쓴 색 중 하나를 무작위로 줍니다.
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

// used: 이미 다른 친구에게 준 색, random: 0 이상 1 미만 (Math.random())
export function pickColor(used: string[], random: number): string {
  const free = FRIEND_COLORS.filter((c) => !used.includes(c))
  const pool = free.length > 0 ? free : FRIEND_COLORS
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]
}

// 방해금지인지 (#216)
//   공부 중: 공부를 시작하면 자동으로 켜지고, 그 공부 동안 직접 끌 수 있음(studyOff)
//   공부 중이 아닐 때: 직접 켰는지(manual)
export const isQuiet = (studying: boolean, manual: boolean, studyOff: boolean) => (studying ? !studyOff : manual)

// 몇 분 전에 주고받았는지 (#211). 채팅창을 열었을 때 줄 끝에 붙입니다.
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  return `${Math.floor(minutes / 60)}시간 전`
}
