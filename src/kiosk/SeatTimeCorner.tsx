// 지점 화면 왼쪽 위에 띄우는 "남은 시간 + 연장" 창. (#38)
// 보이는 모양은 이용권 영수증입니다(#39, PassReceipt.tsx). 이 파일은 자리 정보·접속 신호·연장을 맡습니다.
//
// 왜 자리에서 연장하나:
//   전에는 연장하려면 앉은 자리에서 일어나 키오스크까지 걸어가야 했습니다.
//   공부하다 시간이 지났을 때 그 과정이 번거로워 자리에서 바로 할 수 있게 했습니다.
//
// 시간이 지나도 자리는 유지됩니다(#38). 지나면 "시간 초과"로 바뀌고 연장을 권합니다.
//
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import DurationPicker from './DurationPicker'
import { formatMinutes } from './duration'
import { PassReceipt } from './PassReceipt'
import { modeOf } from './receiptLogic'
import { usePassDetail } from './usePassDetail'

type MyPlace = { kind: string; number: number; expires_at: string; expired: boolean }

// 공부 타이머처럼 초 단위로 셉니다. 시계만 다시 그리는 것이라 부담이 없습니다.
const TICK_MS = 1000
// 1분마다 heartbeat 로 "아직 접속해 있다"를 알리면서 자리 정보도 같이 받습니다. (#155)
// 신호를 따로 보내면 통신이 두 번이 되므로 한 번에 합쳤습니다.
// 이 신호가 5분 넘게 끊기면 DB 가 자리를 반납합니다.
const RELOAD_MS = 60 * 1000
// 막 발급된 영수증을 펼쳐 둔 뒤 접기까지의 시간 (#39)
const PRINT_SHOW_MS = 5000
const LOST_TEXT = '접속이 끊겨 자리가 반납되었습니다. 키오스크에서 다시 받아 주세요.'

