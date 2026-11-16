// 여러 층 건물에서 층(slug)마다 DB 지점 번호를 읽습니다.
// 1층 키오스크가 2층 자리를 배정하거나, 지점 화면이 다른 층의 내 자리를 찾을 때 씁니다.
// 층이 하나뿐이면 읽지 않습니다(빈 목록이면 null).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useFloorIds(slugs: string[]): Map<string, number> | null {
  const key = slugs.join(',') // 배열은 매번 새로 만들어지므로 글자로 바꿔 비교합니다
  const [result, setResult] = useState<{ key: string; ids: Map<string, number> } | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    supabase
      .from('branches')
      .select('id, slug')
      .in('slug', key.split(','))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('층 정보를 불러오지 못했습니다:', error.message)
          return
        }
        const rows = (data ?? []) as { id: number; slug: string }[]
        setResult({ key, ids: new Map(rows.map((r) => [r.slug, r.id])) })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return result?.key === key ? result.ids : null
}
