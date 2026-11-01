// 코르크 게시판 (board_notes, 0047). React·three 와 무관한 순수 로직입니다. (Node 로 검사)
//   - 쪽지 글 다듬기·검사, 며칠 전인지, 게시판 위 쪽지 자리(살짝 비뚤게 꽂힘)

export const BOARD = {
  maxChars: 100, // 쪽지 한 장 글자 수 (DB check 와 같음)
  keepDays: 7, // 이만큼 지나면 안 보임 (DB 보기 규칙과 같음)
  fetchLimit: 60, // 한 번에 읽는 쪽지 수 (최근 것부터)
  refreshMs: 30_000, // 다른 사람이 붙인 쪽지를 다시 읽는 간격
  note: 0.3, // 3D 게시판 위 쪽지 한 변 (m)
  gap: 0.06, // 쪽지 사이
}

export const BOARD_COLORS = ['yellow', 'pink', 'blue', 'green'] as const
export type BoardColor = (typeof BOARD_COLORS)[number]
export type BoardNote = { id: number; userId: string; nickname: string; body: string; color: BoardColor; createdAt: string }

// 붙이기 전 글 다듬기: 앞뒤 빈칸 없애고, 빈 줄 여러 개는 하나로. 붙일 수 없으면 이유를 돌려줌
export function cleanBody(raw: string): { body: string; error: string | null } {
  const body = raw.trim().replace(/\n{3,}/g, '\n\n')
  if (!body) return { body, error: '쪽지에 쓸 말을 적어 주세요.' }
  if ([...body].length > BOARD.maxChars) return { body, error: `${BOARD.maxChars}자까지 쓸 수 있어요.` }
  return { body, error: null }
}

// "방금", "5분 전", "3시간 전", "2일 전"
export function agoLabel(createdAt: string, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - Date.parse(createdAt)) / 60000))
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

// 3D 게시판(폭 w, 높이 h, 가운데 0,0) 위 쪽지 자리. 최근 것부터 왼쪽 위 → 오른쪽 아래로 채우고,
// 쪽지마다 번호로 정해지는 만큼 살짝 비뚤고 어긋나게(매번 같은 모양). 판에 다 안 들어가는 오래된 쪽지는 빼고 돌려줌
export function pinLayout(ids: number[], w: number, h: number): { id: number; x: number; y: number; tilt: number }[] {
  const step = BOARD.note + BOARD.gap
  const cols = Math.max(1, Math.floor((w - BOARD.gap) / step))
  const rows = Math.max(1, Math.floor((h - BOARD.gap) / step))
  const x0 = -((cols - 1) * step) / 2
  const y0 = ((rows - 1) * step) / 2
  return ids.slice(0, cols * rows).map((id, i) => {
    const wobble = (k: number) => (((id * k) % 97) / 97 - 0.5) // -0.5~0.5, 번호로 정해짐
    return {
      id,
      x: x0 + (i % cols) * step + wobble(31) * BOARD.gap,
      y: y0 - Math.floor(i / cols) * step + wobble(57) * BOARD.gap,
      tilt: wobble(13) * 0.18,
    }
  })
}
