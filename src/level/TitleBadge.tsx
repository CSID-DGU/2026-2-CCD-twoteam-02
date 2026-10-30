// 화면(DOM)에 그리는 칭호 리본과 진행 막대 (꽃 피는 칭호). 머리 위 3D 리본(ribbonTexture)과 같은 모양·색입니다.
// 프로필 창(내 것·남의 것)과 내 기록 창이 씁니다.
import type { CSSProperties } from 'react'
import { MAX_LEVEL, progressOf, titleOf } from './levelLogic'
import { formatHM } from '../study/recordsLogic'

const GOLD = 'linear-gradient(90deg, #c8902c, #f3d27a, #c8902c)' // 꽃밭(마지막 단계)

// 칭호 리본. 0단계(칭호 없음)면 아무것도 그리지 않습니다.
export function TitleBadge({ level }: { level: number }) {
  const title = titleOf(level)
  if (!title) return null
  return (
    <span style={{ ...styles.ribbon, background: level === MAX_LEVEL ? GOLD : title.color }}>
      {title.emoji} {title.name}
    </span>
  )
}

// 진행 막대 + "누적 62시간 · 다음 🌸 첫 꽃까지 38시간". 내 프로필에서만 씁니다.
export function TitleProgress({ seconds }: { seconds: number }) {
  const p = progressOf(seconds)
  const color = p.next?.color ?? titleOf(p.level)?.color ?? '#aab0bb'
  return (
    <div>
      <div style={styles.bar}>
        <div style={{ ...styles.fill, width: `${Math.round(p.ratio * 100)}%`, background: color }} />
      </div>
      <p style={styles.muted}>
        누적 {formatHM(seconds)} · {p.next ? `다음 ${p.next.emoji} ${p.next.name}까지 ${formatHM(p.leftSeconds)}` : '가장 높은 단계예요'}
      </p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  ribbon: {
    display: 'inline-block', padding: '3px 12px', borderRadius: 4, color: '#fff', fontWeight: 700, fontSize: 12,
    textShadow: '0 1px 2px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
  },
  bar: { height: 10, background: 'rgba(255,255,255,.12)', borderRadius: 999, overflow: 'hidden', margin: '6px 0 4px' },
  fill: { height: '100%', borderRadius: 999, transition: 'width .4s' },
  muted: { color: '#aab0bb', margin: 0, fontSize: 12 },
}