// onLost: 접속이 끊겨 자리를 잃었을 때 부릅니다. 지점 화면이 들고 있던 내 자리도
// 같이 비워야 "화면에는 내 자리, DB 에는 없음"으로 어긋나지 않습니다. (#135 와 같은 문제)
// lostText: 자리를 잃었을 때 안내 문구 (광장 벤치는 키오스크가 없어 다르게, #341)
// placeKey: 지점 화면이 아는 내 자리 번호. 키오스크 배정·반납, 카페 앉기·일어나기로 바뀌면
// 1분을 기다리지 않고 바로 다시 읽습니다. 새로 받은 자리면 영수증이 출력되듯 펼쳐집니다. (#39)
export default function SeatTimeCorner({ onLost, placeKey = null, lostText = LOST_TEXT }: { onLost?: () => void; placeKey?: number | null; lostText?: string }) {
  // 쓰는 쪽에서 onLost={() => ...} 로 넘기면 매 렌더마다 다른 함수가 됩니다.
  // 그대로 의존성에 넣으면 아래 타이머가 계속 지워졌다 다시 걸립니다. ref 에 담아 둡니다.
  const lostRef = useRef(onLost)
  const [mine, setMine] = useState<MyPlace | null>(null)
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  // 접속이 끊겨 자리를 잃었을 때 한 번 알립니다. (#155)
  const [lost, setLost] = useState(false)
  const [expanded, setExpanded] = useState(false) // 영수증을 펼쳤는지 (#39)
  const [printKey, setPrintKey] = useState(0) // 올라가면 영수증이 출력되듯 나타납니다.
  const mineRef = useRef<MyPlace | null>(null) // 직전 자리 (사라졌는지·새로 생겼는지 비교)
  const loaded = useRef(false) // 처음 읽은 자리는 "새로 받은 자리"가 아닙니다. (새로고침해서 들어온 경우)
  const released = useRef(false) // 직접 반납·일어나기로 비운 것이면 "접속이 끊겨" 안내를 띄우지 않습니다.

  const load = useCallback(() => {
    supabase.rpc('heartbeat').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      const next = (row as MyPlace) ?? null
      const before = mineRef.current
      mineRef.current = next
      // 자리가 있었는데 사라졌다면 접속이 끊겨 반납된 것입니다. 이유를 알려 줍니다. (#155)
      if (before && !next && !released.current) {
        setLost(true)
        lostRef.current?.()
      }
      // 새로 받은 자리면 영수증을 펼쳐 출력합니다. (#39)
      if (!before && next && loaded.current) {
        setLost(false)
        setExpanded(true)
        setPrintKey((k) => k + 1)
      }
      if (next) released.current = false
      loaded.current = true
      setMine(next)
    })
  }, [])

  // 지점 화면에서 자리가 바뀌면 바로 다시 읽습니다. 비워졌으면 직접 비운 것입니다.
  const lastKey = useRef(placeKey)
  useEffect(() => {
    if (placeKey === lastKey.current) return
    lastKey.current = placeKey
    if (placeKey === null) released.current = true
    load()
  }, [placeKey, load])

  // 출력된 영수증은 잠시 보여 준 뒤 접습니다.
  useEffect(() => {
    if (printKey === 0) return
    const id = setTimeout(() => setExpanded(false), PRINT_SHOW_MS)
    return () => clearTimeout(id)
  }, [printKey])

  const placeKind = mine?.kind === 'room' ? 'room' : mine ? 'seat' : null
  const detail = usePassDetail(placeKind, mine ? `${mine.kind}-${mine.number}-${mine.expires_at}` : '')

  useEffect(() => {
    lostRef.current = onLost
  }, [onLost])

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

  if (!mine) {
    if (!lost) return null
    return (
      <div style={styles.corner}>
        <div style={styles.panel}>
          <p style={styles.line}>{lostText}</p>
          <div style={styles.row}>
            <button type="button" style={styles.primary} onClick={() => setLost(false)}>
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 이용 정보를 읽기 전에는 띄우지 않습니다. (솔카페가 잠깐 이용권처럼 보이지 않게)
  if (!detail) return null
  const mode = modeOf(detail.branchKind)
  const where = mine.kind === 'room' ? `회의실 ${mine.number}번` : `${mine.number}번 자리`

  return (
    <div style={styles.corner}>
      <PassReceipt
        mode={mode}
        branchName={detail.branchName}
        where={where}
        sessionId={detail.sessionId}
        startedAt={new Date(detail.startedAt)}
        expiresAt={new Date(mine.expires_at)}
        durationMinutes={detail.durationMinutes}
        now={now}
        expanded={expanded}
        printKey={printKey}
        onToggle={() => {
          setExpanded((v) => !v)
          setOpen(false)
        }}
        footer={
          mode === 'pass' && (
            <button type="button" style={styles.extendButton} onClick={() => setOpen((v) => !v)}>
              {open ? '연장 닫기' : '시간 연장'}
            </button>
          )
        }
      />

      {expanded && open && mode === 'pass' && (
        <div style={styles.panel}>
          <DurationPicker minutes={minutes} onChange={setMinutes} />
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.row}>
            <button type="button" style={styles.ghost} onClick={() => setOpen(false)}>
              닫기
            </button>
            <button type="button" style={styles.primary} disabled={busy} onClick={() => void extend()}>
              {busy ? '연장 중…' : `${formatMinutes(minutes)} 연장하기`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  // 왼쪽 위 자리. 위에는 FPS(16)와 숨김 모드 인원 수(76)가 있습니다.
  corner: {
    position: 'fixed', top: 136, left: 16, zIndex: 11,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
    maxWidth: 'calc(100vw - 32px)',
  },
  extendButton: {
    padding: '5px 10px', borderRadius: 6, border: 'none', background: '#26241f', color: '#fbfaf5',
    font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  panel: {
    width: 'min(300px, calc(100vw - 32px))',
    boxSizing: 'border-box',
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
