// 주소의 ?branch= 값(slug)으로 DB 의 지점 번호·종류를 읽습니다. (#44)
// 지점 번호는 실시간 채널·좌석 배정에, 종류는 자리 잡는 방식(키오스크 / 앉으면 내 자리)에 씁니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type BranchKind = 'studycafe' | 'cafe'
export type BranchInfo = { id: number; name: string; kind: BranchKind }

type Row = { id: number; name: string; kind?: BranchKind }

export function useBranchInfo(slug: string) {
  const [result, setResult] = useState<{ slug: string; info: BranchInfo | null; error: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    // select('*'): kind 칸(0014)이 아직 없는 DB에서도 별다방은 열리도록 칸 이름을 적지 않습니다.
    supabase
      .from('branches')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setResult({ slug, info: null, error: `지점 정보를 불러오지 못했어요: ${error.message}` })
          return
        }
        const row = data as Row | null
        setResult({
          slug,
          info: row ? { id: row.id, name: row.name, kind: row.kind ?? 'studycafe' } : null,
          error: row ? '' : '아직 준비 중인 지점이에요.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const current = result?.slug === slug ? result : null
  return { info: current?.info ?? null, loading: !current, error: current?.error ?? '' }
}
