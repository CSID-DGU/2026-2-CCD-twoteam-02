// 내가 지금 이용 중인 좌석 번호. 키오스크에서 배정받은 자리입니다.
//
// 지점에 들어올 때 DB에서 한 번 읽어 오므로, 새로고침하거나 로비에 다녀와도 유지됩니다.
// seat_sessions 는 RLS 로 본인 기록만 보이므로 user_id 로 거르지 않아도 됩니다.
// 키오스크에서 막 배정받은 자리는 setMySeat 으로 바로 반영합니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useMySeat(branchId: number) {
  const [mySeat, setMySeat] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('seat_sessions')
      // seats!inner: 연결된 좌석 정보를 같이 받고, 아래 지점 조건에 맞는 것만 남깁니다.
      .select('seats!inner(seat_number, branch_id)')
      .is('ended_at', null)
      .gt('expires_at', new Date().toISOString())
      .eq('seats.branch_id', branchId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('내 좌석을 불러오지 못했습니다:', error.message)
        const seat = data?.seats as { seat_number: number } | { seat_number: number }[] | undefined
        const row = Array.isArray(seat) ? seat[0] : seat
        setMySeat(row?.seat_number ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [branchId])

  return { mySeat, setMySeat, loading }
}
