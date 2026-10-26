// 회의실 문 앞에서 E 를 누르면 뜨는 창 (#45): 열린 회의 목록, 참가, 새 회의 만들기.
// 새 회의는 인원(2~8)을 꼭 골라야 만들 수 있습니다. 회의실에는 그 수만큼 의자가 놓입니다(0022).
// 목록에는 이 지점의 공개 회의와 내가 초대받았거나 들어 있는 비공개 회의가 보입니다(list_meetings, 0021).
// 참가·만들기에 성공하면 onEnter 로 회의 번호를 넘깁니다. 정원·초대 확인은 DB 함수가 합니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { MEETING_CAPACITIES } from './meetingLogic'

type MeetingRow = {
  id: number
  title: string
  is_private: boolean
  host_nickname: string
  members: number
  capacity: number
  invited: boolean
  joined: boolean
}

type Props = {
  branchId: number // DB 지점 번호
  onEnter: (meetingId: number) => void
  onClose: () => void
}

export function MeetingDialog({ branchId, onEnter, onClose }: Props) {
  const [rows, setRows] = useState<MeetingRow[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [capacity, setCapacity] = useState<number | null>(null) // 고르기 전에는 만들 수 없습니다.
  const [version, setVersion] = useState(0) // 올리면 목록을 다시 읽습니다 (새로고침)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let alive = true
    void supabase.rpc('list_meetings', { p_branch_id: branchId }).then(({ data, error }) => {
      if (!alive) return
      if (error) setError(`회의 목록을 불러오지 못했어요: ${error.message}`)
      setRows((data ?? []) as MeetingRow[])
    })
    return () => {
      alive = false
    }
  }, [branchId, version])

  // Esc 로 닫기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])

  const join = async (id: number) => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('join_meeting', { p_meeting_id: id })
    setBusy(false)
    if (error) {
      setError(error.message)
      reload() // 그사이 정원이 찼거나 끝났을 수 있어 목록을 새로 읽습니다.
      return
    }
    onEnter(id)
  }

  const create = async () => {
    if (capacity === null) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_meeting', {
      p_branch_id: branchId,
      p_title: title,
      p_private: isPrivate,
      p_capacity: capacity,
    })
    setBusy(false)
    if (error || typeof data !== 'number') {
      setError(error?.message ?? '회의를 만들지 못했어요.')
      return
    }
    onEnter(data)
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="회의실">
        <div style={styles.head}>
          <span style={styles.title}>회의실</span>
          <button type="button" style={styles.ghost} onClick={onClose}>닫기</button>
        </div>

        <div style={styles.sectionHead}>
          <span style={styles.label}>열린 회의</span>
          <button type="button" style={styles.ghost} onClick={reload} disabled={busy}>새로고침</button>
        </div>
        <div style={styles.list}>
          {rows === null ? (
            <span style={styles.muted}>불러오는 중…</span>
          ) : rows.length === 0 ? (
            <span style={styles.muted}>열린 회의가 없어요. 아래에서 새로 만들어 보세요.</span>
          ) : (
            rows.map((m) => {
              const full = m.members >= m.capacity && !m.joined
              return (
                <div key={m.id} style={styles.row}>
                  <div style={styles.rowText}>
                    <span style={styles.rowTitle}>
                      {m.is_private && '🔒 '}
                      {m.title}
                      {m.invited && !m.joined && <span style={styles.badge}>초대받음</span>}
                    </span>
                    <span style={styles.muted}>
                      {m.host_nickname} · {m.members}/{m.capacity}명
                    </span>
                  </div>
                  <button
                    type="button"
                    style={{ ...styles.primary, ...(full || busy ? styles.off : null) }}
                    disabled={full || busy}
                    onClick={() => void join(m.id)}
                  >
                    {m.joined ? '돌아가기' : full ? '가득 참' : '참가'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div style={styles.sectionHead}>
          <span style={styles.label}>새 회의 만들기</span>
        </div>
        <input
          style={styles.input}
          value={title}
          maxLength={30}
          placeholder="회의 이름 (비우면 '닉네임의 회의')"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !busy) void create() // 인원을 안 골랐으면 아무 일도 없음
          }}
        />
        <div style={styles.createRow}>
          <span style={styles.muted}>인원</span>
          <div style={styles.toggle} role="radiogroup" aria-label="인원">
            {MEETING_CAPACITIES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={capacity === n}
                style={{ ...styles.toggleItem, ...styles.capacityItem, ...(capacity === n ? styles.toggleOn : null) }}
                onClick={() => setCapacity(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.createRow}>
          <div style={styles.toggle} role="radiogroup" aria-label="공개 범위">
            <button type="button" style={{ ...styles.toggleItem, ...(!isPrivate ? styles.toggleOn : null) }} onClick={() => setIsPrivate(false)}>
              공개
            </button>
            <button type="button" style={{ ...styles.toggleItem, ...(isPrivate ? styles.toggleOn : null) }} onClick={() => setIsPrivate(true)}>
              🔒 비공개
            </button>
          </div>
          <button
            type="button"
            style={{ ...styles.primary, ...(busy || capacity === null ? styles.off : null) }}
            disabled={busy || capacity === null}
            onClick={() => void create()}
          >
            {capacity === null ? '인원을 골라 주세요' : '만들고 들어가기'}
          </button>
        </div>
        <span style={styles.muted}>
          {isPrivate ? '비공개 회의는 초대받은 친구만 들어올 수 있어요.' : '공개 회의는 이 지점의 누구나 들어올 수 있어요.'} 고른 인원만큼 의자가 놓여요.
        </span>
        {error && <span style={styles.error}>{error}</span>}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' },
  box: {
    width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', padding: 20, borderRadius: 12,
    background: '#20232a', color: '#fff', font: '14px/1.5 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: 700 },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  label: { fontWeight: 700 },
  list: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 8, background: '#2a2e37' },
  rowText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  rowTitle: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: '#a78bfa', color: '#1e1b4b', fontSize: 11, fontWeight: 700 },
  muted: { color: '#aab0bb', fontSize: 13 },
  error: { color: '#fca5a5', fontSize: 13 },
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid #4b5563', background: '#16181d', color: '#fff', font: 'inherit' },
  createRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  toggle: { display: 'flex', borderRadius: 6, border: '1px solid #4b5563', overflow: 'hidden' },
  toggleItem: { padding: '6px 12px', border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  capacityItem: { padding: '6px 10px', minWidth: 32 },
  toggleOn: { background: '#374151', color: '#fff', fontWeight: 600 },
  primary: {
    padding: '6px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', font: 'inherit',
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  off: { background: '#374151', color: '#6b7280', cursor: 'default' },
  ghost: {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff',
    cursor: 'pointer', font: 'inherit', fontSize: 13,
  },
}
