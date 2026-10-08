// 임시 참여자: 실시간 동기화가 붙기 전까지, 앉았을 때 다른 사람이 마주 보이는지 확인하려고 둡니다.
// 실제 참여자 정보가 들어오면 이 파일은 지웁니다.
import type { PresenceStatus } from './status'

// 표시등을 확인할 수 있도록 상태를 하나씩 다르게 정해 둡니다.
export type Dummy = { seat: number; model: string; status: PresenceStatus }

export const DUMMIES: Dummy[] = [
  { seat: 3, model: 'b', status: 'focus' },
  { seat: 7, model: 'c', status: 'away' },
  { seat: 14, model: 'd', status: 'drowsy' },
  { seat: 20, model: 'e', status: 'offline' },
]
