// 참여자 상태와 표시등 색. 화면과 무관한 순수 로직이라 다른 파일에서 그대로 가져다 씁니다.
import type { FocusStatus } from '../focus/focusLogic'

// 집중 판정 상태(focus·away·drowsy·offscreen·outframe·phone)에 세 가지를 더한 것
//   hold: 의심 중(보류). 얼굴 안 보임·눈 감음·휴대폰이 기준 시간 전이라 시간은 아직 올라감. 노란불
//   idle: 접속했지만 공부하지 않음 (돌아다니는 중, 앉았지만 공부 시작 전). 표시 없음
//   offline: 미접속. 표시 없음 (5분 뒤 자리가 자동 반납되므로 따로 색을 두지 않음)
export type PresenceStatus = FocusStatus | 'hold' | 'idle' | 'offline'

// 표시등 색 (2026-10-21 재정의)
//   초록 = 공부 중, 시간이 올라감
//   노랑 = 의심 중. 기준 시간 전이라 시간은 아직 올라감 (보류, 가이드라인 이탈)
//   빨강 = 기준을 넘겨 시간이 안 올라감 (자리 이탈·졸음·다른 화면·휴대폰)
export type Light = 'green' | 'yellow' | 'red'

export const LIGHT_COLOR: Record<Light, string> = {
  green: '#22c55e',
  yellow: '#facc15',
  red: '#ef4444',
}

// 빨간불 중에서도 따로 알려 줄 상태만 아이콘을 붙입니다.
export const STATUS_ICON: Partial<Record<PresenceStatus, string>> = {
  away: '🚶', // 자리 이탈
  drowsy: '💤', // 졸음
}

// 표시등 색. null 이면 표시등을 그리지 않습니다.
export function lightOf(status: PresenceStatus): Light | null {
  if (status === 'focus') return 'green'
  if (status === 'hold' || status === 'outframe') return 'yellow' // 아직 공부 시간이 올라가는 중
  if (status === 'idle' || status === 'offline') return null
  return 'red' // away·drowsy·offscreen·phone: 시간이 안 올라감
}
