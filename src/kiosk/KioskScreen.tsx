// 키오스크 화면. 지점 공간에서 키오스크 앞에 서면 열리는 덮개 화면이다.
//
// 흐름: (이미 쓰는 자리가 있으면 반납 안내) → 이용 시간 고르기 → 좌석 배치도에서 빈자리 고르기
//       → "N번 자리를 선택하시겠습니까?" → 예
//
// 한 사람은 한 자리만 쓸 수 있으므로, 쓰던 자리가 있으면 먼저 반납해야 새로 고를 수 있다.
// 이용 시간이 끝난 자리는 배정 함수가 알아서 치우므로 여기서 신경 쓰지 않는다. (0009)
//
// 배정은 assign_seat 함수 한 번으로 끝낸다. 이용권 발급과 좌석 배정이 한 덩어리로 묶여 있어
// 중간에 끊겨도 이용권만 남는 일이 없다. 실패 사유(자리 찼음, 이미 다른 자리 이용 중 등)는
// 함수가 한국어 메시지로 돌려주므로 그대로 보여 준다.
// 좌석 중복은 DB가 막으므로, 화면이 먼저 걸러도 여기서 한 번 더 확인된다.
//
// 여러 층 스터디카페(Cam Study Cafe): 실제 스터디카페처럼 1층 키오스크 하나에서 1·2층 자리를 모두 받는다.
// 두 층은 DB 에서 서로 다른 지점이라, 좌석 단계에서 층을 고르면 그 층의 배치도·빈자리·지점 번호로 바꿔 쓴다(floors).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import DurationPicker from './DurationPicker'
import SeatMap from './SeatMap'
import { formatMinutes } from './duration'
import type { BranchLayout } from '../space/layout'
import type { KioskFloor } from './floorLogic'

type Step = 'loading' | 'current' | 'duration' | 'seat' | 'done' | 'extend'

// my_current_place() 가 돌려주는 한 행
type MyPlace = { kind: string; number: number; expires_at: string; expired: boolean; channel?: number } // channel: 0067 부터 (#480)

// '14:30 까지' 처럼 보여 준다.
const untilText = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

type Props = {
  // 누구 것으로 기록할지는 화면이 정하지 않는다. assign_seat 함수가 서버에서 auth.uid() 로 확인한다.
  branchId?: number
  branch: BranchLayout // 지금 서 있는 층의 배치 (이름·좌석 수·배치도). 1층·2층 키오스크가 서로 다른 값을 받는다
  onClose: () => void
  // 배정하면 자리 번호와 그 자리가 있는 층의 지점 번호를 넘긴다. 반납하면 null (반납한 자리는 어느 층이든)
  onAssigned?: (seatNumber: number | null, seatBranchId: number) => void
  channel?: number // 지금 채널 (#481). 채널마다 좌석이 따로라 배치도와 배정이 이 채널 기준이다
  floors?: KioskFloor[] // 이 키오스크에서 고를 수 있는 층 (지금 층 포함). 둘 이상일 때만 층 고르기가 보인다
}

