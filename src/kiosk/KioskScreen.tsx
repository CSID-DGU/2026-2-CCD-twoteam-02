// 키오스크 화면. 지점 공간에서 키오스크 앞에 서면 열리는 덮개 화면이다.
//
// 흐름: 이용 시간 고르기 → 좌석 배치도에서 빈자리 고르기 → "N번 자리를 선택하시겠습니까?" → 예
//
// 배정은 assign_seat 함수 한 번으로 끝낸다. 이용권 발급과 좌석 배정이 한 덩어리로 묶여 있어
// 중간에 끊겨도 이용권만 남는 일이 없다. 실패 사유(자리 찼음, 이미 다른 자리 이용 중 등)는
// 함수가 한국어 메시지로 돌려주므로 그대로 보여 준다.
// 좌석 중복은 DB가 막으므로, 화면이 먼저 걸러도 여기서 한 번 더 확인된다.
import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import DurationPicker from './DurationPicker'
import SeatMap from './SeatMap'
import { formatMinutes } from './duration'
import branch from '../space/branches/byeol.json'

type Step = 'duration' | 'seat' | 'done'

type Props = {
  // 누구 것으로 기록할지는 화면이 정하지 않는다. assign_seat 함수가 서버에서 auth.uid() 로 확인한다.
  branchId?: number
  onClose: () => void
  onAssigned?: (seatNumber: number) => void
}

export default function KioskScreen({ branchId = 1, onClose, onAssigned }: Props) {
  const [step, setStep] = useState<Step>('duration')
  const [minutes, setMinutes] = useState(60)
  const [occupied, setOccupied] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 점유 현황은 좌석 번호만 돌려주는 함수로 받는다. 누가 앉았는지는 받지 않는다.
  const loadOccupied = useCallback(async () => {
    const { data, error } = await supabase.rpc('occupied_seat_numbers', { p_branch_id: branchId })
    if (error) {
      setError(`좌석 현황을 불러오지 못했습니다: ${error.message}`)
      return
    }
    setOccupied(new Set((data ?? []) as number[]))
  }, [branchId])

  // 좌석 현황은 화면을 열 때와 배정에 실패했을 때 불러온다.
  async function goToSeatStep() {
    setError('')
    await loadOccupied()
    setStep('seat')
  }

  async function assign(seatNumber: number) {
    setBusy(true)
    setError('')

    const { error } = await supabase.rpc('assign_seat', {
      p_branch_id: branchId,
      p_seat_number: seatNumber,
      p_duration_minutes: minutes,
    })
    setBusy(false)

    if (error) {
      // 함수가 올리는 메시지가 이미 한국어 안내문이다.
      setError(error.message)
      setPicked(null)
      void loadOccupied()
      return
    }

    setStep('done')
    onAssigned?.(seatNumber)
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span>키오스크 · {branch.name}</span>
          <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {step === 'duration' && (
          <>
            <p style={styles.title}>이용 시간을 선택해 주세요</p>
            <DurationPicker minutes={minutes} onChange={setMinutes} />
            <button type="button" style={styles.primary} onClick={() => void goToSeatStep()}>
              {formatMinutes(minutes)}으로 자리 고르기
            </button>
          </>
        )}

        {step === 'seat' && (
          <>
            <p style={styles.title}>자리를 선택해 주세요</p>
            <p style={styles.sub}>
              이용 시간 {formatMinutes(minutes)} · 빈자리 {branch.seats.length - occupied.size}석
              <button type="button" style={styles.link} onClick={() => setStep('duration')}>
                시간 다시 고르기
              </button>
              <button type="button" style={styles.link} onClick={() => void loadOccupied()}>
                현황 새로고침
              </button>
            </p>
            <SeatMap occupied={occupied} selected={picked} onSelect={setPicked} />
            <div style={styles.legend}>
              <span style={{ color: '#4ade80' }}>■ 빈자리</span>
              <span style={{ color: '#6b7280' }}>■ 이용 중</span>
              <span style={{ color: '#f59e0b' }}>■ 선택함</span>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p style={styles.title}>{picked}번 자리를 배정했습니다</p>
            <p style={styles.sub}>이용 시간 {formatMinutes(minutes)}. 자리로 이동해 앉아 주세요.</p>
            <button type="button" style={styles.primary} onClick={onClose}>
              닫기
            </button>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>

      {/* 확인 대화 */}
      {step === 'seat' && picked !== null && (
        <div style={styles.confirmBackdrop}>
          <div style={styles.confirm}>
            <p style={{ ...styles.title, margin: 0 }}>{picked}번 자리를 선택하시겠습니까?</p>
            <p style={styles.sub}>이용 시간 {formatMinutes(minutes)}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={{ ...styles.primary, flex: 1, marginTop: 0 }}
                disabled={busy}
                onClick={() => void assign(picked)}
              >
                {busy ? '배정 중…' : '예'}
              </button>
              <button
                type="button"
                style={{ ...styles.secondary, flex: 1 }}
                disabled={busy}
                onClick={() => setPicked(null)}
              >
                아니오
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(16,18,22,.75)',
    font: '15px/1.6 system-ui, sans-serif',
    zIndex: 20,
  },
  panel: {
    width: 'min(560px, 92vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 24,
    borderRadius: 14,
    background: '#2b2f38',
    color: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#9aa1ab',
    fontSize: 13,
  },
  close: { background: 'none', border: 'none', color: '#9aa1ab', fontSize: 16, cursor: 'pointer' },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  sub: { margin: 0, fontSize: 13, color: '#9aa1ab', display: 'flex', gap: 10, alignItems: 'center' },
  link: {
    background: 'none',
    border: 'none',
    color: '#9ec1ff',
    font: 'inherit',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
  },
  primary: {
    marginTop: 4,
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#4ade80',
    color: '#20232a',
    font: '15px system-ui, sans-serif',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondary: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #4b515c',
    background: 'transparent',
    color: '#fff',
    font: '15px system-ui, sans-serif',
    cursor: 'pointer',
  },
  legend: { display: 'flex', gap: 14, fontSize: 13, color: '#9aa1ab' },
  error: { margin: 0, color: '#f87171', fontSize: 14 },
  confirmBackdrop: {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(16,18,22,.6)',
    zIndex: 21,
  },
  confirm: {
    width: 'min(360px, 88vw)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 24,
    borderRadius: 12,
    background: '#2b2f38',
    color: '#fff',
  },
} satisfies Record<string, React.CSSProperties>
