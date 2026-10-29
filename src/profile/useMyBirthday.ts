// 내 생일(양력 월·일)을 DB(profiles)에서 읽고 고칩니다. (#321 별자리 운세)
//
// 별자리에는 월·일만 있으면 되므로 태어난 해는 받지 않습니다. profiles 는 RLS 로 본인만 읽고 고칠 수 있어서
// 생일은 다른 사람에게 보이지 않습니다(0035_birthday.sql).
// 한 화면에서 생일을 바꾸면(계정 탭·운세 창) 같은 훅을 쓰는 다른 화면(하늘의 금색 별자리)도 바로 따라오도록
// 바뀌었다고 알리는 작은 구독을 둡니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Birthday = { month: number; day: number }

const listeners = new Set<() => void>()
const announce = () => listeners.forEach((f) => f())

export function useMyBirthday(myId: string | null | undefined) {
  const [birthday, setBirthday] = useState<Birthday | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  // 다른 화면에서 바꾸면 다시 읽습니다.
  useEffect(() => {
    const reload = () => setVersion((v) => v + 1)
    listeners.add(reload)
    return () => {
      listeners.delete(reload)
    }
  }, [])

  useEffect(() => {
    if (!myId) return
    let alive = true
    supabase
      .from('profiles')
      .select('birth_month, birth_day')
      .eq('id', myId)
      .single()
      .then(({ data }) => {
        if (!alive) return
        const m = data?.birth_month as number | null | undefined
        const d = data?.birth_day as number | null | undefined
        setBirthday(m && d ? { month: m, day: d } : null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [myId, version])

  // 저장(null 이면 지우기). 실패하면 한국어 문구, 성공하면 null
  const save = useCallback(
    async (next: Birthday | null): Promise<string | null> => {
      if (!myId) return '로그인이 필요해요.'
      const { error } = await supabase
        .from('profiles')
        .update({ birth_month: next?.month ?? null, birth_day: next?.day ?? null })
        .eq('id', myId)
      if (error) return `생일을 저장하지 못했어요: ${error.message}`
      // 가입할 때 넘긴 생일은 계정 정보(user_metadata)에도 남아 있습니다. 원본은 profiles 이므로
      // 바꾸거나 지우면 그쪽 사본은 비워, 지웠는데 계정 정보에 남아 있는 일이 없게 합니다.
      // 실패해도 profiles 는 이미 바뀌었으니 저장은 성공으로 봅니다.
      await supabase.auth.updateUser({ data: { birth_month: null, birth_day: null } })
      announce()
      return null
    },
    [myId],
  )

  return { birthday, loading, save }
}
