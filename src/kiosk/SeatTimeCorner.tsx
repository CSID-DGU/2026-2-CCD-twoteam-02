// 지점 화면 왼쪽 위에 띄우는 "남은 시간 + 연장" 창. (#38)
//
// 왜 자리에서 연장하나:
//   전에는 연장하려면 앉은 자리에서 일어나 키오스크까지 걸어가야 했습니다.
//   공부하다 시간이 지났을 때 그 과정이 번거로워 자리에서 바로 할 수 있게 했습니다.
//
// 시간이 지나도 자리는 유지됩니다(#38). 지나면 "시간 초과"로 바뀌고 연장을 권합니다.
//
// 참고: 남은 시간을 영수증 모양으로 보여 주는 작업(#39)이 따로 있습니다.
//       그 화면이 들어오면 이 창은 거기에 합치거나 지워도 됩니다.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import DurationPicker from './DurationPicker'
import { formatMinutes } from './duration'
// 공부 타이머와 같은 "01:02:03" 형식을 씁니다. 화면에 두 시간이 같이 보이므로
// 형식이 다르면 눈에 걸립니다. (#38)
import { formatDuration } from '../study/studyLogic'

type MyPlace = { kind: string; number: number; expires_at: string; expired: boolean }

// 공부 타이머처럼 초 단위로 셉니다. 시계만 다시 그리는 것이라 부담이 없습니다.
const TICK_MS = 1000
// 자리 정보는 자주 바뀌지 않으므로 1분에 한 번만 다시 읽습니다.
// (다른 창에서 연장·반납했을 수 있어 아예 안 읽을 수는 없습니다)
const RELOAD_MS = 60 * 1000

export default function SeatTimeCorner() {
  const [mine, setMine] = useState<MyPlace | null>(null)
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    supabase.rpc('my_current_place').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      setMine((row as MyPlace) ?? null)
    })
  }, [])

  useEffect(() => {
    load()
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)
    const reload = setInterval(load, RELOAD_MS)
    return () => {
      clearInterval(tick)
      clearInterval(reload)
    }
  }, [load])

  async function extend() {
    if (busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('extend_my_place', { p_minutes: minutes })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    load()
  }

  if (!mine) return null

  const leftMs = new Date(mine.expires_at).getTime() - now
  const over = leftMs <= 0
  const where = mine.kind === 'room' ? `회의실 ${mine.number}번` : `${mine.number}번 자리`
  // 남았으면 줄어드는 시간을, 지났으면 얼마나 지났는지를 보여 줍니다.
  const clock = formatDuration(Math.abs(leftMs))
  // 10분 이하로 남으면 미리 눈에 띄게 합니다.
  const soon = !over && leftMs <= 10 * 60 * 1000

  return (
    <>
      <button
        type="button"
        style={{ ...styles.badge, ...(over ? styles.badgeOver : soon ? styles.badgeSoon : null) }}
        onClick={() => setOpen((v) => !v)}
        title={over ? '이용 시간이 지났습니다. 눌러서 연장하세요.' : '눌러서 시간을 연장할 수 있습니다.'}
      >
        <span>{where}</span>
        <span style={styles.clock}>{over ? `+${clock}` : clock}</span>
        <span style={styles.tag}>{over ? '초과' : '남음'}</span>
      </button>

      {open && (
        <div style={styles.panel}>
          <p style={styles.line}>
            {over
              ? `이용 시간이 ${formatMinutes(Math.ceil(-leftMs / 60000))} 지났습니다. 자리는 그대로 두었으니 연장해 주세요.`
              : `${formatMinutes(Math.ceil(leftMs / 60000))} 남았습니다.`}
          </p>
          <DurationPicker minutes={minutes} onChange={setMinutes} />
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.row}>
            <button type="button" style={styles.ghost} onClick={() => setOpen(false)}>
              닫기
            </button>
            <button type="button" style={styles.primary} disabled={busy} onClick={() => void extend()}>
              {busy ? '연장 중…' : '연장하기'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  badge: {
    position: 'fixed',
    top: 136,
    left: 16,
    zIndex: 10,
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'rgba(32,35,42,.85)',
    color: '#fff',
    font: '13px system-ui, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badgeOver: { background: 'rgba(146,64,14,.9)', color: '#fde68a' },
  badgeSoon: { background: 'rgba(120,53,15,.8)' },
  // 공부 타이머와 같은 설정. 숫자 폭을 같게 해서 시간이 흔들리지 않게 합니다.
  clock: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 14 },
  tag: { fontSize: 11, color: '#9aa1ab' },
  panel: {
    position: 'fixed',
    top: 172,
    left: 16,
    zIndex: 11,
    width: 'min(300px, calc(100vw - 32px))',
    padding: 16,
    borderRadius: 12,
    background: '#20232a',
    color: '#fff',
    font: '13px/1.6 system-ui, sans-serif',
    display: 'grid',
    gap: 12,
  },
  line: { margin: 0, color: '#d6dae1' },
  row: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  primary: {
    padding: '6px 14px', borderRadius: 8, border: 'none',
    background: '#4ade80', color: '#0b0d10', fontWeight: 700, cursor: 'pointer', font: 'inherit',
  },
  ghost: {
    padding: '6px 14px', borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,.08)', color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  error: { margin: 0, color: '#f87171' },
}
