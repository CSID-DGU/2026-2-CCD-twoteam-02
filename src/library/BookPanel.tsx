// 책 대여 창: 서가 앞에서 E 를 누르면 그 분야 책만, 사서 앞에서 E 를 누르면 전체 목록이 뜹니다. (OrderPanel 과 같은 모양)
// 책마다 제목·저자와 [대여하기] 또는 [빌린 책] 을 보여 주고, 빌리는 일은 useLoans.borrow(DB 함수 borrow_book)가 합니다.
// 책을 다 빌렸으면(MAX_LOANS 권) 버튼을 끄고 안내합니다. Esc 로 닫기. 폰에서도 같은 버튼으로 빌립니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BOOKS } from './catalog'
import { keyLabel, useKeymap } from '../menu/keymap'
import { isTouchMode } from '../space/useIsTouch'
import { LOAN_DAYS, MAX_LOANS, booksOfShelf, canBorrow } from './libraryLogic'
import type { BookShelf } from './libraryLogic'
import { useLoans } from './useLoans'

const box: CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 60,
  width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column',
  padding: 18, borderRadius: 16, boxSizing: 'border-box',
  background: '#2b2f2a', color: '#f4f1e6', border: '6px solid #8a6a4a', boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
}
const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginTop: 8, borderRadius: 10,
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
}
const button: CSSProperties = {
  flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#c9a24a', color: '#2b2f2a',
  font: '600 14px system-ui, sans-serif', cursor: 'pointer',
}
const buttonOff: CSSProperties = { ...button, background: 'rgba(255,255,255,0.15)', color: '#f4f1e6', opacity: 0.6, cursor: 'default' }

// shelf: 그 분야 서가의 책만. null 이면 전체 목록 (사서)
export function BookPanel({ shelf, onClose }: { shelf: BookShelf | null; onClose: () => void }) {
  const { loans, loading, borrow } = useLoans()
  const keymap = useKeymap() // 가방 키는 설정에서 바뀔 수 있음
  const [busyId, setBusyId] = useState<string | null>(null) // 빌리는 중인 책 (겹쳐 누르지 않게)
  const [notice, setNotice] = useState('')
  const [now] = useState(() => Date.now()) // 기한 판정 시각 (useLoans 가 이미 기한 지난 것은 뺌. 창은 잠깐 떠 있어 한 번만 읽음)

  // 창을 열면 마우스 잠금을 풀어 버튼을 누를 수 있게 하고, Esc 로 닫습니다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const books = booksOfShelf(BOOKS, shelf)
  const full = loans.length >= MAX_LOANS

  const pick = async (bookId: string) => {
    setBusyId(bookId)
    const error = await borrow(bookId)
    setBusyId(null)
    setNotice(error ?? (isTouchMode() ? '가방에 넣었어요. 가방에서 꺼내 읽어요.' : `가방에 넣었어요. ${keyLabel(keymap.bag)}키로 가방을 열어 읽어요.`))
  }

  return (
    <div style={box} role="dialog" aria-label="책 빌리기">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 18 }}>📚 {shelf ?? '전체'} 서가</b>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#f4f1e6', fontSize: 18, cursor: 'pointer' }} aria-label="닫기">
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
        {full ? `${MAX_LOANS}권을 다 빌렸어요. 가방에서 반납하면 또 빌릴 수 있어요.` : `빌린 책 ${loans.length}/${MAX_LOANS}권 · ${LOAN_DAYS / 7}주 동안 빌려요`}
      </div>
      {notice && (
        <div role="status" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(201,162,74,0.2)', fontSize: 14 }}>
          {notice}
        </div>
      )}
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {books.map((b) => {
          const state = canBorrow(b.id, loans, now)
          const off = loading || busyId !== null || state !== 'ok'
          return (
            <div key={b.id} style={row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{b.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{shelf === null ? `${b.author} · ${b.shelf}` : b.author}</div>
              </div>
              <button style={off ? buttonOff : button} disabled={off} onClick={() => void pick(b.id)}>
                {state === 'already' ? '빌린 책' : state === 'full' ? '가방이 가득 참' : busyId === b.id ? '빌리는 중…' : '대여하기'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
