// 뜯어 쓰는 메모 (memo_notes, 0045). RLS 로 내 것만.
// 글·자리를 바꾸면 바로 화면에 보이고, 서버에는 메모마다 SAVE_DELAY_MS 뒤 한 번에 저장합니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const SAVE_DELAY_MS = 700
export const MEMO_COLORS = ['yellow', 'pink', 'blue', 'green'] as const
export type MemoColor = (typeof MEMO_COLORS)[number]
export type Memo = { id: number; body: string; color: MemoColor; shown: boolean; x: number; y: number }
type Patch = Partial<Omit<Memo, 'id'>>

export function useMemos() {
  const [memos, setMemos] = useState<Memo[]>([])
  const pending = useRef(new Map<number, { patch: Patch; timer: number }>())

  useEffect(() => {
    let alive = true
    supabase
      .from('memo_notes')
      .select('id, body, color, shown, x, y')
      .order('created_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('메모를 불러오지 못했습니다:', error.message)
        setMemos((data ?? []) as Memo[])
      })
    const waiting = pending.current
    return () => {
      alive = false
      // 닫을 때 쓰던 것 저장
      for (const [id, p] of waiting) {
        window.clearTimeout(p.timer)
        void supabase.from('memo_notes').update({ ...p.patch, updated_at: new Date().toISOString() }).eq('id', id)
      }
      waiting.clear()
    }
  }, [])

  // 한 장 뜯기: 화면 가운데쯤에 붙임
  // 실패하면 안내 문구를, 성공하면 null 을 돌려줌
  const tear = useCallback(async (color: MemoColor): Promise<string | null> => {
    const x = 0.45 + Math.random() * 0.1
    const y = 0.3 + Math.random() * 0.1
    const { data, error } = await supabase.from('memo_notes').insert({ color, x, y, shown: true }).select('id, body, color, shown, x, y').single()
    if (error) {
      console.error('메모를 만들지 못했습니다:', error.message)
      return '메모를 뜯지 못했어요. (서버에 메모 저장소가 아직 없거나 연결이 끊겼어요)'
    }
    setMemos((m) => [...m, data as Memo])
    return null
  }, [])

  const change = useCallback((id: number, patch: Patch) => {
    setMemos((m) => m.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    const waiting = pending.current
    const prev = waiting.get(id)
    if (prev) window.clearTimeout(prev.timer)
    const merged = { ...prev?.patch, ...patch }
    const timer = window.setTimeout(() => {
      waiting.delete(id)
      void supabase
        .from('memo_notes')
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq('id', id)
        .then(({ error }) => error && console.error('메모를 저장하지 못했습니다:', error.message))
    }, SAVE_DELAY_MS)
    waiting.set(id, { patch: merged, timer })
  }, [])

  const remove = useCallback(async (id: number) => {
    const p = pending.current.get(id)
    if (p) window.clearTimeout(p.timer)
    pending.current.delete(id)
    setMemos((m) => m.filter((n) => n.id !== id))
    const { error } = await supabase.from('memo_notes').delete().eq('id', id)
    if (error) console.error('메모를 지우지 못했습니다:', error.message)
  }, [])

  return { memos, tear, change, remove }
}
