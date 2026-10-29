// 내가 팀(신고 목록을 볼 수 있는 사람)인지 (#121).
// team_members 에 내 행이 있으면 팀입니다. RLS 로 내 행만 보이므로 count 가 0 또는 1 입니다.
// 이 값은 메뉴에 "신고 목록"을 보일지만 정합니다. 실제로 남의 신고를 막는 것은 DB 의 RLS 입니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useIsTeam(myId: string | undefined): boolean {
  const [team, setTeam] = useState(false)

  useEffect(() => {
    if (!myId) return
    let alive = true
    supabase
      .from('team_members')
      .select('user_id')
      .eq('user_id', myId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setTeam(data !== null)
      })
    return () => {
      alive = false
    }
  }, [myId])

  return team
}
