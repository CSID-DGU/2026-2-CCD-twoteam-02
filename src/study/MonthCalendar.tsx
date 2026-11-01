// 내 기록 월 달력: 칸마다 날짜와 그날 집중 시간, 많이 한 날일수록 진한 초록. 칸을 누르면 쉬는 날(OFF) 켜기·끄기.
// 라이브러리 없이 HTML 격자로 그립니다. 계산은 calendarLogic (Node 로 검사).
import type { CSSProperties } from 'react'
import { dayKey, formatClock, heatLevel, monthCells } from './calendarLogic'

const WEEK = ['월', '화', '수', '목', '금', '토', '일']
// 칸 색 5단계 (0: 안 함 … 4: 6시간 이상). 어두운 카드(#20232a) 위에서 흰 글자가 읽히는 초록
const HEAT_COLORS = ['#2a2e36', '#1f4d34', '#2f7a4e', '#3fa566', '#5fd38a']
const HEAT_LABELS = ['0', '2시간 미만', '4시간 미만', '6시간 미만', '6시간 이상']

type Props = {
  anchor: Date
  seconds: number[] // byDayOfMonth: 1일 ~ 말일
  rest: Set<string> // 쉬는 날 (dayKey)
  today: Date
  onToggleRest: (key: string) => void
}

export function MonthCalendar({ anchor, seconds, rest, today, onToggleRest }: Props) {
  const todayKey = dayKey(today)
  const month = anchor.getMonth() + 1
  return (
    <div>
      <div style={styles.grid}>
        {WEEK.map((w) => (
          <div key={w} style={styles.head}>{w}</div>
        ))}
        {monthCells(anchor).map((c) => {
          if (!c.inMonth) return <div key={c.key} style={{ ...styles.cell, ...styles.out }}>{c.day}</div>
          const s = seconds[c.day - 1] ?? 0
          const off = rest.has(c.key)
          const level = heatLevel(s)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onToggleRest(c.key)}
              aria-pressed={off}
              aria-label={`${month}월 ${c.day}일${s > 0 ? ` · ${formatClock(s)}` : ''}${off ? ' · 쉬는 날' : ''} (누르면 쉬는 날 ${off ? '끄기' : '켜기'})`}
              title={off ? '쉬는 날 끄기' : '쉬는 날로 표시'}
              style={{ ...styles.cell, ...styles.day, background: HEAT_COLORS[level], ...(c.key === todayKey ? styles.today : null) }}
            >
              <span style={styles.date}>{c.day}</span>
              {s > 0 && <b style={styles.time}>{formatClock(s)}</b>}
              {off && <span style={styles.off}>OFF</span>}
            </button>
          )
        })}
      </div>
      <div style={styles.legend} aria-hidden>
        {HEAT_COLORS.map((col, i) => (
          <i key={col} title={HEAT_LABELS[i]} style={{ ...styles.swatch, background: col }} />
        ))}
        <span style={{ marginLeft: 4 }}>0 → 6시간+ · 칸을 누르면 쉬는 날(OFF)</span>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 },
  head: { textAlign: 'center', color: '#aab0bb', fontSize: 12, padding: '2px 0' },
  cell: { height: 'clamp(40px, 9vw, 56px)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', fontSize: 11, color: '#d7dbe2', minWidth: 0, overflow: 'hidden' },
  out: { opacity: 0.25, background: 'transparent' },
  day: { border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: '#d7dbe2' },
  today: { boxShadow: 'inset 0 0 0 2px #fff' }, // outline 은 키보드 초점 표시에 남겨 둠
  date: { position: 'absolute', top: 2, left: 4, fontSize: 'clamp(9px, 2.4vw, 12px)', lineHeight: 1.1 }, // 왼쪽 위 (오른쪽 위 OFF 딱지와 안 겹치게)
  time: { marginTop: 8, fontSize: 'clamp(11px, 2.8vw, 14px)', color: '#fff', fontWeight: 700, lineHeight: 1.2 },
  off: { position: 'absolute', top: 2, right: 2, fontSize: 7, fontWeight: 800, letterSpacing: 0.5, padding: '0 3px', borderRadius: 3, background: '#fff', color: '#16181d' },
  legend: { display: 'flex', alignItems: 'center', gap: 3, marginTop: 8, fontSize: 11, color: '#aab0bb', flexWrap: 'wrap' },
  swatch: { width: 18, height: 10, borderRadius: 3, display: 'inline-block' },
}
