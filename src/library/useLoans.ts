// 내 책 대여 목록 (book_loans, 0055). RLS 로 내 것만 읽고, 빌리기는 DB 함수 borrow_book 으로만 합니다.
// 읽던 문단 자리(position)는 바꿀 때마다 쓰지 않고 SAVE_DELAY_MS 동안 모았다가 한 번에 저장합니다.
//
// 같은 화면에 이 훅을 쓰는 곳이 여럿일 수 있어, 한 곳에서 바꾸면 changed() 로 알려 나머지도 다시 읽게 합니다(useSubjects 와 같은 방식).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { activeLoans, loanErrorText } from './libraryLogic'
import type { Loan } from './libraryLogic'

const SAVE_DELAY_MS = 700
const NOW_REFRESH_MS = 60_000 // 기한 판정 시각을 1분마다 갱신(DB 를 다시 읽지 않음). 오래 열어 둔 탭에서도 기한이 지난 책이 가방에서 사라지게 함

type DbRow = { id: number; book_id: string; due_at: string; returned_at: string | null; position: number }
const toLoan = (r: DbRow): Loan => ({ id: r.id, bookId: r.book_id, dueAt: r.due_at, returnedAt: r.returned_at, position: r.position })
const COLUMNS = 'id, book_id, due_at, returned_at, position'

// 대여가 바뀌면 이 훅을 쓰는 모든 곳에 알립니다.
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

export function useLoans() {
  const [rows, setRows] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0) // 다른 곳에서 바꾸면 올라가 다시 읽음
  const [now, setNow] = useState(() => Date.now()) // 기한 판정에 쓰는 시각 (다시 읽을 때와 NOW_REFRESH_MS 마다 갱신)
  const pending = useRef(new Map<number, { position: number; timer: number }>())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), NOW_REFRESH_MS)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    let alive = true
    supabase
      .from('book_loans')
      .select(COLUMNS)
      .is('returned_at', null)
      .order('borrowed_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('대여 목록을 불러오지 못했습니다:', error.message)
        setRows(((data ?? []) as DbRow[]).map(toLoan))
        setNow(Date.now())
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [version])

  // 닫을 때 저장 대기 중인 자리 저장
  useEffect(() => {
    const waiting = pending.current
    return () => {
      for (const [id, p] of waiting) {
        window.clearTimeout(p.timer)
        void supabase.from('book_loans').update({ position: p.position }).eq('id', id)
      }
      waiting.clear()
    }
  }, [])

  // 성공하면 null, 실패하면 안내문을 돌려줌
  const borrow = useCallback(async (bookId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('borrow_book', { p_book_id: bookId })
    if (error) {
      changed() // 다른 탭에서 바뀐 상태일 수 있어 버튼·가방을 다시 읽게 함
      return loanErrorText(error.code, error.message)
    }
    setRows((list) => [...list, toLoan(data as DbRow)])
    setNow(Date.now())
    changed()
    return null
  }, [])

  const giveBack = useCallback(async (loanId: number): Promise<string | null> => {
    const p = pending.current.get(loanId)
    if (p) window.clearTimeout(p.timer)
    pending.current.delete(loanId)
    const { error } = await supabase.from('book_loans').update({ returned_at: new Date().toISOString() }).eq('id', loanId)
    if (error) {
      console.error('책을 반납하지 못했습니다:', error.message)
      return '책을 반납하지 못했어요. 잠시 뒤 다시 눌러 주세요.'
    }
    setRows((list) => list.filter((l) => l.id !== loanId))
    changed()
    return null
  }, [])

  const savePosition = useCallback((loanId: number, paragraph: number) => {
    setRows((list) => list.map((l) => (l.id === loanId ? { ...l, position: paragraph } : l)))
    const waiting = pending.current
    const prev = waiting.get(loanId)
    if (prev) window.clearTimeout(prev.timer)
    const timer = window.setTimeout(() => {
      waiting.delete(loanId)
      void supabase
        .from('book_loans')
        .update({ position: paragraph })
        .eq('id', loanId)
        .then(({ error }) => error && console.error('읽던 자리를 저장하지 못했습니다:', error.message))
    }, SAVE_DELAY_MS)
    waiting.set(loanId, { position: paragraph, timer })
  }, [])

  return { loans: activeLoans(rows, now), loading, borrow, giveBack, savePosition }
}
