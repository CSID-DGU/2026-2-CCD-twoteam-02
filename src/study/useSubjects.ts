// 내 과목 목록을 읽고, 새 과목을 추가합니다.
// subjects 는 RLS 로 본인 것만 보이고, 추가할 때는 user_id 가 본인이어야 합니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Subject = { id: number; name: string }

export const SUBJECT_MAX = 20 // subjects.name 의 check 제약과 같은 값

export function useSubjects(userId: string | undefined) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('subjects')
      .select('id, name')
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('과목을 불러오지 못했습니다:', error.message)
          setLoadError('과목을 불러오지 못했어요. 새로고침해 주세요.')
        }
        setSubjects((data ?? []) as Subject[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // 성공하면 새 과목을, 실패하면 한국어 안내문을 돌려줍니다.
  const addSubject = useCallback(
    async (rawName: string): Promise<Subject | string> => {
      const name = rawName.trim()
      if (!userId) return '로그인이 필요합니다.'
      if (name.length < 1 || name.length > SUBJECT_MAX) return `과목 이름은 1~${SUBJECT_MAX}자로 적어 주세요.`
      const { data, error } = await supabase
        .from('subjects')
        .insert({ user_id: userId, name })
        .select('id, name')
        .single()
      if (error) {
        // 23505: (user_id, name) 유니크 제약. 같은 이름이 이미 있습니다.
        return error.code === '23505' ? '이미 있는 과목입니다.' : `과목을 추가하지 못했습니다: ${error.message}`
      }
      const subject = data as Subject
      setSubjects((list) => [...list, subject])
      return subject
    },
    [userId],
  )

  return { subjects, loading, loadError, addSubject }
}
