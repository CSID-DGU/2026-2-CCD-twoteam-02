// 과목별 비율 도넛 (내 기록 월·년). 라이브러리 없이 SVG 원호로 그립니다. 조각 계산은 calendarLogic.donutSlices.
// 과목 색은 subjectLogic.subjectColorOf (플래너 시간표와 같은 색). 가운데는 기간 합계.
import type { CSSProperties } from 'react'
import { SMALL_SLICE_PERCENT, donutSlices, formatClock } from './calendarLogic'

const R = 15.9155 // 둘레가 100 이 되는 반지름 → stroke-dasharray 를 % 로 씀
const STROKE = 6

type Item = { subjectId: number | null; name: string; seconds: number }

export function SubjectDonut({ items, colorOf }: { items: Item[]; colorOf: (id: number | null) => string }) {
  const slices = donutSlices(items)
  if (slices.length === 0) return null
  const nameOf = (id: number | null) => items.find((x) => x.subjectId === id)?.name ?? ''
  const total = slices.reduce((a, s) => a + s.seconds, 0)
  const summary = slices.map((s) => `${nameOf(s.subjectId)} ${s.percent}%`).join(', ')
  return (
    <div style={styles.wrap}>
      <svg viewBox="0 0 42 42" style={styles.svg} role="img" aria-label={`과목별 비율: ${summary}`}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="#2a2e36" strokeWidth={STROKE} />
        {slices.map((s) => (
          // 12시 방향에서 시계 방향으로 (dashoffset 25 = 12시 시작)
          <circle
            key={String(s.subjectId)}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke={colorOf(s.subjectId)}
            strokeWidth={STROKE}
            strokeDasharray={`${(s.to - s.from) * 100} ${100 - (s.to - s.from) * 100}`}
            strokeDashoffset={25 - s.from * 100}
          />
        ))}
        {slices.map((s) => {
          if (s.percent < SMALL_SLICE_PERCENT) return null
          const a = ((s.from + s.to) / 2) * Math.PI * 2 - Math.PI / 2
          return (
            <text key={`t${s.subjectId}`} x={21 + Math.cos(a) * R} y={21 + Math.sin(a) * R + 1} textAnchor="middle" fontSize="2.6" fill="#16181d" fontWeight="700">
              {s.percent}%
            </text>
          )
        })}
        <text x="21" y="22.6" textAnchor="middle" fontSize="4.6" fill="#fff" fontWeight="700">{formatClock(total)}</text>
      </svg>
      <ul style={styles.list}>
        {slices.map((s) => (
          <li key={String(s.subjectId)} style={styles.item}>
            <i style={{ ...styles.dot, background: colorOf(s.subjectId) }} />
            <span style={styles.name}>{nameOf(s.subjectId)}</span>
            <span style={styles.num}>{s.percent}% · {formatClock(s.seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  svg: { width: 'min(160px, 40vw)', height: 'auto', flex: 'none' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
  item: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5, flex: 'none', display: 'inline-block' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  num: { color: '#aab0bb', marginLeft: 'auto', whiteSpace: 'nowrap' },
}
