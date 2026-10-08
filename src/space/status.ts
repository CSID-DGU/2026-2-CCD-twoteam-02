// 참여자 상태와 표시등 색. 화면과 무관한 순수 로직이라 다른 파일에서 그대로 가져다 씁니다.
import type { FocusStatus } from '../focus/focusLogic'

// 집중 판정 상태(focus·away·drowsy·offscreen)에 미접속(offline)을 더한 것
export type PresenceStatus = FocusStatus | 'offline'

export type Light = 'green' | 'yellow' | 'red'

export const LIGHT_COLOR: Record<Light, string> = {
  green: '#22c55e', // 공부 중
  yellow: '#facc15', // 접속했지만 공부하지 않음
  red: '#ef4444', // 미접속 (좌석 반납 전까지)
}

// 노란불 중에서도 따로 알려 줄 상태만 아이콘을 붙입니다.
export const STATUS_ICON: Partial<Record<PresenceStatus, string>> = {
  away: '🚶', // 자리 이탈
  drowsy: '💤', // 졸음
}

export function lightOf(status: PresenceStatus): Light {
  if (status === 'focus') return 'green'
  if (status === 'offline') return 'red'
  return 'yellow'
}
