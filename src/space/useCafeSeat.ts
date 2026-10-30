// 카페 자리: 빈자리에 앉으면 내 자리, 일어나면 놓기 (#44). 카페 지점과 광장 벤치(0038)가 같이 씁니다.
//
// 앉기 전에 DB에 자리를 잡아 봅니다(sit_cafe_seat, 0014). 두 사람이 동시에 눌러도 DB가 한 명만 통과시킵니다.
// 잡히면 Player 에게 앉으라고 알리고(sitRequest), 실패하면 안내를 띄웁니다(message, 4초 뒤 사라짐).
// 다른 자리(예: 별다방 7번)를 쓰는 중이면 DT001 오류가 오고, conflict 로 "반납하고 앉기" 창을 띄웁니다(CafeConflictDialog).
// 카페 자리는 앉아 있는 동안만 내 것입니다. 화면을 떠나거나 창을 닫으면 놓고,
// 들어올 때는 지난번에 놓지 못한 자리가 남아 있으면 정리합니다.
//   cleanup 'all'        : 들어오면 내 카페 자리를 모두 놓습니다(leave_cafe_seat 그대로). 카페 지점의 원래 동작
//   cleanup 'thisBranch' : 이 지점에 남은 내 자리가 있을 때만 놓습니다. 광장은 첫 화면이라, 다른 기기·탭에서
//                          카페 지점에 앉아 공부 중인 자리를 광장을 열었다고 놓아 버리지 않게 합니다.
//
// 자리 요청(잡기·놓기·반납·들어올 때 정리)은 serialQueue 로 들어온 순서대로 하나씩 보냅니다(#340). 일어나자마자 다시 앉아도
// "놓기"가 끝난 뒤 "잡기"가 가서, 방금 일어난 자기 자리 때문에 "○번 자리를 이용 중이에요" 창이 뜨지 않습니다.
//
// seatNo 는 DB 좌석 번호, spotNo 는 Player 의 자리 번호입니다. 지점은 둘이 같고, 광장 벤치는 다릅니다(BENCH_SEAT_BASE).
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { serialQueue } from './serialQueue'

const MESSAGE_MS = 4000 // 안내를 보여 주는 시간

export type SeatConflict = { message: string; seatNo: number; spotNo: number }

// branchId: 카페 지점 번호. null 이면(카페가 아니거나 아직 못 읽음) 아무것도 하지 않습니다.
// seated: 지금 앉아 있는지. onMySeat: 내 자리(DB 좌석 번호)가 바뀌면 부름(놓으면 null)
export function useCafeSeat(
  branchId: number | null,
  seated: boolean,
  onMySeat: (seatNo: number | null) => void,
  cleanup: 'all' | 'thisBranch' = 'all',
) {
  const sitRequest = useRef<number | null>(null) // Player 에게 앉으라고 알릴 자리 번호
  const [message, setMessage] = useState('') // 잠깐 보여 줄 안내 (다른 사람이 먼저 앉음 등)
  const [conflict, setConflict] = useState<SeatConflict | null>(null) // 다른 자리를 쓰는 중
  const [inOrder] = useState(serialQueue) // 자리 요청을 순서대로 하나씩 (이 화면 동안 하나)
  const onMySeatRef = useRef(onMySeat)
  useEffect(() => {
    onMySeatRef.current = onMySeat
  })

  const claim = async (seatNo: number, spotNo: number = seatNo) => {
    if (branchId === null) return
    const { error } = await inOrder(() => supabase.rpc('sit_cafe_seat', { p_branch_id: branchId, p_seat_number: seatNo }))
    if (error) {
      // DT001: 다른 자리(예: 별다방 7번)를 이용 중. 반납하고 앉기 버튼을 띄웁니다.
      if (error.code === 'DT001') setConflict({ message: error.message, seatNo, spotNo })
      else setMessage(error.message)
      return
    }
    setMessage('')
    onMySeatRef.current(seatNo)
    sitRequest.current = spotNo
  }

  const releaseAndSit = async () => {
    if (!conflict) return
    const { seatNo, spotNo } = conflict
    setConflict(null)
    const { error } = await inOrder(() => supabase.rpc('release_my_place')) // 0008: 쓰고 있던 자리 반납
    if (error) {
      setMessage(`반납하지 못했어요: ${error.message}`)
      return
    }
    await claim(seatNo, spotNo)
  }

  // 일어날 때 부릅니다.
  const leave = () => {
    if (branchId === null) return
    void inOrder(() => supabase.rpc('leave_cafe_seat')).then(() => onMySeatRef.current(null))
  }

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), MESSAGE_MS)
    return () => clearTimeout(t)
  }, [message])

  const seatedRef = useRef(false)
  useEffect(() => {
    seatedRef.current = seated
  }, [seated])
  useEffect(() => {
    if (branchId === null) return
    // 들어올 때 정리도 줄에 넣어, 들어오자마자 앉아도 정리가 끝난 뒤에 잡습니다.
    if (cleanup === 'all') void inOrder(() => supabase.rpc('leave_cafe_seat')).then(() => onMySeatRef.current(null))
    else
      // 이 지점의 끝나지 않은 내 이용 기록이 있을 때만 (seat_sessions 는 RLS 로 본인 것만 보임)
      void inOrder(async () => {
        const { data } = await supabase
          .from('seat_sessions')
          .select('id, seats!inner(branch_id)')
          .is('ended_at', null)
          .eq('seats.branch_id', branchId)
          .limit(1)
        if (data && data.length > 0) {
          await supabase.rpc('leave_cafe_seat')
          onMySeatRef.current(null)
        }
      })
    // 창을 닫을 때는 앞 요청을 기다릴 틈이 없으므로 바로 보냅니다.
    const leaveOnPageHide = () => {
      if (seatedRef.current) void supabase.rpc('leave_cafe_seat')
    }
    window.addEventListener('pagehide', leaveOnPageHide)
    return () => {
      window.removeEventListener('pagehide', leaveOnPageHide)
      if (seatedRef.current) void inOrder(() => supabase.rpc('leave_cafe_seat')) // 화면을 떠날 때
    }
  }, [branchId, cleanup, inOrder])

  return { claim, releaseAndSit, leave, message, conflict, closeConflict: () => setConflict(null), sitRequest }
}
