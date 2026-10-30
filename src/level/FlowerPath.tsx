// 내 기록 창의 "꽃 피는 길" (꽃 피는 칭호): 8단계를 한 줄로 늘어놓고 지금 어디인지 보여 줍니다.
// 지난 단계는 색, 지금 단계는 크게, 남은 단계는 흐리게. 아래에 진행 막대와 다음 단계까지 남은 시간·어림 기간.
import type { CSSProperties } from 'react'
import { DAILY_HOURS_GUESS, TITLES, daysLeft, progressOf } from './levelLogic'
import { formatHM } from '../study/recordsLogic'

export function FlowerPath({ seconds }: { seconds: number }) {
  const p = progressOf(seconds)
  const color = p.next?.color ?? TITLES[TITLES.length - 1].color
  return (
    <section style={styles.box} aria-label="꽃 피는 길">
      <div style={styles.title}>꽃 피는 길 · 누적 {formatHM(seconds)}</div>
      <div style={styles.path}>
        {TITLES.map((t) => {
          const done = t.level < p.level
          const now = t.level === p.level
          return (
            <div key={t.level} style={{ ...styles.step, ...(now ? styles.stepNow : null) }}>
              <span style={{ ...styles.emoji, ...(done || now ? null : styles.emojiLater), ...(now ? styles.emojiNow : null) }}>{t.emoji}</span>
              <span>{t.name}</span>
              <span style={styles.hours}>{t.hours}h</span>
            </div>
          )
        })}
      </div>
      <div style={styles.bar}>
        <div style={{ ...styles.fill, width: `${Math.round(p.ratio * 100)}%`, background: color }} />
      </div>
      <p style={styles.muted}>
        {p.next
          ? `다음 ${p.next.emoji} ${p.next.name}까지 ${formatHM(p.leftSeconds)} (하루 ${DAILY_HOURS_GUESS}시간이면 약 ${daysLeft(p.leftSeconds)}일)`
          : '가장 높은 단계예요. 꽃밭을 가꿨어요!'}
      </p>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  box: { padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,.05)', display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontWeight: 700, fontSize: 14 },
  path: { display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 6 },
  step: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 11, color: '#aab0bb', minWidth: 0, flex: 1, textAlign: 'center' },
  stepNow: { color: '#fff', fontWeight: 700 },
  emoji: { fontSize: 22, lineHeight: 1.2 },
  emojiLater: { filter: 'grayscale(1)', opacity: 0.35 },
  emojiNow: { transform: 'scale(1.25)' },
  hours: { fontSize: 10, opacity: 0.8 },
  bar: { height: 10, background: 'rgba(255,255,255,.12)', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 999, transition: 'width .4s' },
  muted: { color: '#aab0bb', margin: 0, fontSize: 12 },
}
