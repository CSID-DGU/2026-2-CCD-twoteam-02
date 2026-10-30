// 공부 시간 순위 읽기 (#59). DB 함수 study_ranking(0037)을 부릅니다.
// 남의 기록은 study_logs 를 직접 읽지 않고, 함수가 공개 범위('모두')를 확인해 1~20위와 내 줄만 돌려줍니다.
// refreshMs 를 주면 그 간격으로 다시 읽습니다(광장 게시판 판). 순위 창은 열 때·탭을 바꿀 때 읽습니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseRanking } from './rankingLogic'
import type { Period, Ranking } from './rankingLogic'

type State = { key: string; ranking: Ranking | null; error: string }

export function useRanking(period: Period, opts: { refreshMs?: number; enabled?: boolean } = {}) {
  const { refreshMs, enabled = true } = opts
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      supabase.rpc('study_ranking', { p_period: period }).then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('순위를 불러오지 못했습니다:', error.message)
          // PGRST202: 함수가 아직 없음(0037 실행 전)
          const message =
            error.code === 'PGRST202' ? '순위 DB가 아직 준비되지 않았어요. (0037 마이그레이션 실행 필요)' : '순위를 불러오지 못했어요.'
          setState({ key: period, ranking: null, error: message })
          return
        }
        const ranking = parseRanking(data)
        setState({ key: period, ranking, error: ranking ? '' : '순위 모양이 달라요.' })
      })
    void load()
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [period, refreshMs, enabled])

  // 탭을 바꾼 직후에는 이전 탭 값이 남아 있으므로, 지금 기간의 값일 때만 넘깁니다.
  const current = state?.key === period ? state : null
  return { ranking: current?.ranking ?? null, error: current?.error ?? '', loading: enabled && !current }
}
