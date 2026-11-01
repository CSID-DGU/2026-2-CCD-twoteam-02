// 코르크 게시판 쪽지 읽기·붙이기·떼기 (board_notes, 0047). RLS 로 7일 안의 쪽지만 보이고, 내 쪽지만 뗄 수 있습니다.
// 다른 사람이 붙인 쪽지는 BOARD.refreshMs 마다 다시 읽어 옵니다. 닉네임은 avatars 뷰에서 (채팅과 같은 방식)
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BOARD, cleanBody } from './boardLogic'
import type { BoardColor, BoardNote } from './boardLogic'

type Row = { id: number; user_id: string; body: string; color: BoardColor; created_at: string }

// slug: 게시판이 있는 지점. null 이면 아무것도 읽지 않음
export function useBoardNotes(slug: string | null) {
  const [notes, setNotes] = useState<BoardNote[]>([])
  const [tick, setTick] = useState(0) // 다시 읽기 신호

  useEffect(() => {
    if (!slug) return
    let alive = true
    void (async () => {
      const { data, error } = await supabase
        .from('board_notes')
        .select('id, user_id, body, color, created_at')
        .eq('branch_slug', slug)
        .order('created_at', { ascending: false })
        .limit(BOARD.fetchLimit)
      if (!alive) return
      if (error) {
        console.error('게시판 쪽지를 불러오지 못했습니다(0047 마이그레이션 확인):', error.message)
        return
      }
      const rows = (data ?? []) as Row[]
      const ids = [...new Set(rows.map((r) => r.user_id))]
      const { data: people } = ids.length ? await supabase.from('avatars').select('id, nickname').in('id', ids) : { data: [] }
      if (!alive) return
      const name = new Map((people ?? []).map((p: { id: string; nickname: string }) => [p.id, p.nickname]))
      setNotes(rows.map((r) => ({ id: r.id, userId: r.user_id, nickname: name.get(r.user_id) ?? '알 수 없음', body: r.body, color: r.color, createdAt: r.created_at })))
    })()
    const timer = window.setInterval(() => setTick((t) => t + 1), BOARD.refreshMs)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [slug, tick])

  // 붙이기: 실패하면 안내 문구, 성공하면 null
  const post = useCallback(
    async (raw: string, color: BoardColor): Promise<string | null> => {
      if (!slug) return '게시판이 없는 곳이에요.'
      const { body, error: bad } = cleanBody(raw)
      if (bad) return bad
      const { error } = await supabase.from('board_notes').insert({ branch_slug: slug, body, color })
      if (error) {
        console.error('쪽지를 붙이지 못했습니다:', error.message)
        // 게스트·도배 막기는 RLS 가 거절해서 같은 오류(42501)로 옴
        if (error.code === '42501') return '지금은 쪽지를 붙일 수 없어요. (게스트이거나 7일 동안 20장을 다 붙였어요)'
        if (error.code === 'PGRST205') return '게시판 저장소가 아직 서버에 없어요. (0047 마이그레이션 실행 필요)'
        return '쪽지를 붙이지 못했어요. 잠시 뒤 다시 해 주세요.'
      }
      setTick((t) => t + 1)
      return null
    },
    [slug],
  )

  const remove = useCallback(async (id: number) => {
    setNotes((n) => n.filter((x) => x.id !== id)) // 바로 떼어 보이게
    const { error } = await supabase.from('board_notes').delete().eq('id', id)
    if (error) console.error('쪽지를 떼지 못했습니다:', error.message)
    setTick((t) => t + 1)
  }, [])

  return { notes, post, remove }
}
