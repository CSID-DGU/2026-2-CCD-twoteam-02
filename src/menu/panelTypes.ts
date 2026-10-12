// 로비·지점 위에 띄우는 창에 무엇을 보여 줄지
export type PanelView =
  | { kind: 'records' } // 내 기록
  | { kind: 'friends' } // 친구
  | { kind: 'profile'; userId: string } // 프로필 (내 것 또는 남의 것)
