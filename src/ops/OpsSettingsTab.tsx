// 설정 창의 "관리자" 탭 (#590). 팀원에게만 보입니다(SettingsView 가 useIsTeam 으로 정함).
// 최근 24시간 요약 3개를 보여 주고, "관리자 대시보드 열기"로 같은 창을 넓은 대시보드로 바꿉니다("← 뒤로"로 돌아옴).
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { envLabel, fetchDashboard } from './opsApi'
import type { Dashboard } from './opsApi'

export function OpsSettingsTab({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchDashboard('24h').then(
      (res) => alive && setData(res.data),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [])

  const s = data?.summary
  const low = s && s.fps_minutes > 0 ? `${((s.low_minutes / s.fps_minutes) * 100).toFixed(1)}%` : '–'
  return (
    <div style={styles.stack}>
      <div style={styles.row}>
        <span style={styles.badge}>{envLabel()} DB</span>
        <span style={styles.help}>최근 24시간</span>
      </div>
      {error ? (
        <span style={styles.help}>요약을 불러오지 못했어요: {error}</span>
      ) : (
        <div style={styles.tiles}>
          <Tile label="기록을 보낸 사람" value={s ? String(s.users) : '…'} />
          <Tile label="에러" value={s ? String(s.errors) : '…'} />
          <Tile label="FPS 30 미만인 분" value={s ? low : '…'} />
        </div>
      )}
      <button type="button" style={styles.open} onClick={onOpen}>
        관리자 대시보드 열기
      </button>
      <span style={styles.help}>팀원에게만 보이는 탭이에요. 화면 에러·FPS 기록은 90일 보관해요.</span>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.tile}>
      <span style={styles.help}>{label}</span>
      <span style={styles.value}>{value}</span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: { padding: '2px 10px', borderRadius: 999, background: '#2e323b', color: '#d1d5db', fontWeight: 700, fontSize: 13 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  tile: { padding: 12, borderRadius: 10, background: '#16181d', display: 'flex', flexDirection: 'column', gap: 2 },
  value: { color: '#fff', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  help: { color: '#8b93a1', fontSize: 12 },
  open: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#3987e5', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
}
