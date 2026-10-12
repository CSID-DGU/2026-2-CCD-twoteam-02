// 프로필 공부 기록 요약을 읽고, 내 공개 범위를 바꿉니다.
// 남의 기록은 study_logs 를 직접 읽지 않고 profile_summary 함수(0013)로 합계만 받습니다.
// 함수가 공개 범위·친구 여부를 확인해서, 볼 수 없으면 allowed=false 와 이름만 돌려줍니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Visibility = 'private' | 'friends' | 'public'

export type ProfileSummary = {
  id: string
  nickname: string
  visibility: Visibility
  allowed: boolean // 내가 이 사람의 공부 기록을 볼 수 있는지
  total_seconds?: number
  week_seconds?: number
  daily?: { date: string; seconds: number }[] // 최근 7일 (오래된 날부터)
  week_subjects?: { name: string; seconds: number }[] // 이번 주 과목별 (많은 순)
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: '나만',
  friends: '친구만',
  public: '모두',
}

export function useProfile(userId: string | undefined) {
  const [result, setResult] = useState<{ id: string; summary: ProfileSummary | null; error: string } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase.rpc('profile_summary', { p_user: userId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.error('프로필을 불러오지 못했습니다:', error.message)
        // PGRST202: 함수가 아직 없음(0013 실행 전)
        const message =
          error.code === 'PGRST202'
            ? '프로필 DB가 아직 준비되지 않았어요. (0013 마이그레이션 실행 필요)'
            : '프로필을 불러오지 못했어요. 새로고침해 주세요.'
        setResult({ id: userId, summary: null, error: message })
        return
      }
      setResult({ id: userId, summary: (data as ProfileSummary | null) ?? null, error: data ? '' : '없는 사용자예요.' })
    })
    return () => {
      cancelled = true
    }
  }, [userId, version])

  // 내 공개 범위 바꾸기. 성공하면 '', 실패하면 안내문
  const setVisibility = useCallback(
    async (visibility: Visibility) => {
      if (!userId) return '로그인이 필요합니다.'
      const { error } = await supabase.from('profiles').update({ visibility }).eq('id', userId)
      if (error) return `공개 범위를 바꾸지 못했어요: ${error.message}`
      setVersion((v) => v + 1)
      return ''
    },
    [userId],
  )

  const current = result && result.id === userId ? result : null // 다른 사람을 열면 읽는 중으로 보입니다.
  return { summary: current?.summary ?? null, loading: !current, error: current?.error ?? '', setVisibility }
}
