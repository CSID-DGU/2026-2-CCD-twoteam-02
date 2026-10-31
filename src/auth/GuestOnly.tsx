// 게스트에게 막힌 기능 자리에 띄우는 안내 (#375). 친구 창·회의실·프로필 친구 버튼이 씁니다.
import type { CSSProperties } from 'react'

export function GuestOnly({ what, compact = false }: { what: string; compact?: boolean }) {
  return (
    <p style={compact ? styles.compact : styles.box}>
      {what} 가입하면 쓸 수 있어요.
      {!compact && ' 메뉴 → 설정 → 내 정보에서 가입하면 지금까지의 공부 기록·캐릭터가 그대로 이어져요.'}
    </p>
  )
}

const styles: Record<string, CSSProperties> = {
  box: { margin: 0, padding: 12, borderRadius: 10, background: '#16181d', color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 },
  compact: { margin: 0, color: '#aab0bb', fontSize: 13 },
}
