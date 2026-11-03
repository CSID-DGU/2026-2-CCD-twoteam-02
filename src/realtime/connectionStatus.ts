// 실시간 방 연결이 끊겼다는 표시를 모아 두는 곳 (#441). React와 무관한 작은 저장소입니다.
//
// 끊김을 아는 쪽(useParticipants)은 지점·광장·회의실 화면 깊숙이 있고, 안내는 앱 맨 위(OnlineProvider)가 그립니다.
// 화면 파일을 거치지 않고 잇기 위해 여기에 적고, ConnectionNotice 가 useSyncExternalStore 로 읽습니다.
// 내 화면의 연결만 적습니다. 보기 전용 연결(watchSupabase)은 적지 않습니다(통창 너머 사람이 잠시 안 보이는 건 알릴 일이 아니라서).

// 끊긴 지 이만큼 지나면 "연결이 원활하지 않아요"로 바꿉니다.
export const SLOW_NOTICE_MS = 20000

const downs = new Map<object, number>() // 연결별 끊긴 시각
const listeners = new Set<() => void>()
let downSince: number | null = null // 가장 먼저 끊긴 시각. 다 붙어 있으면 null

function changed() {
  const next = downs.size === 0 ? null : Math.min(...downs.values())
  if (next === downSince) return
  downSince = next
  listeners.forEach((listener) => listener())
}

// token: 연결마다 하나. 같은 연결이 또 끊겨도 처음 끊긴 시각을 유지합니다.
export function markDown(token: object) {
  if (!downs.has(token)) downs.set(token, Date.now())
  changed()
}

// 다시 붙었거나 화면을 떠났을 때
export function markUp(token: object) {
  downs.delete(token)
  changed()
}

export function getDownSince() {
  return downSince
}

export function subscribeNotice(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
