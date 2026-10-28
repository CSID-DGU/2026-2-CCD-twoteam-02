// 팀이 보는 신고 목록 (#121). 최근 LIST_LIMIT 건을 읽고, 확인함 표시를 바꿉니다.
// 팀이 아닌 사람이 불러도 RLS 때문에 자기 신고만 옵니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LIST_LIMIT } from './reportLogic'
import type { ReportRow } from './reportLogic'

type Person = { id: string; nickname: string }

// enabled: 팀일 때만 읽습니다 (팀이 아니면 쓸데없는 요청을 보내지 않음)
export function useReports(enabled: boolean, myId: string) {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({}) // user_id → 닉네임
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)
      if (cancelled) return
      if (error) {
        console.error('신고를 불러오지 못했습니다:', error.message)
        setError('신고를 불러오지 못했어요. 새로고침해 주세요.')
        setLoading(false)
        return
      }
      const list = (data ?? []) as ReportRow[]
      // 닉네임은 avatars 뷰에서 한 번에 (다른 화면도 이 뷰를 씁니다)
      const ids = [...new Set(list.map((r) => r.user_id))]
      const map: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: people } = await supabase.from('avatars').select('id, nickname').in('id', ids)
        for (const p of (people ?? []) as Person[]) map[p.id] = p.nickname
      }
      if (cancelled) return
      setRows(list)
      setNames(map)
      setError('')
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [enabled, version])

  // 확인함 표시. 성공하면 null, 실패하면 한국어 문구. 목록은 자리에서 바꿉니다(다시 읽지 않음).
  const setChecked = useCallback(
    async (id: string, checked: boolean): Promise<string | null> => {
      const patch = { checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? myId : null }
      const { error } = await supabase.from('reports').update(patch).eq('id', id)
      if (error) return `확인 표시를 바꾸지 못했습니다: ${error.message}`
      setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      return null
    },
    [myId],
  )

  return { rows, names, loading, error, setChecked, reload }
}
