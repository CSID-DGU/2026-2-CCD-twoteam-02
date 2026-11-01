// 내 손글씨 글씨체(profiles.hand_font, 0048)를 읽고 바꿉니다. 정해지면 applyHandFont 로 화면 전체 손글씨에 적용.
//
// 가방(BagLayer, 로그인한 화면 어디서나 깔림)과 플래너 펜 고르기가 같이 씁니다. 같은 값을 보도록 읽은 값은 기억해 두고,
// 한 곳에서 바꾸면 이 파일 안의 알림으로 다른 곳도 따라 바뀝니다.
// (profile/characters.ts 의 announceMyProfileChanged 는 지점의 다른 참여자에게까지 알리므로 쓰지 않음)
// 읽기 실패(0048 실행 전이라 칸이 없을 때 포함)면 기본 글씨로 두고 화면은 그대로입니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { DEFAULT_HAND_FONT, applyHandFont, handFontFromDb } from './handFonts'
import type { HandFontId } from './handFonts'

let cached: { userId: string; font: HandFontId } | null = null
const listeners = new Set<() => void>()
const setCached = (v: { userId: string; font: HandFontId }) => {
  cached = v
  applyHandFont(v.font)
  listeners.forEach((l) => l())
}

export function useHandFont() {
  const { session } = useSession()
  const myId = session?.user.id
  const [, setTick] = useState(0)

  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  useEffect(() => {
    if (!myId || cached?.userId === myId) return
    let alive = true
    supabase
      .from('profiles')
      .select('hand_font')
      .eq('id', myId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('손글씨 글씨체를 불러오지 못했습니다:', error.message)
        setCached({ userId: myId, font: handFontFromDb(data?.hand_font) })
      })
    return () => {
      alive = false
    }
  }, [myId])

  // 저장. 먼저 바꿔 보여 주고, 실패하면 되돌림. 성공하면 '', 실패하면 안내문
  const save = useCallback(
    async (font: HandFontId) => {
      if (!myId) return '로그인이 필요합니다.'
      const c = cached
      const before = c && c.userId === myId ? c.font : DEFAULT_HAND_FONT
      setCached({ userId: myId, font })
      const { error } = await supabase.from('profiles').update({ hand_font: font }).eq('id', myId)
      if (!error) return ''
      console.error('손글씨 글씨체를 저장하지 못했습니다:', error.message)
      setCached({ userId: myId, font: before })
      return '글씨체를 저장하지 못했어요'
    },
    [myId],
  )

  const c = cached
  const font = c && c.userId === myId ? c.font : DEFAULT_HAND_FONT
  return { font, save }
}
