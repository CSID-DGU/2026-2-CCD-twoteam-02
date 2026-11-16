// 여러 층 건물에서 내 자리가 다른 층에 있는지 읽습니다. (Cam Study Cafe: 1층 키오스크에서 2층 자리를 받는 경우)
// useMySeat 와 같은 방식(진행 중인 이용 기록, 지금 채널)이지만 지금 층이 아닌 층들(branchIds)에서 찾습니다.
// refreshKey 가 바뀌면 다시 읽습니다(키오스크 배정·반납, 남은 시간 창 반납 뒤).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SeatRow = { seat_number: number; branch_id: number }
export type OtherFloorSeat = { branchId: number; seat: number }

export function useOtherFloorSeat(branchIds: number[], channel: number, refreshKey: unknown): OtherFloorSeat | null {
  const key = branchIds.join(',')
  const [result, setResult] = useState<{ key: string; seat: OtherFloorSeat | null } | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    supabase
      .from('seat_sessions')
      .select('seats!inner(seat_number, branch_id)')
      .is('ended_at', null)
      .in('seats.branch_id', key.split(',').map(Number))
      .eq('channel', channel)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('다른 층의 내 자리를 불러오지 못했습니다:', error.message)
          return
        }
        const seat = data?.seats as SeatRow | SeatRow[] | undefined
        const row = Array.isArray(seat) ? seat[0] : seat
        setResult({ key, seat: row ? { branchId: row.branch_id, seat: row.seat_number } : null })
      })
    return () => {
      cancelled = true
    }
  }, [key, channel, refreshKey])

  return result?.key === key ? result.seat : null
}
