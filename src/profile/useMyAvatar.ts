// 내 캐릭터(profiles.avatar.model)를 읽고 바꿉니다.
//
// 로비·지점의 내 캐릭터, 내 모습 화면, 캐릭터 고르는 창이 각자 이 훅을 씁니다.
// 한 곳에서 저장하면 announceMyProfileChanged 로 알려, 다른 곳들도 다시 읽습니다.
// 처음 읽기 전에는 model 이 null 입니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게)
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { DEFAULT_MODEL, announceMyProfileChanged, isCharacterModel, onMyProfileChanged } from './characters'

// 한 번 읽은 값은 기억해 둡니다. 화면을 옮겨도 다시 기다리지 않게 합니다.
let cached: { userId: string; model: string } | null = null

export function useMyAvatar() {
  const { session } = useSession()
  const myId = session?.user.id
  const [result, setResult] = useState<{ userId: string; model: string } | null>(cached)
  const [version, setVersion] = useState(0)

  // 다른 화면에서 저장하면 다시 읽습니다.
  useEffect(() => onMyProfileChanged(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    if (!myId) return
    let alive = true
    supabase
      .from('profiles')
      .select('avatar')
      .eq('id', myId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('내 캐릭터를 불러오지 못했습니다:', error.message)
        const model = (data?.avatar as { model?: unknown } | null)?.model
        cached = { userId: myId, model: isCharacterModel(model) ? model : DEFAULT_MODEL }
        setResult(cached)
      })
    return () => {
      alive = false
    }
  }, [myId, version])

  // 저장. 성공하면 '', 실패하면 안내문
  const save = useCallback(
    async (model: string) => {
      if (!myId) return '로그인이 필요합니다.'
      if (!isCharacterModel(model)) return '고를 수 없는 캐릭터예요.'
      const { error } = await supabase.from('profiles').update({ avatar: { model } }).eq('id', myId)
      if (error) return `캐릭터를 바꾸지 못했어요: ${error.message}`
      cached = { userId: myId, model }
      setResult(cached)
      announceMyProfileChanged()
      return ''
    },
    [myId],
  )

  const model = result && result.userId === myId ? result.model : null
  return { model, save }
}
