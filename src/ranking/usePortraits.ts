// 순위에 오른 사람들의 캐릭터 얼굴 사진 (게시판·순위 창).
//
// 1) 사람 id → 고른 차림(아바타 키)을 avatars 에서 읽어 둡니다(한 번 읽은 사람은 다시 읽지 않음).
// 2) 그 차림의 얼굴 사진을 portraitStore 에 부탁하고(PortraitStudio 가 찍음), 찍히면 다시 그립니다.
// 돌려주는 값: id → 사진(dataURL). 아직이거나 못 찍었으면 그 id 가 없습니다(이니셜로 그림).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { avatarFromDb, avatarKey } from '../avatar/avatarLogic'
import { getPortrait, portraitsVersion, requestPortrait, subscribePortraits } from './portraitStore'

const models = new Map<string, string>() // 사람 id → 아바타 키 (새로고침 전까지 기억)

export function usePortraits(ids: string[]): Record<string, string> {
  const [loaded, setLoaded] = useState(0) // 차림을 새로 읽으면 늘려 다시 그림
  useSyncExternalStore(subscribePortraits, portraitsVersion) // 사진이 찍히면 다시 그림
  const idsText = ids.join(',')

  useEffect(() => {
    const missing = idsText.split(',').filter((id) => id && !models.has(id))
    if (missing.length === 0) return
    let alive = true
    supabase
      .from('avatars')
      .select('id, avatar')
      .in('id', missing)
      .then(({ data, error }) => {
        if (error) {
          console.error('순위 얼굴용 캐릭터를 불러오지 못했습니다:', error.message)
          return
        }
        for (const row of (data ?? []) as { id: string; avatar: unknown }[]) models.set(row.id, avatarKey(avatarFromDb(row.avatar)))
        if (alive) setLoaded((n) => n + 1)
      })
    return () => {
      alive = false
    }
  }, [idsText])

  // 차림을 아는 사람은 사진을 부탁합니다. (이미 찍었거나 줄에 있으면 저장소가 무시)
  useEffect(() => {
    for (const id of idsText.split(',')) {
      const key = models.get(id)
      if (key) requestPortrait(key)
    }
  }, [idsText, loaded])

  const out: Record<string, string> = {}
  for (const id of ids) {
    const key = models.get(id)
    const photo = key ? getPortrait(key) : null
    if (photo) out[id] = photo
  }
  return out
}
