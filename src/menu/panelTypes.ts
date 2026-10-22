// 로비·지점 위에 띄우는 창에 무엇을 보여 줄지
export type PanelView =
  | { kind: 'records' } // 내 기록
  | { kind: 'friends' } // 친구
  | { kind: 'profile'; userId: string } // 프로필 (내 것 또는 남의 것)
  | { kind: 'settings' } // 설정 (마우스 감도, #222)

// 창마다 다른 이름. 떠 있는 창을 다른 창으로 바꿀 때 새로 그리는 데 씁니다(React key).
export const panelKey = (v: PanelView) => (v.kind === 'profile' ? `profile:${v.userId}` : v.kind)
