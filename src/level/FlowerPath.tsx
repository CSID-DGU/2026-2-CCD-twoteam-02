// 내 기록 창의 "꽃 피는 길" (꽃 피는 칭호): 지금 단계 → 다음 단계 진행 막대와 남은 시간·어림 기간.
// 막대는 지금 단계에서 다음 단계까지를 전체 폭으로 그려, 조금만 공부해도 늘어나는 게 보이게 합니다(#439).
// 양 끝에 지금·다음 단계를 쓰고, 8단계 전체는 "전체 단계 보기"를 눌러야 펼칩니다(막대와 떨어뜨려 전체 진행으로 읽히지 않게).
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { DAILY_HOURS_GUESS, TITLES, daysLeft, progressOf, titleOf } from './levelLogic'
import { formatHM } from '../study/recordsLogic'

export function FlowerPath({ seconds }: { seconds: number }) {
  const [open, setOpen] = useState(false)
  const p = progressOf(seconds)
  const now = titleOf(p.level)
  const color = p.next?.color ?? TITLES[TITLES.length - 1].color
  const percent = p.next ? Math.floor(p.ratio * 100) : 100 // 다음 단계에 닿기 전에는 100%로 올려 보이지 않게 버림
  return (
    <section style={styles.box} aria-label="꽃 피는 길">
      <div style={styles.title}>꽃 피는 길 · 누적 {formatHM(seconds)}</div>
      <div style={styles.row}>
        <span style={styles.end}>{now ? `${now.emoji} ${now.name}` : '시작'}</span>
        <div style={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ ...styles.fill, width: `${percent}%`, background: color }} />
        </div>
        {p.next && <span style={{ ...styles.end, ...styles.endNext }}>{`${p.next.emoji} ${p.next.name}`}</span>}
      </div>
      <p style={styles.muted}>
        <b style={styles.percent}>{percent}%</b>
        {' · '}
        {p.next
          ? `다음 ${p.next.emoji} ${p.next.name}까지 ${formatHM(p.leftSeconds)} (하루 ${DAILY_HOURS_GUESS}시간이면 약 ${daysLeft(p.leftSeconds)}일)`
          : '가장 높은 단계예요. 꽃밭을 가꿨어요!'}
      </p>
      <button type="button" style={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        전체 단계 보기 {open ? '▴' : '▾'}
      </button>
      {open && (
        // 지난 단계는 색, 지금 단계는 크게, 남은 단계는 흐리게
        <div style={styles.path}>
          {TITLES.map((t) => {
            const done = t.level < p.level
            const here = t.level === p.level
            return (
              <div key={t.level} style={{ ...styles.step, ...(here ? styles.stepNow : null) }}>
                <span style={{ ...styles.emoji, ...(done || here ? null : styles.emojiLater), ...(here ? styles.emojiNow : null) }}>{t.emoji}</span>
                <span>{t.name}</span>
                <span style={styles.hours}>{t.hours}h</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  box: { padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,.05)', display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontWeight: 700, fontSize: 14 },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 },
  end: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  endNext: { color: '#aab0bb' },
  bar: { flex: 1, height: 12, background: 'rgba(255,255,255,.12)', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, transition: 'width .4s' },
  muted: { color: '#aab0bb', margin: 0, fontSize: 12 },
  percent: { color: '#fff' },
  toggle: { alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none', color: '#aab0bb', font: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
  path: { display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 2 },
  step: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 11, color: '#aab0bb', minWidth: 0, flex: 1, textAlign: 'center' },
  stepNow: { color: '#fff', fontWeight: 700 },
  emoji: { fontSize: 22, lineHeight: 1.2 },
  emojiLater: { filter: 'grayscale(1)', opacity: 0.35 },
  emojiNow: { transform: 'scale(1.25)' },
  hours: { fontSize: 10, opacity: 0.8 },
}
