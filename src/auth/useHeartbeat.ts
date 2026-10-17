// "아직 접속해 있다"를 주기적으로 알립니다. (#170)
//
// 왜 여기(앱 전체)에 있나:
//   #155 에서 접속이 끊기면 자리를 반납하게 만들면서, 신호를 보내는 곳을 지점 화면
//   하나로 뒀습니다. 그래서 자리를 받고 로비나 트래킹 화면으로 가면 신호가 끊기고
//   5분 뒤 자리를 잃었습니다. 접속 여부는 "지점 화면에 있는 중"이 아니라
//   "서비스에 접속 중"으로 판단해야 하므로, 주소와 무관하게 도는 이곳으로 옮깁니다.
//
//   탭을 닫거나 노트북이 절전으로 들어가면 신호가 멈춥니다. 그건 의도된 동작입니다.
//
// 지점 화면의 SeatTimeCorner 도 같은 함수를 부릅니다. 거기서는 남은 시간과 영수증에
// 쓸 자리 정보가 필요해서 응답을 쓰는 것이고, 여기서는 신호만 보냅니다.
// 1분에 한 번 더 부르는 비용은 무시할 수준이라 둘을 합치지 않았습니다.
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from './useSession'

// 자리를 비우는 기준은 5분입니다(0017). 그보다 넉넉히 자주 보냅니다.
export const HEARTBEAT_MS = 60 * 1000

export function useHeartbeat() {
  const { session } = useSession()
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    // 자리가 없는 사람도 부르지만, 그때는 DB 가 고칠 행이 없어 사실상 아무 일도 하지 않습니다.
    const send = () => void supabase.rpc('heartbeat')
    send()
    const timer = setInterval(send, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [userId])
}
