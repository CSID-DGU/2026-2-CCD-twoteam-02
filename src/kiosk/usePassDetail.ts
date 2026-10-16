// 영수증에 찍을 이용 정보(지점 이름·종류, 입실 시각, 이용권 시간)를 읽습니다. (#39)
//
// 1분마다 받는 heartbeat 응답(SeatTimeCorner)에는 자리 번호와 끝나는 시각만 있어서, 나머지는 여기서 읽습니다.
// 내 이용 기록·이용권만 읽히도록 RLS 가 막고 있습니다(0004). 지점·좌석은 로그인 사용자 누구나 읽습니다.
// key 가 바뀔 때(자리 배정·연장·반납)만 다시 읽습니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type PassDetail = {
  sessionId: string
  branchName: string
  branchKind: string // 'studycafe' | 'cafe' (0014)
  startedAt: string
  durationMinutes: number // 연장을 합친 이용권 시간 (0016)
}

type Branch = { name: string; kind?: string }
type Row = {
  id: string
  started_at: string
  passes: { duration_minutes: number } | { duration_minutes: number }[] | null
  place: { branches: Branch | Branch[] | null } | { branches: Branch | Branch[] | null }[] | null
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export function usePassDetail(kind: 'seat' | 'room' | null, key: string) {
  const [result, setResult] = useState<{ key: string; detail: PassDetail | null } | null>(null)

  useEffect(() => {
    if (!kind) return
    let alive = true
    const table = kind === 'room' ? 'room_sessions' : 'seat_sessions'
    const place = kind === 'room' ? 'rooms' : 'seats'
    supabase
      .from(table)
      .select(`id, started_at, passes(duration_minutes), place:${place}(branches(name, kind))`)
      .is('ended_at', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('영수증 정보를 불러오지 못했습니다:', error.message)
        const row = data as Row | null
        const branch = one(one(row?.place)?.branches)
        const pass = one(row?.passes)
        setResult({
          key,
          detail: row
            ? {
                sessionId: row.id,
                branchName: branch?.name ?? '',
                branchKind: branch?.kind ?? 'studycafe',
                startedAt: row.started_at,
                durationMinutes: pass?.duration_minutes ?? 0,
              }
            : null,
        })
      })
    return () => {
      alive = false
    }
  }, [kind, key])

  // 다른 자리를 읽는 중에는 이전 값을 보여 주지 않습니다.
  return result && result.key === key ? result.detail : null
}
