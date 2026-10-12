// 내가 지금 이용 중인 좌석 번호와 그 이용 기록 번호. 키오스크에서 배정받은 자리입니다.
//
// 지점에 들어올 때 DB에서 읽어 오므로, 새로고침하거나 로비에 다녀와도 유지됩니다.
// seat_sessions 는 RLS 로 본인 기록만 보이므로 user_id 로 거르지 않아도 됩니다.
// 키오스크에서 배정·반납하면 setMySeat 으로 좌석 번호를 바로 반영하고,
// 이용 기록 번호(공부 기록 저장에 필요)는 DB에서 다시 읽어 옵니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SeatRow = { seat_number: number }

export function useMySeat(branchId: number) {
  const [mySeat, setSeat] = useState<number | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null) // seat_sessions.id
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0) // 올리면 DB에서 다시 읽습니다.

  useEffect(() => {
    let cancelled = false
    supabase
      .from('seat_sessions')
      // seats!inner: 연결된 좌석 정보를 같이 받고, 아래 지점 조건에 맞는 것만 남깁니다.
      .select('id, seats!inner(seat_number, branch_id)')
      .is('ended_at', null)
      .gt('expires_at', new Date().toISOString())
      .eq('seats.branch_id', branchId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('내 좌석을 불러오지 못했습니다:', error.message)
        const seat = data?.seats as SeatRow | SeatRow[] | undefined
        const row = Array.isArray(seat) ? seat[0] : seat
        setSeat(row?.seat_number ?? null)
        setSessionId((data?.id as string | undefined) ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [branchId, version])

  // 키오스크에서 배정(번호)·반납(null)했을 때 부릅니다.
  const setMySeat = useCallback((no: number | null) => {
    setSeat(no)
    setSessionId(null)
    setVersion((v) => v + 1)
  }, [])

  return { mySeat, sessionId, setMySeat, loading }
}