export default function KioskScreen({ branchId = 1, branch, onClose, onAssigned, channel = 1, floors }: Props) {
  // 고른 층. 처음에는 지금 서 있는 층이다. 층이 하나면 지금 층의 배치·번호를 그대로 쓴다
  const floorList = floors && floors.length > 1 ? floors : null
  const [floorId, setFloorId] = useState(branchId)
  const floor = floorList?.find((f) => f.branchId === floorId) ?? null
  const seatLayout = floor?.layout ?? branch
  const seatBranchId = floor?.branchId ?? branchId
  const floorText = floor ? `${floor.level}층 ` : '' // 층이 여럿일 때만 "2층 12번"처럼 층을 붙인다
  const occupiedFor = useRef(branchId) // 마지막으로 현황을 요청한 층 (층을 빨리 바꿔도 늦게 온 다른 층 현황을 쓰지 않게)
  const [step, setStep] = useState<Step>('loading')
  const [mine, setMine] = useState<MyPlace | null>(null)
  const [minutes, setMinutes] = useState(60)
  const [extendMinutes, setExtendMinutes] = useState(30) // 연장할 시간 (#38)
  const [occupied, setOccupied] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 점유 현황은 좌석 번호만 돌려주는 함수로 받는다. 누가 앉았는지는 받지 않는다.
  const loadOccupied = useCallback(async (id: number) => {
    occupiedFor.current = id
    const { data, error } = await supabase.rpc('occupied_seat_numbers', { p_branch_id: id, ...(channel > 1 ? { p_channel: channel } : {}) }) // 1채널은 예전 호출 그대로
    if (occupiedFor.current !== id) return
    if (error) {
      setError(`좌석 현황을 불러오지 못했습니다: ${error.message}`)
      return
    }
    setOccupied(new Set((data ?? []) as number[]))
  }, [channel])

  // 좌석 단계에서 층을 바꾼다. 고르던 자리는 다른 층 번호라 지운다
  function pickFloor(id: number) {
    if (id === floorId) return
    setFloorId(id)
    setPicked(null)
    setOccupied(new Set())
    void loadOccupied(id)
  }

  // 화면이 열릴 때 지금 쓰고 있는 자리가 있는지 먼저 확인한다.
  useEffect(() => {
    let cancelled = false
    supabase.rpc('my_current_place').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setError(`이용 중인 자리를 확인하지 못했습니다: ${error.message}`)
        setStep('duration')
        return
      }
      const row = (data as MyPlace[] | null)?.[0] ?? null
      setMine(row)
      setStep(row ? 'current' : 'duration')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 지금 쓰는 자리의 시간을 늘립니다. (#38)
  async function extend() {
    if (busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('extend_my_place', { p_minutes: extendMinutes })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // 늘어난 시각을 다시 읽어 화면에 반영합니다.
    const { data } = await supabase.rpc('my_current_place')
    const row = Array.isArray(data) ? data[0] : data
    if (row) setMine(row as MyPlace)
    setStep('current')
  }

  async function release() {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('release_my_place')
    setBusy(false)
    if (error) {
      setError(`반납하지 못했습니다: ${error.message}`)
      return
    }
    setMine(null)
    onAssigned?.(null, branchId)
    setStep('duration')
  }

  // 좌석 현황은 화면을 열 때와 배정에 실패했을 때 불러온다.
  async function goToSeatStep() {
    setError('')
    await loadOccupied(seatBranchId)
    setStep('seat')
  }

  async function assign(seatNumber: number) {
    setBusy(true)
    setError('')

    const { error } = await supabase.rpc('assign_seat', {
      p_branch_id: seatBranchId,
      p_seat_number: seatNumber,
      ...(channel > 1 ? { p_channel: channel } : {}),
      p_duration_minutes: minutes,
    })
    setBusy(false)

    if (error) {
      // 함수가 올리는 메시지가 이미 한국어 안내문이다.
      setError(error.message)
      setPicked(null)
      void loadOccupied(seatBranchId)
      return
    }

    setStep('done')
    onAssigned?.(seatNumber, seatBranchId)
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

        {step === 'loading' && <p style={styles.sub}>이용 상태를 확인하는 중…</p>}

        {step === 'current' && mine && (
          <>
            <p style={styles.title}>
              이미 {mine.channel && mine.channel > 1 ? `${mine.channel}채널 ` : ''}{mine.kind === 'room' ? '회의실' : ''} {mine.number}번{' '}
              {mine.kind === 'room' ? '을' : '자리를'} 이용 중입니다
            </p>
            {mine.expired ? (
              <p style={styles.warn}>
                이용 시간이 지났습니다. 자리는 그대로 두었으니 연장해 주세요.
              </p>
            ) : (
              <p style={styles.sub}>{untilText(mine.expires_at)}까지 · 한 번에 한 자리만 쓸 수 있습니다</p>
            )}
            <button type="button" style={styles.primary} onClick={() => setStep('extend')}>
              시간 연장하기
            </button>
            <button type="button" style={styles.secondary} disabled={busy} onClick={() => void release()}>
              {busy ? '반납 중…' : '반납하기'}
            </button>
            <button type="button" style={styles.secondary} onClick={onClose}>
              그대로 두고 닫기
            </button>
          </>
        )}

        {step === 'extend' && mine && (
          <>
            <p style={styles.title}>얼마나 연장할까요?</p>
            <p style={styles.sub}>
              {mine.expired
                ? '지난 시간은 더하지 않고 지금부터 셉니다.'
                : `${untilText(mine.expires_at)}에서 더 늘어납니다.`}
            </p>
            <DurationPicker minutes={extendMinutes} onChange={setExtendMinutes} />
            <button type="button" style={styles.primary} disabled={busy} onClick={() => void extend()}>
              {busy ? '연장 중…' : '연장하기'}
            </button>
            <button type="button" style={styles.secondary} onClick={() => setStep('current')}>
              그만두기
            </button>
          </>
        )}

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
            {floorList && (
              <div style={styles.floors}>
                {floorList.map((f) => (
                  <button
                    key={f.branchId}
                    type="button"
                    style={{ ...styles.floor, ...(f.branchId === seatBranchId ? styles.floorOn : null) }}
                    onClick={() => pickFloor(f.branchId)}
                  >
                    {f.level}층 {f.layout.seats.length}석
                  </button>
                ))}
              </div>
            )}
            <p style={styles.sub}>
              이용 시간 {formatMinutes(minutes)} · 빈자리 {seatLayout.seats.length - occupied.size}석
              <button type="button" style={styles.link} onClick={() => setStep('duration')}>
                시간 다시 고르기
              </button>
              <button type="button" style={styles.link} onClick={() => void loadOccupied(seatBranchId)}>
                현황 새로고침
              </button>
            </p>
            <SeatMap branch={seatLayout} occupied={occupied} selected={picked} onSelect={setPicked} />
            <div style={styles.legend}>
              <span style={{ color: '#4ade80' }}>■ 빈자리</span>
              <span style={{ color: '#6b7280' }}>■ 이용 중</span>
              <span style={{ color: '#f59e0b' }}>■ 선택함</span>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <p style={styles.title}>{floorText}{picked}번 자리를 배정했습니다</p>
            <p style={styles.sub}>
              이용 시간 {formatMinutes(minutes)}. {seatBranchId === branchId ? '자리로 이동해 앉아 주세요.' : '계단으로 이동해 자리에 앉아 주세요.'}
            </p>
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
            <p style={{ ...styles.title, margin: 0 }}>{floorText}{picked}번 자리를 선택하시겠습니까?</p>
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
  warn: { margin: 0, fontSize: 13, color: '#f59e0b' }, // 시간 초과 안내 (#38)
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
  // 층 고르기 (여러 층 스터디카페)
  floors: { display: 'flex', gap: 8 },
  floor: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #4b515c',
    background: 'transparent',
    color: '#d1d5db',
    font: '14px system-ui, sans-serif',
    cursor: 'pointer',
  },
  floorOn: { borderColor: '#4ade80', background: 'rgba(74,222,128,.12)', color: '#fff', fontWeight: 600 },
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
