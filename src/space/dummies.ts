// 임시 참여자: 실시간 동기화가 붙기 전까지, 앉았을 때 다른 사람이 마주 보이는지 확인하려고 둡니다.
// 실제 참여자 정보가 들어오면 이 파일은 지웁니다.
export type Dummy = { seat: number; model: string }

export const DUMMIES: Dummy[] = [
  { seat: 3, model: 'b' },
  { seat: 7, model: 'c' },
  { seat: 14, model: 'd' },
  { seat: 20, model: 'e' },
]
