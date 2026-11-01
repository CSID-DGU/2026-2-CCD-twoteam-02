// 코르크 게시판 창: 게시판 앞에서 E 를 누르면 뜹니다. 붙은 쪽지(닉네임·며칠 전)를 보고, 아래에서 쪽지를 써서 붙입니다.
// 내 쪽지는 ✕ 로 뗄 수 있고, 게스트는 읽기만 합니다. Esc 또는 바깥을 누르면 닫힘.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { HAND, INK, NOTE_COLOR, PRINT } from '../planner/paperStyle'
import { CHALK, CHALK_FONT } from '../ranking/chalk'
import { useIsGuest } from '../auth/useIsGuest'
import { BOARD, BOARD_COLORS, agoLabel } from './boardLogic'
import type { BoardColor, BoardNote } from './boardLogic'

type Props = {
  notes: BoardNote[]
  myId: string | null
  onPost: (body: string, color: BoardColor) => Promise<string | null>
  onRemove: (id: number) => void
  onClose: () => void
}

export function BoardPanel({ notes, myId, onPost, onRemove, onClose }: Props) {
  const guest = useIsGuest()
  const [text, setText] = useState('')
  const [color, setColor] = useState<BoardColor>('yellow')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // 창을 열면 마우스 잠금을 풀어 글을 쓸 수 있게 하고, Esc 로 닫습니다. (순위 게시판과 같음)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', down)
    const timer = window.setInterval(() => setNow(Date.now()), 60_000) // "n분 전" 갱신
    return () => {
      window.removeEventListener('keydown', down)
      window.clearInterval(timer)
    }
  }, [])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    const err = await onPost(text, color)
    setBusy(false)
    setNotice(err ?? '')
    if (!err) setText('')
  }

  const left = BOARD.maxChars - [...text].length
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ flex: 1 }}>
            <div style={styles.title}>☆ 오늘의 한마디 ☆</div>
            <div style={styles.sub}>함께 공부하는 사람들에게 쪽지를 남겨요 · {BOARD.keepDays}일 뒤 떨어져요</div>
          </div>
          <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={styles.cork}>
          {notes.length === 0 && <div style={styles.empty}>아직 붙은 쪽지가 없어요. 첫 쪽지를 붙여 보세요!</div>}
          {notes.map((n) => (
            <div key={n.id} style={{ ...styles.note, background: NOTE_COLOR[n.color], transform: `rotate(${(((n.id * 13) % 97) / 97 - 0.5) * 5}deg)` }}>
              <span style={styles.pin} />
              {n.userId === myId && (
                <button type="button" style={styles.remove} onClick={() => onRemove(n.id)} title="내 쪽지 떼기" aria-label="내 쪽지 떼기">
                  ✕
                </button>
              )}
              <div style={styles.body}>{n.body}</div>
              <div style={styles.meta}>
                {n.nickname} · {agoLabel(n.createdAt, now)}
              </div>
            </div>
          ))}
        </div>

        {guest ? (
          <div style={styles.guest}>게스트는 쪽지를 읽기만 할 수 있어요. 가입하면 붙일 수 있어요.</div>
        ) : (
          <div style={{ ...styles.write, background: NOTE_COLOR[color] }}>
            <textarea
              value={text}
              onChange={(e) => setText([...e.target.value].slice(0, BOARD.maxChars).join(''))}
              onKeyDown={(e) => {
                e.stopPropagation() // 쓰는 중에 E·WASD 같은 단축키가 움직이지 않게
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
              }}
              placeholder="함께 공부하는 사람들에게 한마디 (예: 오늘 시험 다들 화이팅!)"
              rows={3}
              style={styles.input}
            />
            <div style={styles.row}>
              {BOARD_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={`${c} 쪽지`} style={{ ...styles.chip, background: NOTE_COLOR[c], outline: c === color ? `2px solid ${INK}` : 'none' }} />
              ))}
              <span style={styles.count}>{left}자 남음</span>
              <button type="button" style={styles.post} disabled={busy || !text.trim()} onClick={() => void submit()}>
                {busy ? '붙이는 중…' : '📌 쪽지 붙이기'}
              </button>
            </div>
            {notice && <div style={styles.notice}>{notice}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

const CHALK_SHADOW = '0 0 1px rgba(255,255,255,.35)' // 분필 번짐 (순위 창과 같음)

// 코르크 무늬: 갈색 바탕에 작은 점을 여러 겹 (CSS 그라디언트만으로)
const CORK = [
  'radial-gradient(circle at 20% 30%, rgba(90,55,25,.35) 0 1px, transparent 2px)',
  'radial-gradient(circle at 70% 60%, rgba(255,230,190,.25) 0 1px, transparent 2px)',
  'radial-gradient(circle at 45% 80%, rgba(70,40,15,.3) 0 1.5px, transparent 2.5px)',
].join(', ')

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(20,14,8,.55)' },
  panel: {
    width: 'min(720px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', gap: 12,
    padding: 16, borderRadius: 10, boxSizing: 'border-box', border: `12px solid ${CHALK.wood}`, background: '#a77a4b',
    boxShadow: '0 8px 32px rgba(0,0,0,.5)', fontFamily: PRINT, color: '#fff',
  },
  // 머리: 순위 창("오늘의 공부왕")과 같은 분필 칠판 띠
  header: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, textAlign: 'center',
    background: `radial-gradient(ellipse at 30% 20%, ${CHALK.boardLight} 0%, ${CHALK.board} 45%, ${CHALK.boardDark} 100%)`,
    boxShadow: 'inset 0 0 24px rgba(0,0,0,.4)', font: `15px/1.4 ${CHALK_FONT}`,
  },
  title: { fontSize: 24, fontWeight: 700, color: CHALK.yellow, textShadow: CHALK_SHADOW },
  sub: { fontSize: 14, color: CHALK.white, opacity: 0.9, textShadow: CHALK_SHADOW },
  close: { border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer', alignSelf: 'flex-start' },
  cork: {
    flex: 1, minHeight: 200, overflowY: 'auto', padding: 14, borderRadius: 6, display: 'grid', gap: 14,
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', alignContent: 'start',
    backgroundColor: '#c49a6c', backgroundImage: CORK, backgroundSize: '7px 7px, 11px 11px, 13px 13px',
    boxShadow: 'inset 0 2px 10px rgba(0,0,0,.35)',
  },
  empty: { gridColumn: '1 / -1', textAlign: 'center', padding: 30, color: '#4a3220', fontWeight: 700 },
  note: { position: 'relative', minHeight: 110, padding: '18px 10px 8px', boxShadow: '0 4px 8px rgba(0,0,0,.3)', color: INK, display: 'flex', flexDirection: 'column' },
  pin: { position: 'absolute', top: 5, left: '50%', width: 10, height: 10, marginLeft: -5, borderRadius: '50%', background: '#d33c3c', boxShadow: '0 1px 2px rgba(0,0,0,.5)' },
  remove: { position: 'absolute', top: 2, right: 2, background: 'transparent', border: 'none', color: INK, opacity: 0.6, cursor: 'pointer', fontSize: 13 },
  body: { flex: 1, fontFamily: HAND, fontSize: 21, lineHeight: 1.15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  meta: { marginTop: 6, fontSize: 11, opacity: 0.7 },
  guest: { padding: 12, borderRadius: 8, background: 'rgba(0,0,0,.2)', fontSize: 13, textAlign: 'center' },
  write: { padding: 12, borderRadius: 4, boxShadow: '0 4px 10px rgba(0,0,0,.3)', color: INK },
  input: { width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', border: 'none', outline: 'none', fontFamily: HAND, fontSize: 22, color: INK },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  chip: { width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(0,0,0,.2)', cursor: 'pointer', outlineOffset: 1 },
  count: { flex: 1, textAlign: 'right', fontSize: 12, opacity: 0.7 },
  post: { background: CHALK.board, fontFamily: CHALK_FONT, fontSize: 15, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 800, cursor: 'pointer' },
  notice: { marginTop: 6, fontSize: 12, color: '#a12a2a' },
}
