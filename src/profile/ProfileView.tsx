// 프로필 본문: 이름, 공부 기록 요약(누적·이번 주·최근 7일·이번 주 과목별).
// 프로필 페이지(/profile/:id)와 지점 안 프로필 창이 같이 씁니다.
// 내 프로필이면 공개 범위를 바꾸는 칸이 위에 붙습니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { displayName } from '../friends/friendsLogic'
import { formatHM } from '../study/recordsLogic'
import { ColumnChart, SubjectBars } from '../study/RecordCharts'
import { useProfile, VISIBILITY_LABEL } from './useProfile'
import type { Visibility } from './useProfile'
import { dayLabel } from './profileLogic'

export function ProfileView({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { summary, loading, error, setVisibility } = useProfile(userId)
  const [message, setMessage] = useState('')

  if (loading) return <p style={styles.muted}>프로필을 불러오는 중…</p>
  if (error || !summary) return <p style={styles.error}>{error || '프로필을 찾지 못했어요.'}</p>

  const daily = summary.daily ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={styles.name}>{displayName(summary.nickname, summary.id)}</div>

      {isMe && (
        <div style={styles.row}>
          <span style={styles.muted}>공부 기록 공개</span>
          <div style={styles.segment} role="radiogroup" aria-label="공부 기록 공개 범위">
            {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={summary.visibility === v}
                style={{ ...styles.segButton, ...(summary.visibility === v ? styles.segOn : null) }}
                onClick={async () => setMessage(await setVisibility(v))}
              >
                {VISIBILITY_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && <p style={styles.error}>{message}</p>}

      {!summary.allowed ? (
        <p style={styles.muted}>공부 기록을 공개하지 않은 사용자예요.</p>
      ) : (
        <>
          <div style={styles.stats}>
            <Stat label="누적 공부 시간" value={formatHM(summary.total_seconds ?? 0)} />
            <Stat label="이번 주" value={formatHM(summary.week_seconds ?? 0)} />
          </div>

          <div>
            <div style={styles.sectionTitle}>최근 7일</div>
            {daily.every((d) => d.seconds === 0) ? (
              <p style={styles.muted}>최근 7일 동안 공부 기록이 없어요.</p>
            ) : (
              <ColumnChart
                values={daily.map((d) => d.seconds)}
                tickLabel={(i) => dayLabel(daily[i].date).tick}
                tooltipLabel={(i) => dayLabel(daily[i].date).full}
              />
            )}
          </div>

          <div>
            <div style={styles.sectionTitle}>이번 주 과목</div>
            {(summary.week_subjects ?? []).length === 0 ? (
              <p style={styles.muted}>이번 주에 공부한 과목이 없어요.</p>
            ) : (
              <SubjectBars items={summary.week_subjects ?? []} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.muted}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  name: { fontSize: 20, fontWeight: 700 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segment: { display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: '#16181d' },
  segButton: { padding: '3px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  segOn: { background: '#3a3f4b', color: '#fff' },
  stats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  stat: { padding: 12, borderRadius: 10, background: '#16181d' },
  statValue: { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  sectionTitle: { fontWeight: 600, marginBottom: 6 },
  muted: { color: '#aab0bb', margin: 0, fontSize: 13 },
  error: { color: '#f87171', margin: 0 },
}
