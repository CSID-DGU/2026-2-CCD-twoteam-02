// 내 기록 화면 (/records): 과목별 공부 시간을 일·월·년 단위로 봅니다.
// 저장된 기록은 초록불(집중)일 때 쌓인 시간만 담고 있습니다. (src/study/StudyRunner)
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BackLink } from '../menu/BackLink'
import { useSession } from '../auth/useSession'
import { useSubjects } from './useSubjects'
import { useStudyLogs } from './useStudyLogs'
import {
  byDayOfMonth, byMonthOfYear, bySubject, filterSubject, formatHM,
  periodLabel, periodRange, shiftAnchor, totalSeconds,
} from './recordsLogic'
import type { Period } from './recordsLogic'
import { ColumnChart, SubjectBars } from './RecordCharts'

const TABS: { key: Period; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
]

// 기록 본문. 페이지(/records)와 로비·지점 위 창이 같이 씁니다.
export function RecordsView() {
  const { session } = useSession()
  const { subjects } = useSubjects(session?.user.id)
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(() => new Date()) // 보고 있는 날짜
  const [subjectId, setSubjectId] = useState<number | null>(null) // null 이면 전체
  const [showTable, setShowTable] = useState(false)

  const { start, end } = periodRange(period, anchor)
  const { rows, error } = useStudyLogs(start, end)
  const isFuture = shiftAnchor(period, anchor, 1) > new Date() // 다음 구간이 미래면 ▶ 를 막습니다.

  const nameOf = (id: number) => subjects.find((s) => s.id === id)?.name ?? '(알 수 없는 과목)'
  const filtered = rows ? filterSubject(rows, period === 'day' ? null : subjectId) : []
  const total = totalSeconds(filtered)
  const month = anchor.getMonth() + 1

  // 표로 보기·그래프에 같이 쓰는 값
  const table: { label: string; seconds: number }[] =
    period === 'day'
      ? bySubject(filtered).map((s) => ({ label: nameOf(s.subjectId), seconds: s.seconds }))
      : period === 'month'
        ? byDayOfMonth(filtered, anchor).map((s, i) => ({ label: `${month}월 ${i + 1}일`, seconds: s }))
        : byMonthOfYear(filtered).map((s, i) => ({ label: `${i + 1}월`, seconds: s }))

  return (
    <div style={styles.body}>
      <div style={styles.row}>
        <div style={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={period === t.key}
              style={{ ...styles.tab, ...(period === t.key ? styles.tabOn : null) }}
              onClick={() => setPeriod(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={styles.nav}>
          <button type="button" style={styles.navButton} onClick={() => setAnchor(shiftAnchor(period, anchor, -1))} aria-label="이전">◀</button>
          <span style={{ minWidth: 140, textAlign: 'center' }}>{periodLabel(period, anchor)}</span>
          <button type="button" style={{ ...styles.navButton, opacity: isFuture ? 0.3 : 1 }} disabled={isFuture} onClick={() => setAnchor(shiftAnchor(period, anchor, 1))} aria-label="다음">▶</button>
        </div>
      </div>

      {/* 과목별로 나눠 보기: 일 단위는 이미 과목별로 보여 주므로 월·년에서만 씁니다. */}
      {period !== 'day' && subjects.length > 0 && (
        <div style={styles.chips}>
          {[{ id: null, name: '전체' }, ...subjects].map((s) => (
            <button
              key={s.id ?? 'all'}
              type="button"
              style={{ ...styles.chip, ...(subjectId === s.id ? styles.chipOn : null) }}
              onClick={() => setSubjectId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <section style={styles.card}>
        <div style={styles.totalLabel}>
          {period === 'day' ? '이날' : period === 'month' ? '이번 달' : '올해'} 공부 시간
          {period !== 'day' && subjectId !== null && ` · ${nameOf(subjectId)}`}
        </div>
        <div style={styles.total}>{rows ? formatHM(total) : '…'}</div>

        {error ? (
          <p style={styles.error}>{error}</p>
        ) : rows === null ? (
          <p style={styles.muted}>기록을 불러오는 중…</p>
        ) : total === 0 ? (
          <p style={styles.muted}>이 기간에는 공부 기록이 없어요.</p>
        ) : period === 'day' ? (
          <SubjectBars items={table.map((t) => ({ name: t.label, seconds: t.seconds }))} />
        ) : (
          <ColumnChart
            values={table.map((t) => t.seconds)}
            // 월: 1·5·10·15·20·25·30일만 글자를 달아 겹치지 않게 합니다.
            tickLabel={(i) => (period === 'year' ? `${i + 1}월` : [0, 4, 9, 14, 19, 24, 29].includes(i) ? String(i + 1) : '')}
            tooltipLabel={(i) => table[i].label}
          />
        )}

        {rows && total > 0 && (
          <label style={styles.tableToggle}>
            <input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} /> 표로 보기
          </label>
        )}
        {rows && total > 0 && showTable && (
          <table style={styles.table}>
            <tbody>
              {table.filter((t) => t.seconds > 0).map((t) => (
                <tr key={t.label}>
                  <td style={styles.td}>{t.label}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{formatHM(t.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

// 주소로 직접 들어왔을 때의 페이지. 로비·지점에서는 창(src/menu/InfoPanel)으로 엽니다.
export default function RecordsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>내 기록</h1>
          <BackLink style={styles.link} />
        </header>
        <RecordsView />
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  body: { display: 'flex', flexDirection: 'column', gap: 12 },
  page: { minHeight: '100vh', background: '#16181d', color: '#fff', font: '14px/1.6 system-ui, sans-serif' },
  container: { maxWidth: 720, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 22 },
  link: { color: '#fff', padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', cursor: 'pointer', font: 'inherit' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  tabs: { display: 'flex', gap: 4, padding: 3, borderRadius: 8, background: '#20232a' },
  tab: { padding: '4px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  tabOn: { background: '#3a3f4b', color: '#fff' },
  nav: { display: 'flex', alignItems: 'center', gap: 8 },
  navButton: { padding: '2px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { padding: '3px 10px', borderRadius: 999, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
  chipOn: { background: '#3a3f4b', borderColor: '#aab0bb' },
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 12 },
  totalLabel: { color: '#aab0bb' },
  total: { fontSize: 32, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  muted: { color: '#aab0bb', margin: 0 },
  error: { color: '#f87171', margin: 0 },
  tableToggle: { color: '#aab0bb', cursor: 'pointer', fontSize: 13 },
  table: { borderCollapse: 'collapse', width: '100%' },
  td: { padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.08)' },
}
