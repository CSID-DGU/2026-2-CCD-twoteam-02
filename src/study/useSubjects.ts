// 내 과목 목록을 읽고, 추가·이름 수정·정리·꺼내기·삭제를 합니다. (#369)
// subjects 는 RLS 로 본인 것만 보이고 고칠 수 있습니다(0004). 정리한 과목(archived_at)도 같이 읽습니다.
//
// 같은 화면에 이 훅을 쓰는 곳이 여럿일 수 있어(공부 시작 창, 설정의 [과목] 탭, 내 기록),
// 한 곳에서 바꾸면 changed() 로 알려 나머지도 다시 읽게 합니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { checkSubjectName, subjectErrorText } from './subjectLogic'
import type { Subject } from './subjectLogic'

export type { Subject } from './subjectLogic'
export { SUBJECT_MAX } from './subjectLogic'

type DbRow = { id: number; name: string; archived_at: string | null }
const toSubject = (r: DbRow): Subject => ({ id: r.id, name: r.name, archivedAt: r.archived_at })

// 과목이 바뀌면 이 훅을 쓰는 모든 곳에 알립니다.
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

export function useSubjects(userId: string | undefined) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState(0) // 다른 곳에서 바꾸면 올라가 다시 읽음

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('subjects')
      .select('id, name, archived_at')
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('과목을 불러오지 못했습니다:', error.message)
          setLoadError('과목을 불러오지 못했어요. 새로고침해 주세요.')
        } else {
          setLoadError('')
          setSubjects(((data ?? []) as DbRow[]).map(toSubject))
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, version])

  // 성공하면 새 과목을, 실패하면 한국어 안내문을 돌려줍니다.
  const addSubject = useCallback(
    async (rawName: string): Promise<Subject | string> => {
      if (!userId) return '로그인이 필요합니다.'
      const invalid = checkSubjectName(rawName)
      if (invalid) return invalid
      const { data, error } = await supabase
        .from('subjects')
        .insert({ user_id: userId, name: rawName.trim() })
        .select('id, name, archived_at')
        .single()
      if (error) return subjectErrorText(error.code, error.message, '추가하지')
      const subject = toSubject(data as DbRow)
      setSubjects((list) => [...list, subject])
      changed()
      return subject
    },
    [userId],
  )

  // 아래 셋은 성공하면 '', 실패하면 안내문을 돌려줍니다.
  const renameSubject = useCallback(async (id: number, rawName: string): Promise<string> => {
    const name = rawName.trim()
    const invalid = checkSubjectName(name)
    if (invalid) return invalid
    const { error } = await supabase.from('subjects').update({ name }).eq('id', id)
    if (error) return subjectErrorText(error.code, error.message, '바꾸지')
    setSubjects((list) => list.map((s) => (s.id === id ? { ...s, name } : s)))
    changed()
    return ''
  }, [])

  // archived: true 면 정리, false 면 다시 꺼내기
  const setArchived = useCallback(async (id: number, archived: boolean): Promise<string> => {
    const archivedAt = archived ? new Date().toISOString() : null
    const { error } = await supabase.from('subjects').update({ archived_at: archivedAt }).eq('id', id)
    if (error) return subjectErrorText(error.code, error.message, archived ? '정리하지' : '꺼내지')
    setSubjects((list) => list.map((s) => (s.id === id ? { ...s, archivedAt } : s)))
    changed()
    return ''
  }, [])

  // 지워도 공부 기록은 남습니다(과목 번호만 비워짐, 0050).
  const removeSubject = useCallback(async (id: number): Promise<string> => {
    const { error } = await supabase.from('subjects').delete().eq('id', id)
    if (error) return subjectErrorText(error.code, error.message, '지우지')
    setSubjects((list) => list.filter((s) => s.id !== id))
    changed()
    return ''
  }, [])

  return { subjects, loading, loadError, addSubject, renameSubject, setArchived, removeSubject }
}

export type SubjectsApi = ReturnType<typeof useSubjects>
