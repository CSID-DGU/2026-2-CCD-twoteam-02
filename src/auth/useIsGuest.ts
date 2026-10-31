// 지금 로그인한 사람이 게스트(Supabase 익명 로그인, #375)인지.
// 게스트는 친구·귓속말·그룹·따라가기·부르기·회의·순위 오르기를 쓰지 못합니다(화면에서 숨기고 DB 0045 가 한 번 더 막음).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from './useSession'

export function useIsGuest(): boolean {
  const { session } = useSession()
  return session?.user.is_anonymous === true
}

// 그 계정이 게스트인지 (남의 프로필에서 친구 추가 대신 "게스트"를 보여 줄 때). DB 함수 is_guest_user(0045)
// 0045 를 실행하기 전이거나 못 읽으면 false (예전처럼 친구 추가가 보이고, 보내면 DB 가 막음)
export function useIsGuestUser(userId: string | undefined): boolean {
  const [guest, setGuest] = useState<{ id: string; value: boolean } | null>(null)
  useEffect(() => {
    if (!userId) return
    let alive = true
    void supabase.rpc('is_guest_user', { p_user: userId }).then(({ data }) => {
      if (alive) setGuest({ id: userId, value: data === true })
    })
    return () => {
      alive = false
    }
  }, [userId])
  return guest !== null && guest.id === userId && guest.value
}
