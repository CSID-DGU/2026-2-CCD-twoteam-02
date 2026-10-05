// 로그인 상태를 읽는 훅. 화면에서는 session 이 null 인지만 보면 된다.
//
// 로그인 유지(토큰 저장·갱신)는 supabase-js 가 알아서 한다.
// 다른 탭에서 로그인하거나 로그아웃해도 onAuthStateChange 로 따라온다.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  // 첫 확인이 끝나기 전에는 "로그인 안 됨"으로 단정하면 안 된다. (화면이 깜빡이고 로그인창으로 튕긴다)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return
      setSession(next)
      setLoading(false)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}
