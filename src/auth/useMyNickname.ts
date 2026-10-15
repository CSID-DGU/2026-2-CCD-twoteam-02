// 내 닉네임을 DB(profiles)에서 읽습니다.
//
// 가입할 때 계정 정보(user_metadata)에도 같은 값이 들어가지만 그쪽은 쓰지 않습니다.
// 닉네임을 바꿀 수 있게 되면서 저장된 곳이 둘이면 화면마다 다른 이름이 보이기 때문입니다.
// 캐릭터 이름표·프로필·친구 목록이 모두 profiles 를 보므로 여기도 같은 곳을 봅니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from './useSession'

export function useMyNickname() {
  const { session } = useSession()
  const myId = session?.user.id
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  // 닉네임을 바꾼 뒤 다시 읽을 때 씁니다.
  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    if (!myId) return
    let alive = true
    supabase
      .from('profiles')
      .select('nickname')
      .eq('id', myId)
      .single()
      .then(({ data }) => {
        if (!alive) return
        setNickname(data?.nickname ?? '')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [myId, version])

  return { nickname, loading, reload }
}
