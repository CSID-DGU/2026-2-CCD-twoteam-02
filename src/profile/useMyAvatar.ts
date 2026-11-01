// 내 캐릭터 차림(profiles.avatar)을 읽고 바꿉니다. (#131, 캐릭터 꾸미기 #56)
//
// model: 내 차림의 아바타 키(캐릭터를 그리는 곳에 넘김), avatar: 부위별로 나눈 값(꾸미기 창에서 씀)
// chosen: 캐릭터를 한 번이라도 저장했는지 (아직 안 읽었으면 null). false 면 광장에서 고르는 창을 띄움 (#146)
//
// 로비·지점의 내 캐릭터, 내 모습 화면, 캐릭터 고르는 창이 각자 이 훅을 씁니다.
// 한 곳에서 저장하면 announceMyProfileChanged 로 알려, 다른 곳들도 다시 읽습니다.
// 처음 읽기 전에는 model 이 null 입니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게)
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { announceMyProfileChanged, onMyProfileChanged } from './characters'
import { avatarChosen, avatarFromDb, avatarKey, avatarToDb } from '../avatar/avatarLogic'
import type { Avatar } from '../avatar/avatarLogic'

// 한 번 읽은 값은 기억해 둡니다. 화면을 옮겨도 다시 기다리지 않게 합니다.
type Mine = { userId: string; avatar: Avatar; chosen: boolean }
let cached: Mine | null = null

export function useMyAvatar() {
  const { session } = useSession()
  const myId = session?.user.id
  const [result, setResult] = useState<Mine | null>(cached)
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
        cached = { userId: myId, avatar: avatarFromDb(data?.avatar), chosen: error ? true : avatarChosen(data?.avatar) } // 예전 {model} 이면 새 기본 차림. 못 읽었으면 고르는 창을 띄우지 않음
        setResult(cached)
      })
    return () => {
      alive = false
    }
  }, [myId, version])

  // 저장. 성공하면 '', 실패하면 안내문
  const save = useCallback(
    async (avatar: Avatar) => {
      if (!myId) return '로그인이 필요합니다.'
      const checked = avatarFromDb(avatarToDb(avatar)) // 목록에 없는 부품·잘못된 색은 기본값으로
      const { error } = await supabase.from('profiles').update({ avatar: avatarToDb(checked) }).eq('id', myId)
      if (error) return `캐릭터를 바꾸지 못했어요: ${error.message}`
      cached = { userId: myId, avatar: checked, chosen: true }
      setResult(cached)
      announceMyProfileChanged()
      return ''
    },
    [myId],
  )

  const mine = result && result.userId === myId ? result : null
  const avatar = mine?.avatar ?? null
  const model = avatar ? avatarKey(avatar) : null
  return { model, avatar, chosen: mine?.chosen ?? null, save }
}
